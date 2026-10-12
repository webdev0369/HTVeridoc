import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Extraction } from '../../extraction/entities/extraction.entity';
import { ExtractionField } from '../../extraction/entities/extraction-field.entity';
import { ExtractionLineItem } from '../../extraction/entities/extraction-line-item.entity';
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
      products.push(
        await this.productService.matchProduct(connection, {
          lineItemId: line.id,
          articleNumber: line.articleNumber,
          description: line.description,
          brand: line.brand,
          supplierKey: supplier.externalKey,
        }),
      );
    }

    const unmatchedProductCount = products.filter((p) => !p.matched).length;
    const readyForExport =
      Boolean(supplier.matched && supplier.destinationSupplierId) &&
      unmatchedProductCount === 0;

    return {
      documentNumber,
      supplier,
      products,
      unmatchedProductCount,
      readyForExport,
    };
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
