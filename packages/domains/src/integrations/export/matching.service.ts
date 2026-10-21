import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Extraction } from '@htveridoc/db/extraction/entities/extraction.entity';
import { ExtractionField } from '@htveridoc/db/extraction/entities/extraction-field.entity';
import { ExtractionLineItem } from '@htveridoc/db/extraction/entities/extraction-line-item.entity';
import { ExportProductService } from './product.service';
import { ExportSupplierService } from './supplier.service';
import { ResolvedExportConnection } from './export-client.service';
import type { DocumentMatchResult } from './export.types';

@Injectable()
export class ExportMatchingService {
  constructor(
    private readonly supplierService: ExportSupplierService,
    private readonly productService: ExportProductService,
    @InjectRepository(Extraction)
    private readonly extractionsRepo: Repository<Extraction>,
    @InjectRepository(ExtractionField)
    private readonly fieldsRepo: Repository<ExtractionField>,
    @InjectRepository(ExtractionLineItem)
    private readonly lineItemsRepo: Repository<ExtractionLineItem>,
  ) {}

  async matchDocument(
    connection: ResolvedExportConnection,
    documentId: string,
  ): Promise<DocumentMatchResult> {
    const extraction = await this.extractionsRepo.findOne({
      where: {
        documentId,
        organizationId: connection.organizationId,
        status: 'completed',
      },
    });
    if (!extraction) {
      throw new NotFoundException(
        'Completed extraction required before export matching',
      );
    }

    const fields = await this.fieldsRepo.find({
      where: { extractionId: extraction.id },
    });
    const lines = await this.lineItemsRepo.find({
      where: { extractionId: extraction.id },
      order: { sortOrder: 'ASC' },
    });

    const documentNumber = this.fieldValue(fields, 'documentNumber');
    const currency = this.fieldValue(fields, 'currency');
    const supplierName = this.fieldValue(fields, 'supplier.name');

    const supplier = await this.supplierService.matchSupplier(
      connection,
      supplierName,
    );

    const productLines = lines.filter(
      (l) => (l.lineType || 'UNKNOWN').toUpperCase() === 'PRODUCT',
    );

    const products = [];
    for (const line of productLines) {
      const purchaseQty = this.asNumber(
        line.purchaseQuantity ?? line.quantity,
      );
      products.push(
        await this.productService.matchProduct(connection, {
          lineItemId: line.id,
          articleNumber: line.articleNumber,
          description: line.description,
          brand: line.brand,
          supplierKey: supplier.externalKey,
          purchaseQuantity: purchaseQty,
          purchaseUnit: line.purchaseUnit ?? line.unit,
          stockTakingQuantity: this.asNumber(line.stockTakingQuantity),
          stocktakingUnit: line.stocktakingUnit,
          stockTakingQuantityPerPurchaseUnit: this.asNumber(
            line.stockTakingQuantityPerPurchaseUnit,
          ),
          unitPrice: this.asNumber(line.unitPrice),
          amount: this.asNumber(line.amount),
        }),
      );
    }

    const unmatchedProductCount = products.filter((p) => !p.matched).length;
    const readyForExport =
      Boolean(supplier.matched && supplier.destinationSupplierId) &&
      unmatchedProductCount === 0;

    return {
      documentNumber,
      currency,
      supplier,
      products,
      unmatchedProductCount,
      readyForExport,
    };
  }

  private asNumber(
    value: string | number | null | undefined,
  ): number | null {
    if (value == null || value === '') return null;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    let s = String(value).trim().replace(/\s/g, '');
    if (s.includes(',') && s.includes('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
      s = s.replace(',', '.');
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  private fieldValue(
    fields: ExtractionField[],
    key: string,
  ): string | null {
    const field = fields.find((f) => f.fieldKey === key);
    const value = field?.currentValue ?? field?.originalValue ?? null;
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }
}
