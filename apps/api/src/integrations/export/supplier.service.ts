import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExportSupplierMapping } from './entities/export-supplier-mapping.entity';
import {
  ResolvedExportConnection,
  ExportClientService,
} from './export-client.service';

export interface SupplierMatchResult {
  externalKey: string;
  displayName: string | null;
  destinationSupplierId: string | null;
  matchMethod: string | null;
  matched: boolean;
}

@Injectable()
export class ExportSupplierService {
  constructor(
    private readonly exportClient: ExportClientService,
    @InjectRepository(ExportSupplierMapping)
    private readonly mappingsRepo: Repository<ExportSupplierMapping>,
  ) {}

  normalizeKey(value: string | null | undefined): string {
    return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  async findMapping(
    organizationId: string,
    externalKey: string,
  ): Promise<ExportSupplierMapping | null> {
    if (!externalKey) return null;
    return this.mappingsRepo.findOne({
      where: { organizationId, externalSupplierKey: externalKey },
    });
  }

  async upsertMapping(input: {
    organizationId: string;
    externalKey: string;
    destinationSupplierId: string;
    destinationSupplierName?: string | null;
    matchMethod: string;
  }): Promise<ExportSupplierMapping> {
    let row = await this.findMapping(input.organizationId, input.externalKey);
    if (!row) {
      row = this.mappingsRepo.create({
        organizationId: input.organizationId,
        externalSupplierKey: input.externalKey,
        destinationSupplierId: input.destinationSupplierId,
        destinationSupplierName: input.destinationSupplierName ?? null,
        matchMethod: input.matchMethod,
      });
    } else {
      row.destinationSupplierId = input.destinationSupplierId;
      row.destinationSupplierName = input.destinationSupplierName ?? null;
      row.matchMethod = input.matchMethod;
    }
    return this.mappingsRepo.save(row);
  }

  /**
   * 1) Saved org mapping  2) live lookup (if configured)  3) mock id
   */
  async matchSupplier(
    connection: ResolvedExportConnection,
    supplierName: string | null,
  ): Promise<SupplierMatchResult> {
    const displayName = supplierName?.trim() || null;
    const externalKey = this.normalizeKey(displayName);

    if (!externalKey) {
      return {
        externalKey: '',
        displayName,
        destinationSupplierId: null,
        matchMethod: null,
        matched: false,
      };
    }

    const mapped = await this.findMapping(
      connection.organizationId,
      externalKey,
    );
    if (mapped) {
      return {
        externalKey,
        displayName,
        destinationSupplierId: mapped.destinationSupplierId,
        matchMethod: mapped.matchMethod || 'supplier_mapping',
        matched: true,
      };
    }

    if (connection.mode === 'live') {
      try {
        const remote = await this.exportClient.request<{
          id?: string;
          name?: string;
        }>(
          connection,
          'GET',
          `/suppliers?name=${encodeURIComponent(displayName!)}`,
        );
        if (remote?.id) {
          await this.upsertMapping({
            organizationId: connection.organizationId,
            externalKey,
            destinationSupplierId: remote.id,
            destinationSupplierName: remote.name ?? displayName,
            matchMethod: 'live_lookup',
          });
          return {
            externalKey,
            displayName,
            destinationSupplierId: remote.id,
            matchMethod: 'live_lookup',
            matched: true,
          };
        }
      } catch {
        // Fall through to unmatched — export may still fail later with a clear error.
      }
      return {
        externalKey,
        displayName,
        destinationSupplierId: null,
        matchMethod: null,
        matched: false,
      };
    }

    // Mock: deterministic id so the same supplier always maps the same way.
    const mockId = this.exportClient.mockId(
      'supplier',
      connection.organizationId,
      externalKey,
    );
    await this.upsertMapping({
      organizationId: connection.organizationId,
      externalKey,
      destinationSupplierId: mockId,
      destinationSupplierName: displayName,
      matchMethod: 'exact_supplier',
    });

    return {
      externalKey,
      displayName,
      destinationSupplierId: mockId,
      matchMethod: 'exact_supplier',
      matched: true,
    };
  }
}
