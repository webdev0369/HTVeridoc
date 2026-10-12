import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExportProductMapping } from './entities/export-product-mapping.entity';
import {
  ResolvedExportConnection,
  ExportClientService,
} from './export-client.service';

export interface ProductMatchResult {
  lineItemId: string;
  articleNumber: string | null;
  description: string | null;
  destinationProductId: string | null;
  matchMethod: string | null;
  matched: boolean;
}

@Injectable()
export class ExportProductService {
  constructor(
    private readonly exportClient: ExportClientService,
    @InjectRepository(ExportProductMapping)
    private readonly mappingsRepo: Repository<ExportProductMapping>,
  ) {}

  normalizeArticle(value: string | null | undefined): string {
    return (value ?? '').trim().toLowerCase();
  }

  async findByArticle(
    organizationId: string,
    supplierKey: string,
    articleNumber: string,
  ): Promise<ExportProductMapping | null> {
    if (!articleNumber) return null;

    const withSupplier = await this.mappingsRepo.findOne({
      where: {
        organizationId,
        supplierKey: supplierKey || '',
        articleNumber,
      },
    });
    if (withSupplier) return withSupplier;

    // Fallback: org-level SKU mapping without supplier scope
    if (supplierKey) {
      return this.mappingsRepo.findOne({
        where: { organizationId, supplierKey: '', articleNumber },
      });
    }
    return null;
  }

  async upsertMapping(input: {
    organizationId: string;
    supplierKey: string;
    articleNumber: string;
    sku?: string | null;
    destinationProductId: string;
    matchMethod: string;
  }): Promise<ExportProductMapping> {
    let row = await this.findByArticle(
      input.organizationId,
      input.supplierKey,
      input.articleNumber,
    );
    if (!row) {
      row = this.mappingsRepo.create({
        organizationId: input.organizationId,
        supplierKey: input.supplierKey || '',
        articleNumber: input.articleNumber,
        sku: input.sku ?? null,
        destinationProductId: input.destinationProductId,
        matchMethod: input.matchMethod,
      });
    } else {
      row.destinationProductId = input.destinationProductId;
      row.sku = input.sku ?? row.sku;
      row.matchMethod = input.matchMethod;
    }
    return this.mappingsRepo.save(row);
  }

  /**
   * Sequence: exact supplier+article mapping → SKU/org mapping → live → mock.
   */
  async matchProduct(
    connection: ResolvedExportConnection,
    input: {
      lineItemId: string;
      articleNumber: string | null;
      description: string | null;
      brand: string | null;
      supplierKey: string;
    },
  ): Promise<ProductMatchResult> {
    const article = this.normalizeArticle(input.articleNumber);

    if (!article) {
      return {
        lineItemId: input.lineItemId,
        articleNumber: input.articleNumber,
        description: input.description,
        destinationProductId: null,
        matchMethod: null,
        matched: false,
      };
    }

    const mapped = await this.findByArticle(
      connection.organizationId,
      input.supplierKey,
      article,
    );
    if (mapped) {
      return {
        lineItemId: input.lineItemId,
        articleNumber: input.articleNumber,
        description: input.description,
        destinationProductId: mapped.destinationProductId,
        matchMethod: mapped.matchMethod || 'sku_mapping',
        matched: true,
      };
    }

    if (connection.mode === 'live') {
      try {
        const qs = new URLSearchParams({ articleNumber: article });
        if (input.supplierKey) qs.set('supplierKey', input.supplierKey);
        const remote = await this.exportClient.request<{ id?: string }>(
          connection,
          'GET',
          `/products?${qs.toString()}`,
        );
        if (remote?.id) {
          await this.upsertMapping({
            organizationId: connection.organizationId,
            supplierKey: input.supplierKey,
            articleNumber: article,
            destinationProductId: remote.id,
            matchMethod: 'live_lookup',
          });
          return {
            lineItemId: input.lineItemId,
            articleNumber: input.articleNumber,
            description: input.description,
            destinationProductId: remote.id,
            matchMethod: 'live_lookup',
            matched: true,
          };
        }
      } catch {
        // unmatched
      }
      return {
        lineItemId: input.lineItemId,
        articleNumber: input.articleNumber,
        description: input.description,
        destinationProductId: null,
        matchMethod: null,
        matched: false,
      };
    }

    const mockId = this.exportClient.mockId(
      'product',
      connection.organizationId,
      input.supplierKey,
      article,
    );
    await this.upsertMapping({
      organizationId: connection.organizationId,
      supplierKey: input.supplierKey,
      articleNumber: article,
      destinationProductId: mockId,
      matchMethod: 'exact_supplier_article',
    });

    return {
      lineItemId: input.lineItemId,
      articleNumber: input.articleNumber,
      description: input.description,
      destinationProductId: mockId,
      matchMethod: 'exact_supplier_article',
      matched: true,
    };
  }
}
