import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiService } from '../ai/ai.service';
import { PoConfirmationExtraction } from '../ai/schemas/po-confirmation.schema';
import { DocumentStatus, DocumentType } from '../common/enums';
import { Document } from '../documents/entities/document.entity';
import { DOCUMENT_TYPE_LABELS } from '../fields/field-catalog';
import { ProcessingLogService } from '../processing/processing-log.service';
import { StorageService } from '../storage/storage.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { HandoffDispatchService } from '../integrations/handoff/handoff-dispatch.service';
import { ValidationService } from '../validation/validation.service';
import { Extraction } from './entities/extraction.entity';
import { ExtractionNormalizerService } from './extraction-normalizer.service';
import { deriveLineUnitFields } from './line-unit-derivation';

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  constructor(
    @InjectRepository(Extraction)
    private readonly extractionsRepo: Repository<Extraction>,
    @InjectRepository(Document)
    private readonly documentsRepo: Repository<Document>,
    private readonly storage: StorageService,
    private readonly aiService: AiService,
    private readonly normalizer: ExtractionNormalizerService,
    private readonly processingLog: ProcessingLogService,
    private readonly organizations: OrganizationsService,
    @Inject(forwardRef(() => ValidationService))
    private readonly validationService: ValidationService,
    private readonly handoff: HandoffDispatchService,
  ) {}

  async processDocument(documentId: string, organizationId: string) {
    const document = await this.documentsRepo.findOne({
      where: { id: documentId },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    if (document.organizationId !== organizationId) {
      throw new ForbiddenException('Document belongs to another organization');
    }

    await this.processingLog.log(
      documentId,
      organizationId,
      'STARTED',
      `Starting extraction for ${document.fileName}`,
      {
        meta: {
          fileName: document.fileName,
          documentType: document.documentType,
          pageCount: document.pageCount,
        },
      },
    );

    document.status = DocumentStatus.PROCESSING;
    await this.documentsRepo.save(document);

    let extraction = await this.extractionsRepo.findOne({
      where: { documentId },
    });
    if (!extraction) {
      extraction = this.extractionsRepo.create({
        documentId,
        organizationId,
        status: 'pending',
      });
    } else {
      extraction.status = 'pending';
      extraction.errorMessage = null;
    }
    await this.extractionsRepo.save(extraction);
    await this.processingLog.log(
      documentId,
      organizationId,
      'RECORD_READY',
      'Extraction record prepared',
    );

    if (
      document.documentType !== DocumentType.PURCHASE_ORDER_CONFIRMATION
    ) {
      const label =
        DOCUMENT_TYPE_LABELS[
          document.documentType as keyof typeof DOCUMENT_TYPE_LABELS
        ] ?? document.documentType;
      const message = `Extraction for ${label} is not available yet. Field settings can still be configured; only Purchase order confirmation is extractable in this version.`;
      extraction.status = 'failed';
      extraction.errorMessage = message;
      await this.extractionsRepo.save(extraction);
      document.status = DocumentStatus.EXTRACTION_FAILED;
      await this.documentsRepo.save(document);
      await this.processingLog.log(
        documentId,
        organizationId,
        'FAILED',
        message,
        { level: 'error', meta: { documentType: document.documentType } },
      );
      return this.getByDocument(organizationId, documentId);
    }

    try {
      await this.processingLog.log(
        documentId,
        organizationId,
        'PDF_LOAD',
        'Reading PDF from storage…',
      );
      const pdfBuffer = await this.storage.readFileBuffer(document.filePath);
      await this.processingLog.log(
        documentId,
        organizationId,
        'PDF_LOADED',
        `PDF loaded (${pdfBuffer.length} bytes)`,
        { meta: { bytes: pdfBuffer.length } },
      );

      const result = await this.aiService.extractAndTrack({
        documentId,
        organizationId,
        documentType: document.documentType,
        pdfBuffer,
        fileName: document.fileName,
        onEvent: async (step, message, options) => {
          await this.processingLog.log(
            documentId,
            organizationId,
            step,
            message,
            options,
          );
        },
      });

      let rawJson: Record<string, unknown>;
      try {
        rawJson = JSON.parse(result.rawText) as Record<string, unknown>;
      } catch {
        rawJson = { text: result.rawText };
      }

      const structured = result.data as PoConfirmationExtraction;

      extraction.status = 'completed';
      extraction.model = result.model;
      extraction.promptVersion = result.promptVersion;
      extraction.schemaVersion = result.schemaVersion;
      extraction.rawResponse = rawJson;
      extraction.structuredData =
        structured as unknown as Record<string, unknown>;
      extraction.processingTimeMs = result.processingTimeMs;
      extraction.errorMessage = null;
      await this.extractionsRepo.save(extraction);

      await this.processingLog.log(
        documentId,
        organizationId,
        'NORMALIZE',
        'Writing structured fields and line items…',
      );
      await this.normalizer.replaceStructuredRows(extraction, structured);
      await this.processingLog.log(
        documentId,
        organizationId,
        'NORMALIZED',
        `Saved ${(structured.lineItems ?? []).length} line items + header fields`,
        {
          level: 'success',
          meta: {
            lineItems: structured.lineItems?.length ?? 0,
            tokens: result.usage.totalTokens,
            estimatedCostUsd: result.usage.estimatedCostUsd,
            processingTimeMs: result.processingTimeMs,
          },
        },
      );

      document.status = DocumentStatus.EXTRACTED;
      await this.documentsRepo.save(document);
      this.handoff.notifyStatus(
        organizationId,
        documentId,
        DocumentStatus.EXTRACTED,
      );

      await this.processingLog.log(
        documentId,
        organizationId,
        'COMPLETED',
        `Extraction completed in ${result.processingTimeMs} ms`,
        {
          level: 'success',
          meta: {
            model: result.model,
            promptVersion: result.promptVersion,
            schemaVersion: result.schemaVersion,
          },
        },
      );

      this.logger.log(
        `Extraction completed for document ${documentId} (schema ${result.schemaVersion})`,
      );

      try {
        await this.validationService.validateDocument(
          documentId,
          organizationId,
        );
      } catch (validationErr) {
        const message =
          validationErr instanceof Error
            ? validationErr.message
            : 'Validation failed';
        this.logger.error(
          `Validation failed for ${documentId}: ${message}`,
        );
        await this.processingLog.log(
          documentId,
          organizationId,
          'VALIDATION_FAILED',
          message,
          { level: 'error' },
        );
        document.status = DocumentStatus.VALIDATION_FAILED;
        await this.documentsRepo.save(document);
        this.handoff.notifyStatus(
          organizationId,
          documentId,
          DocumentStatus.VALIDATION_FAILED,
        );
      }

      return this.getByDocument(organizationId, documentId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed';
      extraction.status = 'failed';
      extraction.errorMessage = message;
      await this.extractionsRepo.save(extraction);

      document.status = DocumentStatus.EXTRACTION_FAILED;
      await this.documentsRepo.save(document);
      this.handoff.notifyStatus(
        organizationId,
        documentId,
        DocumentStatus.EXTRACTION_FAILED,
      );

      await this.processingLog.log(
        documentId,
        organizationId,
        'FAILED',
        message,
        { level: 'error' },
      );

      this.logger.error(`Extraction failed for ${documentId}: ${message}`);
      throw err;
    }
  }

  async getByDocument(
    organizationId: string,
    documentId: string,
    options?: { light?: boolean },
  ) {
    const document = await this.documentsRepo.findOne({
      where: { id: documentId },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    if (document.organizationId !== organizationId) {
      throw new ForbiddenException('Document belongs to another organization');
    }

    const extraction = await this.extractionsRepo.findOne({
      where: { documentId },
      // Skip sources + heavy JSON on edit responses (light mode).
      relations: options?.light
        ? ['fields', 'lineItems']
        : ['fields', 'lineItems', 'sources'],
      order: {
        fields: { fieldKey: 'ASC' },
        lineItems: { sortOrder: 'ASC' },
      },
    });
    if (!extraction) {
      throw new NotFoundException('Extraction not found');
    }
    return this.toDto(extraction, organizationId, document.documentType, options);
  }

  async getEvents(organizationId: string, documentId: string) {
    const document = await this.documentsRepo.findOne({
      where: { id: documentId },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    if (document.organizationId !== organizationId) {
      throw new ForbiddenException('Document belongs to another organization');
    }
    return this.processingLog.listForDocument(organizationId, documentId);
  }

  private async toDto(
    extraction: Extraction,
    organizationId: string,
    documentType: string,
    options?: { light?: boolean },
  ) {
    const preferLiters = await this.organizations.preferLitersForVolumeBase(
      organizationId,
      documentType,
    );
    const lineItems = [...(extraction.lineItems ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    const fields = [...(extraction.fields ?? [])].sort((a, b) =>
      a.fieldKey.localeCompare(b.fieldKey),
    );

    const summary = {
      documentNumber: this.fieldValue(fields, 'documentNumber'),
      documentDate: this.fieldValue(fields, 'documentDate'),
      orderDate: this.fieldValue(fields, 'orderDate'),
      currency: this.fieldValue(fields, 'currency'),
      supplier: this.fieldValue(fields, 'supplier.name'),
      customer: this.fieldValue(fields, 'customer.name'),
      lineItemCount: lineItems.length,
      cancelledLineCount: lineItems.filter((l) => l.lineType === 'CANCELLED')
        .length,
      feeLineCount: lineItems.filter((l) => l.lineType === 'FEE').length,
    };

    return {
      id: extraction.id,
      documentId: extraction.documentId,
      organizationId: extraction.organizationId,
      status: extraction.status,
      model: extraction.model,
      promptVersion: extraction.promptVersion,
      schemaVersion: extraction.schemaVersion,
      structuredData: options?.light ? null : extraction.structuredData,
      rawResponse: options?.light ? null : extraction.rawResponse,
      errorMessage: extraction.errorMessage,
      processingTimeMs: extraction.processingTimeMs,
      summary,
      fields: fields.map((f) => ({
        id: f.id,
        fieldKey: f.fieldKey,
        fieldLabel: f.fieldLabel,
        originalValue: f.originalValue,
        currentValue: f.currentValue,
        confidence: f.confidence != null ? Number(f.confidence) : null,
        isUserEdited: f.isUserEdited,
        source: f.sourcePage
          ? {
              page: f.sourcePage,
              boundingBox:
                f.bboxX != null
                  ? {
                      x: Number(f.bboxX),
                      y: Number(f.bboxY),
                      width: Number(f.bboxWidth),
                      height: Number(f.bboxHeight),
                    }
                  : undefined,
            }
          : null,
      })),
      lineItems: lineItems.map((l) => {
        const derived = deriveLineUnitFields(
          {
            purchaseUnit: l.purchaseUnit,
            stocktakingUnit: l.stocktakingUnit,
            purchaseQuantity: l.purchaseQuantity ?? l.quantity,
            stockTakingQuantity: l.stockTakingQuantity,
            packageQuantity: l.packageQuantity,
            stockTakingQuantityPerPurchaseUnit:
              l.stockTakingQuantityPerPurchaseUnit,
            baseMeasurementUnit: l.baseMeasurementUnit,
            baseContentQuantity: l.baseContentQuantity,
            pricePerBaseUnit: l.pricePerBaseUnit,
            stockTakingQuantityPerBaseMeasurementUnit:
              l.stockTakingQuantityPerBaseMeasurementUnit,
            packaging: l.packaging,
          },
          { preferLitersForVolumeBase: preferLiters },
        );
        const purchaseQuantity =
          derived.purchaseQuantity != null
            ? Number(derived.purchaseQuantity)
            : l.purchaseQuantity != null
              ? Number(l.purchaseQuantity)
              : l.quantity != null
                ? Number(l.quantity)
                : null;
        return {
        id: l.id,
        sortOrder: l.sortOrder,
        position: l.position,
        articleNumber: l.articleNumber,
        description: l.description,
        brand: l.brand,
        quantity: purchaseQuantity,
        purchaseQuantity,
        stockTakingQuantity:
          derived.stockTakingQuantity != null
            ? Number(derived.stockTakingQuantity)
            : l.stockTakingQuantity != null
              ? Number(l.stockTakingQuantity)
              : null,
        packaging: l.packaging,
        packageQuantity:
          l.packageQuantity != null ? Number(l.packageQuantity) : null,
        unit: l.unit ?? derived.purchaseUnit,
        purchaseUnit: derived.purchaseUnit ?? l.purchaseUnit,
        stocktakingUnit: derived.stocktakingUnit ?? l.stocktakingUnit,
        stockTakingQuantityPerPurchaseUnit:
          derived.stockTakingQuantityPerPurchaseUnit != null
            ? Number(derived.stockTakingQuantityPerPurchaseUnit)
            : l.stockTakingQuantityPerPurchaseUnit != null
              ? Number(l.stockTakingQuantityPerPurchaseUnit)
              : null,
        baseMeasurementUnit:
          derived.baseMeasurementUnit ?? l.baseMeasurementUnit,
        baseContentQuantity:
          derived.baseContentQuantity != null
            ? Number(derived.baseContentQuantity)
            : l.baseContentQuantity != null
              ? Number(l.baseContentQuantity)
              : null,
        pricePerBaseUnit:
          derived.pricePerBaseUnit != null
            ? Number(derived.pricePerBaseUnit)
            : l.pricePerBaseUnit != null
              ? Number(l.pricePerBaseUnit)
              : null,
        stockTakingQuantityPerBaseMeasurementUnit:
          derived.stockTakingQuantityPerBaseMeasurementUnit != null
            ? Number(derived.stockTakingQuantityPerBaseMeasurementUnit)
            : l.stockTakingQuantityPerBaseMeasurementUnit != null
              ? Number(l.stockTakingQuantityPerBaseMeasurementUnit)
              : null,
        unitPrice: l.unitPrice != null ? Number(l.unitPrice) : null,
        stocktakingUnitPrice:
          l.stocktakingUnitPrice != null
            ? Number(l.stocktakingUnitPrice)
            : null,
        discount: l.discount != null ? Number(l.discount) : null,
        vat: l.vat != null ? Number(l.vat) : null,
        amount: l.amount != null ? Number(l.amount) : null,
        expectedDelivery: l.expectedDelivery,
        lineType: l.lineType,
        confidence: l.confidence != null ? Number(l.confidence) : null,
        isUserEdited: l.isUserEdited,
        source: l.sourcePage
          ? {
              page: l.sourcePage,
              boundingBox:
                l.bboxX != null
                  ? {
                      x: Number(l.bboxX),
                      y: Number(l.bboxY),
                      width: Number(l.bboxWidth),
                      height: Number(l.bboxHeight),
                    }
                  : undefined,
            }
          : null,
      };
      }),
      sources: (extraction.sources ?? []).map((s) => ({
        id: s.id,
        targetType: s.targetType,
        targetId: s.targetId,
        fieldKey: s.fieldKey,
        page: s.page,
        boundingBox:
          s.bboxX != null
            ? {
                x: Number(s.bboxX),
                y: Number(s.bboxY),
                width: Number(s.bboxWidth),
                height: Number(s.bboxHeight),
              }
            : null,
      })),
      createdAt: extraction.createdAt,
      updatedAt: extraction.updatedAt,
    };
  }

  private fieldValue(
    fields: { fieldKey: string; currentValue: string | null }[],
    key: string,
  ) {
    return fields.find((f) => f.fieldKey === key)?.currentValue ?? null;
  }
}
