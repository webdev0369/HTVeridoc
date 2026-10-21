import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExportSupplierMapping } from '@htveridoc/db/integrations/export/entities/export-supplier-mapping.entity';
import {
  ResolvedExportConnection,
  ExportClientService,
} from './export-client.service';
import { EXPORT_PATHS } from './export-contract';

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
      // TotalCtrl addOrGetSupplier accepts UUID or name — no dedicated match API.
      // Soft-search /suppliers when available; otherwise pass the display name.
      try {
        const remote = await this.exportClient.request<{
          id?: string;
          name?: string;
          Data?: Array<{ id?: string; name?: string }>;
          data?: Array<{ id?: string; name?: string }>;
        }>(
          connection,
          'GET',
          `${EXPORT_PATHS.suppliers}?searchText=${encodeURIComponent(displayName!)}&limit=1&offset=0`,
        );
        const rows = remote?.Data ?? remote?.data;
        const first = Array.isArray(rows) ? rows[0] : remote;
        if (first?.id) {
          await this.upsertMapping({
            organizationId: connection.organizationId,
            externalKey,
            destinationSupplierId: first.id,
            destinationSupplierName: first.name ?? displayName,
            matchMethod: 'live_supplier_search',
          });
          return {
            externalKey,
            displayName,
            destinationSupplierId: first.id,
            matchMethod: 'live_supplier_search',
            matched: true,
          };
        }
      } catch {
        // Soft lookup failed — fall through to name-as-supplierId.
      }

      await this.upsertMapping({
        organizationId: connection.organizationId,
        externalKey,
        destinationSupplierId: displayName!,
        destinationSupplierName: displayName,
        matchMethod: 'supplier_name',
      });
      return {
        externalKey,
        displayName,
        destinationSupplierId: displayName,
        matchMethod: 'supplier_name',
        matched: true,
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
