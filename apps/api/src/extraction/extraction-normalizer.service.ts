import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  HEADER_FIELD_KEYS,
  HEADER_FIELD_LABELS,
  HeaderFieldKey,
  PoConfirmationExtraction,
} from '../ai/schemas/po-confirmation.schema';
import {
  isDateHeaderField,
  normalizeDateValue,
} from '../common/date-normalize';
import { DocumentType } from '../common/enums';
import { Document } from '../documents/entities/document.entity';
import { FieldCorrectionService } from '../fields/field-correction.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { Extraction } from './entities/extraction.entity';
import { ExtractionField } from './entities/extraction-field.entity';
import { ExtractionLineItem } from './entities/extraction-line-item.entity';
import { ExtractionSource } from './entities/extraction-source.entity';
import { deriveLineUnitFields } from './line-unit-derivation';

interface NormalizedScalar {
  value: string | null;
  confidence: number | null;
  page: number | null;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

@Injectable()
export class ExtractionNormalizerService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly fieldCorrections: FieldCorrectionService,
    private readonly organizations: OrganizationsService,
  ) {}

  async replaceStructuredRows(
    extraction: Extraction,
    data: PoConfirmationExtraction,
  ) {
    const document = await this.dataSource.getRepository(Document).findOne({
      where: { id: extraction.documentId },
    });
    const preferLiters = await this.organizations.preferLitersForVolumeBase(
      extraction.organizationId,
      document?.documentType ?? DocumentType.PURCHASE_ORDER_CONFIRMATION,
    );

    await this.dataSource.transaction(async (manager) => {
      // Remember reviewer edits on this document before wiping rows (reprocess).
      const previousFields = await manager.find(ExtractionField, {
        where: { extractionId: extraction.id },
      });
      const previousEdits = new Map(
        previousFields
          .filter((f) => f.isUserEdited)
          .map((f) => [f.fieldKey, f.currentValue]),
      );

      const previousLines = await manager.find(ExtractionLineItem, {
        where: { extractionId: extraction.id },
      });
      const previousLineEdits = new Map(
        previousLines
          .filter((l) => l.isUserEdited && l.articleNumber)
          .map((l) => [l.articleNumber!.trim().toLowerCase(), l]),
      );

      const document = await manager.findOne(Document, {
        where: { id: extraction.documentId },
      });
      const documentType =
        document?.documentType ?? DocumentType.PURCHASE_ORDER_CONFIRMATION;

      const correctionMap = await this.fieldCorrections.getCorrectionMap(
        extraction.organizationId,
        documentType,
      );

      await manager.delete(ExtractionSource, { extractionId: extraction.id });
      await manager.delete(ExtractionField, { extractionId: extraction.id });
      await manager.delete(ExtractionLineItem, { extractionId: extraction.id });

      const fieldRows: ExtractionField[] = [];
      const sourceRows: ExtractionSource[] = [];

      const customerName = this.normalizeName(
        this.resolveHeaderScalar(data, 'customer.name').value,
      );

      for (const key of HEADER_FIELD_KEYS) {
        let scalar = this.resolveHeaderScalar(data, key);

        // Avoid duplicating Oppdragsgiver into both Customer and Buyer.
        if (
          key === 'buyer.name' &&
          scalar.value &&
          customerName &&
          this.normalizeName(scalar.value) === customerName
        ) {
          scalar = { value: null, confidence: null, page: null, bbox: null };
        }

        const aiValue = scalar.value;
        let currentValue = aiValue;
        let isUserEdited = false;

        // 1) Same-document reprocess: keep the reviewer's saved value
        if (previousEdits.has(key)) {
          currentValue = previousEdits.get(key) ?? null;
          isUserEdited = true;
        } else {
          // 2) Org memory: if AI produced a known-wrong value, apply the fix
          const remembered = this.fieldCorrections.lookup(
            correctionMap,
            key,
            aiValue,
          );
          if (remembered != null) {
            currentValue = remembered;
            isUserEdited = true;
          }
        }

        // Dates: store ISO YYYY-MM-DD; keep AI source bbox for PDF highlight.
        if (isDateHeaderField(key) && currentValue) {
          currentValue = normalizeDateValue(currentValue);
        }

        const field = manager.create(ExtractionField, {
          extractionId: extraction.id,
          fieldKey: key,
          fieldLabel: HEADER_FIELD_LABELS[key],
          originalValue: aiValue,
          currentValue,
          confidence:
            scalar.confidence != null ? String(scalar.confidence) : null,
          isUserEdited,
          sourcePage: scalar.page,
          bboxX: scalar.bbox ? String(scalar.bbox.x) : null,
          bboxY: scalar.bbox ? String(scalar.bbox.y) : null,
          bboxWidth: scalar.bbox ? String(scalar.bbox.width) : null,
          bboxHeight: scalar.bbox ? String(scalar.bbox.height) : null,
        });
        fieldRows.push(field);
      }

      const savedFields = await manager.save(fieldRows);

      for (const field of savedFields) {
        if (field.sourcePage != null) {
          sourceRows.push(
            manager.create(ExtractionSource, {
              extractionId: extraction.id,
              targetType: 'FIELD',
              targetId: field.id,
              fieldKey: field.fieldKey,
              page: field.sourcePage,
              bboxX: field.bboxX,
              bboxY: field.bboxY,
              bboxWidth: field.bboxWidth,
              bboxHeight: field.bboxHeight,
            }),
          );
        }
      }

      const lineRows = (data.lineItems ?? []).map((item, index) => {
        const bbox = item.source?.boundingBox ?? null;
        const articleKey = item.articleNumber?.trim().toLowerCase() ?? '';
        const prior = articleKey
          ? previousLineEdits.get(articleKey)
          : undefined;

        return manager.create(ExtractionLineItem, {
          extractionId: extraction.id,
          sortOrder: index,
          position: item.position ?? null,
          articleNumber: prior?.articleNumber ?? item.articleNumber ?? null,
          description: prior?.description ?? item.description ?? null,
          brand: prior?.brand ?? item.brand ?? null,
          quantity: (() => {
            const purchaseQty =
              prior?.purchaseQuantity ??
              this.num(item.purchaseQuantity) ??
              prior?.quantity ??
              this.num(item.quantity);
            return purchaseQty;
          })(),
          purchaseQuantity: (() => {
            return (
              prior?.purchaseQuantity ??
              this.num(item.purchaseQuantity) ??
              prior?.quantity ??
              this.num(item.quantity)
            );
          })(),
          stockTakingQuantity:
            prior?.stockTakingQuantity ?? this.num(item.stockTakingQuantity),
          packaging: prior?.packaging ?? item.packaging ?? null,
          packageQuantity:
            prior?.packageQuantity ?? this.num(item.packageQuantity),
          unit: prior?.unit ?? item.unit ?? item.purchaseUnit ?? null,
          purchaseUnit:
            prior?.purchaseUnit ?? item.purchaseUnit ?? item.unit ?? null,
          stocktakingUnit: prior?.stocktakingUnit ?? item.stocktakingUnit ?? null,
          stockTakingQuantityPerPurchaseUnit:
            prior?.stockTakingQuantityPerPurchaseUnit ??
            this.num(item.stockTakingQuantityPerPurchaseUnit),
          baseMeasurementUnit:
            prior?.baseMeasurementUnit ?? item.baseMeasurementUnit ?? null,
          baseContentQuantity: prior?.baseContentQuantity ?? null,
          pricePerBaseUnit:
            prior?.pricePerBaseUnit ?? this.num(item.pricePerBaseUnit),
          stockTakingQuantityPerBaseMeasurementUnit:
            prior?.stockTakingQuantityPerBaseMeasurementUnit ??
            this.num(item.stockTakingQuantityPerBaseMeasurementUnit),
          unitPrice: prior?.unitPrice ?? this.num(item.unitPrice),
          stocktakingUnitPrice:
            prior?.stocktakingUnitPrice ?? this.num(item.stocktakingUnitPrice),
          discount: prior?.discount ?? this.num(item.discount),
          vat: prior?.vat ?? this.num(item.vat),
          amount: prior?.amount ?? this.num(item.amount),
          expectedDelivery:
            prior?.expectedDelivery ?? item.expectedDelivery ?? null,
          lineType: prior?.lineType ?? item.lineType ?? 'UNKNOWN',
          confidence:
            item.confidence != null ? String(item.confidence) : null,
          sourcePage: item.source?.page ?? null,
          bboxX: bbox ? String(bbox.x) : null,
          bboxY: bbox ? String(bbox.y) : null,
          bboxWidth: bbox ? String(bbox.width) : null,
          bboxHeight: bbox ? String(bbox.height) : null,
          isUserEdited: Boolean(prior),
        });
      });

      // Derive units from packaging text + qty conversions (same units → factor 1, etc.).
      for (const row of lineRows) {
        const derived = deriveLineUnitFields(
          {
            purchaseUnit: row.purchaseUnit,
            stocktakingUnit: row.stocktakingUnit,
            purchaseQuantity: row.purchaseQuantity,
            stockTakingQuantity: row.stockTakingQuantity,
            packageQuantity: row.packageQuantity,
            stockTakingQuantityPerPurchaseUnit:
              row.stockTakingQuantityPerPurchaseUnit,
            baseMeasurementUnit: row.baseMeasurementUnit,
            baseContentQuantity: row.baseContentQuantity,
            pricePerBaseUnit: row.pricePerBaseUnit,
            stockTakingQuantityPerBaseMeasurementUnit:
              row.stockTakingQuantityPerBaseMeasurementUnit,
            packaging: row.packaging,
          },
          { preferLitersForVolumeBase: preferLiters },
        );
        row.purchaseUnit = derived.purchaseUnit;
        row.stocktakingUnit = derived.stocktakingUnit;
        if (derived.purchaseQuantity != null) {
          row.purchaseQuantity = derived.purchaseQuantity;
          row.quantity = derived.purchaseQuantity;
        }
        if (derived.stockTakingQuantity != null) {
          row.stockTakingQuantity = derived.stockTakingQuantity;
        }
        row.stockTakingQuantityPerPurchaseUnit =
          derived.stockTakingQuantityPerPurchaseUnit;
        row.baseMeasurementUnit = derived.baseMeasurementUnit;
        row.baseContentQuantity = derived.baseContentQuantity;
        row.pricePerBaseUnit = derived.pricePerBaseUnit;
        row.stockTakingQuantityPerBaseMeasurementUnit =
          derived.stockTakingQuantityPerBaseMeasurementUnit;
        if (derived.purchaseUnit && !row.unit) {
          row.unit = derived.purchaseUnit;
        }
      }

      const savedLines = await manager.save(lineRows);
      for (const line of savedLines) {
        if (line.sourcePage != null) {
          sourceRows.push(
            manager.create(ExtractionSource, {
              extractionId: extraction.id,
              targetType: 'LINE_ITEM',
              targetId: line.id,
              fieldKey: null,
              page: line.sourcePage,
              bboxX: line.bboxX,
              bboxY: line.bboxY,
              bboxWidth: line.bboxWidth,
              bboxHeight: line.bboxHeight,
            }),
          );
        }
      }

      if (sourceRows.length) {
        await manager.save(sourceRows);
      }
    });
  }

  private resolveHeaderScalar(
    data: PoConfirmationExtraction,
    key: HeaderFieldKey,
  ): NormalizedScalar {
    if (key === 'supplier.name') {
      return this.fromParty(data.supplier);
    }
    if (key === 'customer.name') {
      return this.fromParty(data.customer);
    }
    if (key === 'buyer.name') {
      return this.fromParty(data.buyer);
    }
    if (key === 'receiver.name') {
      return this.fromParty(data.receiver);
    }

    const raw = (data as unknown as Record<string, unknown>)[key];
    return this.normalizeFlexible(raw);
  }

  private fromParty(
    party: PoConfirmationExtraction['supplier'],
  ): NormalizedScalar {
    if (!party) {
      return { value: null, confidence: null, page: null, bbox: null };
    }
    return {
      value: party.name ?? null,
      confidence: party.confidence ?? null,
      page: party.source?.page ?? null,
      bbox: party.source?.boundingBox ?? null,
    };
  }

  private normalizeFlexible(raw: unknown): NormalizedScalar {
    if (raw == null) {
      return { value: null, confidence: null, page: null, bbox: null };
    }
    if (typeof raw === 'string' || typeof raw === 'number') {
      return {
        value: String(raw),
        confidence: null,
        page: null,
        bbox: null,
      };
    }
    if (typeof raw === 'object') {
      const obj = raw as {
        value?: string | number | null;
        confidence?: number;
        source?: {
          page?: number;
          boundingBox?: {
            x: number;
            y: number;
            width: number;
            height: number;
          } | null;
        } | null;
      };
      return {
        value:
          obj.value === undefined || obj.value === null
            ? null
            : String(obj.value),
        confidence: obj.confidence ?? null,
        page: obj.source?.page ?? null,
        bbox: obj.source?.boundingBox ?? null,
      };
    }
    return { value: null, confidence: null, page: null, bbox: null };
  }

  private num(value: number | null | undefined): string | null {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return null;
    }
    return String(value);
  }

  private normalizeName(value: string | null | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  }
}
