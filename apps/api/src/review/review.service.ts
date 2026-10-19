import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentStatus, DocumentType, FieldMode } from '../common/enums';
import { Document } from '../documents/entities/document.entity';
import { DocumentsService } from '../documents/documents.service';
import { ExtractionField } from '../extraction/entities/extraction-field.entity';
import { ExtractionLineItem } from '../extraction/entities/extraction-line-item.entity';
import { Extraction } from '../extraction/entities/extraction.entity';
import { ExtractionService } from '../extraction/extraction.service';
import { FieldConfigService } from '../fields/field-config.service';
import { FieldCorrectionService } from '../fields/field-correction.service';
import { ProcessingLogService } from '../processing/processing-log.service';
import { ValidationService } from '../validation/validation.service';
import { HandoffDispatchService } from '../integrations/handoff/handoff-dispatch.service';
import { deriveLineUnitFields } from '../extraction/line-unit-derivation';
import { OrganizationsService } from '../organizations/organizations.service';
import { BulkUpdateLineColumnDto } from './dto/bulk-update-line-column.dto';
import { CreateLineItemDto } from './dto/create-line-item.dto';
import { UpdateFieldDto } from './dto/update-field.dto';
import { UpdateLineItemDto } from './dto/update-line-item.dto';

const EDITABLE_STATUSES = new Set<DocumentStatus>([
  DocumentStatus.READY_FOR_REVIEW,
  DocumentStatus.IN_REVIEW,
  DocumentStatus.VALIDATION_FAILED,
]);

const REVIEW_START_STATUSES = new Set<DocumentStatus>([
  DocumentStatus.READY_FOR_REVIEW,
  DocumentStatus.VALIDATION_FAILED,
  DocumentStatus.IN_REVIEW,
]);

const DECISION_STATUSES = new Set<DocumentStatus>([
  DocumentStatus.READY_FOR_REVIEW,
  DocumentStatus.IN_REVIEW,
  DocumentStatus.VALIDATION_FAILED,
]);

