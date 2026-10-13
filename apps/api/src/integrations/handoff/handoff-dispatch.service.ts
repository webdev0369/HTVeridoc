import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac } from 'crypto';
import { Repository } from 'typeorm';
import { DocumentStatus } from '../../common/enums';
import { Document } from '../../documents/entities/document.entity';
import { Extraction } from '../../extraction/entities/extraction.entity';
import { ExtractionField } from '../../extraction/entities/extraction-field.entity';
import { ExtractionLineItem } from '../../extraction/entities/extraction-line-item.entity';
import { EditorLinkService } from './editor-link.service';
import {
  HandoffEventType,
  HandoffWebhookPayload,
} from './handoff.types';
import { WebhookEndpointService } from './webhook-endpoint.service';

const STATUS_TO_EVENT: Partial<Record<DocumentStatus, HandoffEventType>> = {
  [DocumentStatus.EXTRACTED]: 'document.extracted',
  [DocumentStatus.READY_FOR_REVIEW]: 'document.ready_for_review',
  [DocumentStatus.IN_REVIEW]: 'document.in_review',
  [DocumentStatus.APPROVED]: 'document.approved',
  [DocumentStatus.REJECTED]: 'document.rejected',
  [DocumentStatus.EXTRACTION_FAILED]: 'document.extraction_failed',
  [DocumentStatus.VALIDATION_FAILED]: 'document.validation_failed',
  [DocumentStatus.EXPORTED]: 'document.exported',
  [DocumentStatus.EXPORT_FAILED]: 'document.export_failed',
};

@Injectable()
export class HandoffDispatchService {
  private readonly logger = new Logger(HandoffDispatchService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly webhooks: WebhookEndpointService,
    private readonly editorLinks: EditorLinkService,
    @InjectRepository(Document)
    private readonly documentsRepo: Repository<Document>,
    @InjectRepository(Extraction)
    private readonly extractionsRepo: Repository<Extraction>,
    @InjectRepository(ExtractionField)
    private readonly fieldsRepo: Repository<ExtractionField>,
    @InjectRepository(ExtractionLineItem)
    private readonly lineItemsRepo: Repository<ExtractionLineItem>,
  ) {}

  /** Fire-and-forget notify for a document status (maps to handoff event). */
  notifyStatus(
    organizationId: string,
    documentId: string,
    status: DocumentStatus,
  ): void {
    const event = STATUS_TO_EVENT[status];
    if (!event) return;
    void this.dispatch(organizationId, documentId, event, status).catch(
      (err) => {
        this.logger.warn(
          `Webhook dispatch failed for ${documentId} (${event}): ${
            err instanceof Error ? err.message : 'unknown'
          }`,
        );
      },
    );
  }

  async dispatch(
    organizationId: string,
    documentId: string,
    event: HandoffEventType,
    status: DocumentStatus,
  ): Promise<void> {
    const endpoint = await this.webhooks.resolveActive(organizationId);
    if (!endpoint) return;

    const document = await this.documentsRepo.findOne({
      where: { id: documentId, organizationId },
    });
    if (!document) return;

    const extraction = await this.buildExtractionSnapshot(documentId);
    const editorUrl = await this.editorLinks.buildPublicEditorUrl(
      organizationId,
      documentId,
    );

    const payload: HandoffWebhookPayload = {
      event,
      occurredAt: new Date().toISOString(),
      organizationId,
      documentId,
      status,
      documentType: document.documentType ?? null,
      fileName: document.fileName ?? null,
      editorUrl,
      extraction,
    };

    const raw = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'HTVeriDoc-Webhook/1.0',
      'X-HTVeriDoc-Event': event,
      'X-HTVeriDoc-Delivery': `${documentId}:${event}:${Date.now()}`,
    };
    if (endpoint.secret) {
      headers['X-HTVeriDoc-Signature'] = createHmac('sha256', endpoint.secret)
        .update(raw)
        .digest('hex');
    }

    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers,
      body: raw,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${text.slice(0, 160)}`);
    }

    this.logger.debug(
      `Webhook ${event} delivered for document ${documentId} → ${endpoint.url}`,
    );
  }

  private async buildExtractionSnapshot(
    documentId: string,
  ): Promise<HandoffWebhookPayload['extraction']> {
    const extraction = await this.extractionsRepo.findOne({
      where: { documentId, status: 'completed' },
      order: { createdAt: 'DESC' },
    });
    if (!extraction) return null;

    const fields = await this.fieldsRepo.find({
      where: { extractionId: extraction.id },
    });
    const lineItems = await this.lineItemsRepo.find({
      where: { extractionId: extraction.id },
      order: { sortOrder: 'ASC' },
    });

    const fieldMap: Record<string, string | null> = {};
    for (const f of fields) {
      fieldMap[f.fieldKey] =
        (f.currentValue ?? f.originalValue)?.trim() || null;
    }

    return {
      documentNumber: fieldMap['documentNumber'] ?? null,
      supplierName: fieldMap['supplier.name'] ?? null,
      currency: fieldMap['currency'] ?? null,
      fields: fieldMap,
      lineItems: lineItems.map((l) => ({
        id: l.id,
        lineType: l.lineType,
        articleNumber: l.articleNumber,
        description: l.description,
        purchaseQuantity: l.purchaseQuantity ?? l.quantity,
        purchaseUnit: l.purchaseUnit ?? l.unit,
        stockTakingQuantity: l.stockTakingQuantity,
        stocktakingUnit: l.stocktakingUnit,
        stockTakingQuantityPerPurchaseUnit:
          l.stockTakingQuantityPerPurchaseUnit,
        unitPrice: l.unitPrice,
        amount: l.amount,
      })),
    };
  }
}