@Injectable()
export class ReviewService {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly extractionService: ExtractionService,
    private readonly processingLog: ProcessingLogService,
    private readonly fieldConfigService: FieldConfigService,
    private readonly fieldCorrectionService: FieldCorrectionService,
    private readonly validationService: ValidationService,
    private readonly handoff: HandoffDispatchService,
    private readonly organizations: OrganizationsService,
    @InjectRepository(Document)
    private readonly documentsRepo: Repository<Document>,
    @InjectRepository(Extraction)
    private readonly extractionsRepo: Repository<Extraction>,
    @InjectRepository(ExtractionField)
    private readonly fieldsRepo: Repository<ExtractionField>,
    @InjectRepository(ExtractionLineItem)
    private readonly lineItemsRepo: Repository<ExtractionLineItem>,
  ) {}

  async startReview(organizationId: string, documentId: string) {
    const document = await this.getOwned(organizationId, documentId);
    if (!REVIEW_START_STATUSES.has(document.status)) {
      throw new BadRequestException(
        `Cannot start review from status ${document.status}`,
      );
    }

    if (document.status !== DocumentStatus.IN_REVIEW) {
      document.status = DocumentStatus.IN_REVIEW;
      await this.documentsRepo.save(document);
      await this.processingLog.log(
        documentId,
        organizationId,
        'REVIEW_STARTED',
        'Document opened for review',
        { level: 'info' },
      );
      this.handoff.notifyStatus(
        organizationId,
        documentId,
        DocumentStatus.IN_REVIEW,
      );
    }

    return this.documentsService.findOne(organizationId, documentId);
  }

  async approve(organizationId: string, documentId: string) {
    const document = await this.getOwned(organizationId, documentId);
    if (!DECISION_STATUSES.has(document.status)) {
      throw new BadRequestException(
        `Cannot approve document in status ${document.status}`,
      );
    }

    await this.assertRequiredFieldsComplete(organizationId, document);

    const blockers = await this.validationService.collectBlockingErrors(
      organizationId,
      documentId,
    );
    if (blockers.length) {
      throw new BadRequestException(
        `Cannot approve: ${blockers.length} confirmation blocker(s) — ${blockers.slice(0, 3).join('; ')}`,
      );
    }

    document.status = DocumentStatus.APPROVED;
    await this.documentsRepo.save(document);
    await this.validationService.clearErrorsAfterApprove(
      organizationId,
      documentId,
    );
    await this.processingLog.log(
      documentId,
      organizationId,
      'APPROVED',
      'Document approved',
      { level: 'success' },
    );

    // Notify listening systems (webhooks) with status + extraction payload.
    this.handoff.notifyStatus(
      organizationId,
      documentId,
      DocumentStatus.APPROVED,
    );

    return this.documentsService.findOne(organizationId, documentId);
  }

  /**
   * Move an approved/rejected/export document back into review so fields and
   * line items can be edited and confirmed again.
   */
  async reopen(organizationId: string, documentId: string) {
    const document = await this.getOwned(organizationId, documentId);
    if (
      document.status !== DocumentStatus.APPROVED &&
      document.status !== DocumentStatus.REJECTED &&
      document.status !== DocumentStatus.EXPORT_FAILED &&
      document.status !== DocumentStatus.EXPORTED
    ) {
      throw new BadRequestException(
        `Cannot reopen document in status ${document.status}`,
      );
    }

    const previous = document.status;
    document.status = DocumentStatus.IN_REVIEW;
    await this.documentsRepo.save(document);
    await this.processingLog.log(
      documentId,
      organizationId,
      'REVIEW_REOPENED',
      `Document reopened for review (was ${previous})`,
      { level: 'info', meta: { previousStatus: previous } },
    );
    this.handoff.notifyStatus(
      organizationId,
      documentId,
      DocumentStatus.IN_REVIEW,
    );

    return this.documentsService.findOne(organizationId, documentId);
  }

  async reject(
    organizationId: string,
    documentId: string,
    reason?: string,
  ) {
    const document = await this.getOwned(organizationId, documentId);
    if (!DECISION_STATUSES.has(document.status)) {
      throw new BadRequestException(
        `Cannot reject document in status ${document.status}`,
      );
    }

    document.status = DocumentStatus.REJECTED;
    await this.documentsRepo.save(document);
    await this.processingLog.log(
      documentId,
      organizationId,
      'REJECTED',
      reason?.trim() ? `Rejected: ${reason.trim()}` : 'Document rejected',
      {
        level: 'warn',
        meta: reason?.trim() ? { reason: reason.trim() } : undefined,
      },
    );
    this.handoff.notifyStatus(
      organizationId,
      documentId,
      DocumentStatus.REJECTED,
    );

    return this.documentsService.findOne(organizationId, documentId);
  }

  async updateField(
    organizationId: string,
    documentId: string,
    fieldId: string,
    dto: UpdateFieldDto,
  ) {
    const document = await this.getOwned(organizationId, documentId);
    this.assertEditable(document.status);

    const extraction = await this.requireExtraction(documentId);
    const field = await this.fieldsRepo.findOne({
      where: { id: fieldId, extractionId: extraction.id },
    });
    if (!field) {
      throw new NotFoundException('Extraction field not found');
    }

    const previousValue = field.currentValue;
    const fromForMemory = field.originalValue ?? previousValue;

    if (dto.currentValue !== undefined) {
      field.currentValue = dto.currentValue;
    }
    field.isUserEdited = true;
    await this.fieldsRepo.save(field);

    // Bookkeeping off the critical path — UI already advanced optimistically.
    void this.fieldCorrectionService.remember({
      organizationId,
      documentType: document.documentType,
      fieldKey: field.fieldKey,
      fromValue: fromForMemory,
      toValue: field.currentValue,
    });
    void this.ensureInReview(document, organizationId);
    void this.processingLog.log(
      documentId,
      organizationId,
      'FIELD_EDITED',
      `Updated ${field.fieldLabel}`,
      {
        meta: {
          fieldId: field.id,
          fieldKey: field.fieldKey,
          currentValue: field.currentValue,
          rememberedFrom: fromForMemory,
        },
      },
    );

    // Tiny ack — do not reload full extraction on every cell ✓.
    return { ok: true as const };
  }

  async createLineItem(
    organizationId: string,
    documentId: string,
    dto: CreateLineItemDto,
  ) {
    const document = await this.getOwned(organizationId, documentId);
    this.assertEditable(document.status);

    const extraction = await this.requireExtraction(documentId);
    const existing = await this.lineItemsRepo.find({
      where: { extractionId: extraction.id },
      order: { sortOrder: 'DESC' },
      take: 1,
    });
    const nextSort = (existing[0]?.sortOrder ?? -1) + 1;
    const nextPosition =
      existing[0]?.position != null ? existing[0].position + 1 : nextSort + 1;

    const line = this.lineItemsRepo.create({
      extractionId: extraction.id,
      sortOrder: nextSort,
      position: nextPosition,
      articleNumber: dto.articleNumber ?? null,
      description: dto.description ?? null,
      brand: null,
      quantity: dto.purchaseQuantity ?? dto.quantity ?? null,
      purchaseQuantity: dto.purchaseQuantity ?? dto.quantity ?? null,
      stockTakingQuantity: dto.stockTakingQuantity ?? null,
      packaging: null,
      packageQuantity: null,
      unit: dto.unit ?? dto.purchaseUnit ?? null,
      purchaseUnit: dto.purchaseUnit ?? dto.unit ?? null,
      stocktakingUnit: dto.stocktakingUnit ?? null,
      stockTakingQuantityPerPurchaseUnit: null,
      baseMeasurementUnit: null,
      baseContentQuantity: null,
      pricePerBaseUnit: null,
      stockTakingQuantityPerBaseMeasurementUnit: null,
      unitPrice: dto.unitPrice ?? null,
      stocktakingUnitPrice: dto.stocktakingUnitPrice ?? null,
      discount: dto.discount ?? null,
      vat: dto.vat ?? null,
      amount: dto.amount ?? null,
      expectedDelivery: null,
      lineType: dto.lineType ?? 'PRODUCT',
      confidence: null,
      sourcePage: null,
      bboxX: null,
      bboxY: null,
      bboxWidth: null,
      bboxHeight: null,
      isUserEdited: true,
    });
    await this.applyDerivedUnitFields(
      organizationId,
      document.documentType,
      line,
    );
    await this.lineItemsRepo.save(line);

    await this.ensureInReview(document, organizationId);
    await this.processingLog.log(
      documentId,
      organizationId,
      'LINE_ADDED',
      `Added line ${line.position ?? line.sortOrder + 1}`,
      { meta: { lineItemId: line.id } },
    );

    return this.extractionService.getByDocument(organizationId, documentId, {
      light: true,
    });
  }

  async updateLineItem(
    organizationId: string,
    documentId: string,
    lineItemId: string,
    dto: UpdateLineItemDto,
  ) {
    const document = await this.getOwned(organizationId, documentId);
    this.assertEditable(document.status);

    const extraction = await this.requireExtraction(documentId);
    const line = await this.lineItemsRepo.findOne({
      where: { id: lineItemId, extractionId: extraction.id },
    });
    if (!line) {
      throw new NotFoundException('Line item not found');
    }

    const assignString = (
      key: keyof ExtractionLineItem,
      value: string | null | undefined,
    ) => {
      if (value !== undefined) {
        (line as unknown as Record<string, unknown>)[key as string] = value;
      }
    };

    if (dto.position !== undefined) {
      line.position = dto.position;
    }
    assignString('articleNumber', dto.articleNumber);
    assignString('description', dto.description);
    assignString('brand', dto.brand);
    assignString('quantity', dto.quantity);
    assignString('purchaseQuantity', dto.purchaseQuantity);
    assignString('stockTakingQuantity', dto.stockTakingQuantity);
    // Keep legacy quantity in sync when purchase qty is edited.
    if (dto.purchaseQuantity !== undefined && dto.quantity === undefined) {
      assignString('quantity', dto.purchaseQuantity);
    }
    assignString('packaging', dto.packaging);
    assignString('packageQuantity', dto.packageQuantity);
    assignString('unit', dto.unit);
    assignString('purchaseUnit', dto.purchaseUnit);
    assignString('stocktakingUnit', dto.stocktakingUnit);
    assignString(
      'stockTakingQuantityPerPurchaseUnit',
      dto.stockTakingQuantityPerPurchaseUnit,
    );
    assignString('baseMeasurementUnit', dto.baseMeasurementUnit);
    assignString('baseContentQuantity', dto.baseContentQuantity);
    assignString('pricePerBaseUnit', dto.pricePerBaseUnit);
    assignString(
      'stockTakingQuantityPerBaseMeasurementUnit',
      dto.stockTakingQuantityPerBaseMeasurementUnit,
    );
    assignString('unitPrice', dto.unitPrice);
    assignString('stocktakingUnitPrice', dto.stocktakingUnitPrice);
    assignString('discount', dto.discount);
    assignString('vat', dto.vat);
    assignString('amount', dto.amount);
    assignString('expectedDelivery', dto.expectedDelivery);
    if (dto.lineType !== undefined && dto.lineType !== null) {
      line.lineType = dto.lineType;
    }

    // Only re-derive units when qty/packaging/base fields change — not on
    // every cell ✓ (purchase unit "KG" was waiting on this + full reload).
    if (this.dtoNeedsUnitDerivation(dto)) {
      await this.applyDerivedUnitFields(
        organizationId,
        document.documentType,
        line,
      );
    } else if (
      dto.purchaseQuantity !== undefined ||
      (dto.quantity !== undefined && dto.purchaseQuantity === undefined)
    ) {
      if (line.purchaseQuantity != null && line.purchaseQuantity !== '') {
        line.quantity = line.purchaseQuantity;
      }
    }
    line.isUserEdited = true;
    await this.lineItemsRepo.save(line);

    // Non-blocking bookkeeping — UI already advanced optimistically.
    void this.ensureInReview(document, organizationId);
    void this.processingLog.log(
      documentId,
      organizationId,
      'LINE_EDITED',
      `Updated line ${line.position ?? line.sortOrder + 1}`,
      { meta: { lineItemId: line.id } },
    );

    // Tiny ack — skip full extraction reload (was the remaining ✓ delay).
    return { ok: true as const };
  }

  /** True when PATCH touches fields that feed packaging / unit derivation. */
  private dtoNeedsUnitDerivation(dto: UpdateLineItemDto): boolean {
    return (
      dto.packaging !== undefined ||
      dto.packageQuantity !== undefined ||
      dto.purchaseQuantity !== undefined ||
      dto.stockTakingQuantity !== undefined ||
      dto.stockTakingQuantityPerPurchaseUnit !== undefined ||
      dto.baseMeasurementUnit !== undefined ||
      dto.baseContentQuantity !== undefined ||
      dto.pricePerBaseUnit !== undefined ||
      dto.stockTakingQuantityPerBaseMeasurementUnit !== undefined ||
      dto.quantity !== undefined
    );
  }

  async bulkUpdateLineColumn(
    organizationId: string,
    documentId: string,
    dto: BulkUpdateLineColumnDto,
  ) {
    const document = await this.getOwned(organizationId, documentId);
    this.assertEditable(document.status);

    const extraction = await this.requireExtraction(documentId);
    const lines = await this.lineItemsRepo.find({
      where: { extractionId: extraction.id },
    });
    const byId = new Map(lines.map((l) => [l.id, l]));

    let updated = 0;
    for (const row of dto.values) {
      const line = byId.get(row.lineItemId);
      if (!line) continue;
      this.applyLineColumnValue(line, dto.column, row.value ?? null);
      await this.applyDerivedUnitFields(
        organizationId,
        document.documentType,
        line,
      );
      line.isUserEdited = true;
      updated += 1;
    }

    if (updated) {
      await this.lineItemsRepo.save([...byId.values()].filter((l) =>
        dto.values.some((v) => v.lineItemId === l.id),
      ));
    }

    await this.ensureInReview(document, organizationId);
    await this.processingLog.log(
      documentId,
      organizationId,
      'LINE_COLUMN_MAPPED',
      `Mapped column ${dto.column} on ${updated} line(s)`,
      { meta: { column: dto.column, updated } },
    );

    return this.extractionService.getByDocument(organizationId, documentId, {
      light: true,
    });
  }

  private async applyDerivedUnitFields(
    organizationId: string,
    documentType: string,
    line: ExtractionLineItem,
  ) {
    // Keep legacy quantity in sync with purchase qty for validators.
    if (line.purchaseQuantity != null && line.purchaseQuantity !== '') {
      line.quantity = line.purchaseQuantity;
    } else if (line.quantity != null && line.quantity !== '') {
      line.purchaseQuantity = line.quantity;
    }

    const preferLiters = await this.organizations.preferLitersForVolumeBase(
      organizationId,
      documentType,
    );
    const derived = deriveLineUnitFields(
      {
        purchaseUnit: line.purchaseUnit,
        stocktakingUnit: line.stocktakingUnit,
        purchaseQuantity: line.purchaseQuantity,
        stockTakingQuantity: line.stockTakingQuantity,
        packageQuantity: line.packageQuantity,
        stockTakingQuantityPerPurchaseUnit:
          line.stockTakingQuantityPerPurchaseUnit,
        baseMeasurementUnit: line.baseMeasurementUnit,
        baseContentQuantity: line.baseContentQuantity,
        pricePerBaseUnit: line.pricePerBaseUnit,
        stockTakingQuantityPerBaseMeasurementUnit:
          line.stockTakingQuantityPerBaseMeasurementUnit,
        packaging: line.packaging,
      },
      { preferLitersForVolumeBase: preferLiters },
    );
    line.purchaseUnit = derived.purchaseUnit;
    line.stocktakingUnit = derived.stocktakingUnit;
    if (derived.purchaseQuantity != null) {
      line.purchaseQuantity = derived.purchaseQuantity;
      line.quantity = derived.purchaseQuantity;
    }
    if (derived.stockTakingQuantity != null) {
      line.stockTakingQuantity = derived.stockTakingQuantity;
    }
    line.stockTakingQuantityPerPurchaseUnit =
      derived.stockTakingQuantityPerPurchaseUnit;
    line.baseMeasurementUnit = derived.baseMeasurementUnit;
    line.baseContentQuantity = derived.baseContentQuantity;
    line.pricePerBaseUnit = derived.pricePerBaseUnit;
    line.stockTakingQuantityPerBaseMeasurementUnit =
      derived.stockTakingQuantityPerBaseMeasurementUnit;
    if (derived.purchaseUnit && !line.unit) {
      line.unit = derived.purchaseUnit;
    }
  }

  private applyLineColumnValue(
    line: ExtractionLineItem,
    column: BulkUpdateLineColumnDto['column'],
    value: string | null,
  ) {
    const text = value?.trim() || null;
    const asNumString = (): string | null => {
      if (text == null) return null;
      let s = text.replace(/\s/g, '');
      if (s.includes(',') && s.includes('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else if (s.includes(',')) {
        s = s.replace(',', '.');
      }
      const n = Number(s);
      return Number.isFinite(n) ? String(n) : null;
    };

    switch (column) {
      case 'articleNumber':
        line.articleNumber = text;
        break;
      case 'description':
        line.description = text;
        break;
      case 'purchaseUnit':
        line.purchaseUnit = text;
        line.unit = text;
        break;
      case 'purchaseQuantity': {
        const n = asNumString();
        line.purchaseQuantity = n;
        line.quantity = n;
        break;
      }
      case 'unitPrice':
        line.unitPrice = asNumString();
        break;
      case 'stocktakingUnit':
        line.stocktakingUnit = text;
        break;
      case 'stockTakingQuantity':
        line.stockTakingQuantity = asNumString();
        break;
      case 'stocktakingUnitPrice':
        line.stocktakingUnitPrice = asNumString();
        break;
      case 'stockTakingQuantityPerPurchaseUnit':
        line.stockTakingQuantityPerPurchaseUnit = asNumString();
        break;
      case 'baseMeasurementUnit':
        line.baseMeasurementUnit = text;
        break;
      case 'baseContentQuantity':
        line.baseContentQuantity = asNumString();
        break;
      case 'pricePerBaseUnit':
        line.pricePerBaseUnit = asNumString();
        break;
      case 'stockTakingQuantityPerBaseMeasurementUnit':
        line.stockTakingQuantityPerBaseMeasurementUnit = asNumString();
        break;
      case 'discount':
        line.discount = asNumString();
        break;
      case 'vat':
        line.vat = asNumString();
        break;
      case 'amount':
        line.amount = asNumString();
        break;
    }
  }

  async deleteLineItem(
    organizationId: string,
    documentId: string,
    lineItemId: string,
  ) {
    const [document, extraction] = await Promise.all([
      this.getOwned(organizationId, documentId),
      this.requireExtraction(documentId),
    ]);
    this.assertEditable(document.status);

    const result = await this.lineItemsRepo.delete({
      id: lineItemId,
      extractionId: extraction.id,
    });
    if (!result.affected) {
      throw new NotFoundException('Line item not found');
    }

    // Log + status bump in parallel; do not block the delete round-trip longer than needed.
    await Promise.all([
      this.ensureInReview(document, organizationId),
      this.processingLog.log(
        documentId,
        organizationId,
        'LINE_DELETED',
        'Deleted line item',
        { meta: { lineItemId } },
      ),
    ]);

    return this.extractionService.getByDocument(organizationId, documentId, {
      light: true,
    });
  }

  private assertEditable(status: DocumentStatus) {
    if (!EDITABLE_STATUSES.has(status)) {
      throw new BadRequestException(
        `Document is not editable in status ${status}`,
      );
    }
  }

  private async ensureInReview(document: Document, organizationId: string) {
    if (document.status === DocumentStatus.IN_REVIEW) return;
    if (
      document.status === DocumentStatus.READY_FOR_REVIEW ||
      document.status === DocumentStatus.VALIDATION_FAILED
    ) {
      document.status = DocumentStatus.IN_REVIEW;
      await this.documentsRepo.save(document);
      await this.processingLog.log(
        document.id,
        organizationId,
        'REVIEW_STARTED',
        'Review started on first edit',
        { level: 'info' },
      );
      this.handoff.notifyStatus(
        organizationId,
        document.id,
        DocumentStatus.IN_REVIEW,
      );
    }
  }

  private async requireExtraction(documentId: string) {
    const extraction = await this.extractionsRepo.findOne({
      where: { documentId },
    });
    if (!extraction || extraction.status !== 'completed') {
      throw new NotFoundException('Completed extraction not found');
    }
    return extraction;
  }

  private async getOwned(organizationId: string, documentId: string) {
    const document = await this.documentsRepo.findOne({
      where: { id: documentId },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    if (document.organizationId !== organizationId) {
      throw new ForbiddenException('Document belongs to another organization');
    }
    return document;
  }

  private async assertRequiredFieldsComplete(
    organizationId: string,
    document: Document,
  ) {
    const extraction = await this.extractionsRepo.findOne({
      where: { documentId: document.id },
      relations: ['fields', 'lineItems'],
    });
    if (!extraction || extraction.status !== 'completed') {
      throw new BadRequestException('Completed extraction is required to approve');
    }

    const modeMap = await this.fieldConfigService.getModeMap(
      organizationId,
      document.documentType,
    );
    const fieldByKey = new Map(
      (extraction.fields ?? []).map((f) => [f.fieldKey, f]),
    );
    const missing: string[] = [];

    for (const [key, mode] of modeMap) {
      if (mode !== FieldMode.REQUIRED) continue;
      const field = fieldByKey.get(key);
      if (!field?.currentValue?.trim()) {
        missing.push(field?.fieldLabel ?? key);
      }
    }

    if (
      document.documentType === DocumentType.PURCHASE_ORDER_CONFIRMATION &&
      !(extraction.lineItems ?? []).length
    ) {
      missing.push('Line items');
    }

    if (missing.length) {
      throw new BadRequestException(
        `Cannot confirm: required fields incomplete — ${missing.join(', ')}`,
      );
    }
  }
}
