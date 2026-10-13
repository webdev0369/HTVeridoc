import { DocumentStatus } from '../../common/enums';

/** Events other projects can listen for. */
export type HandoffEventType =
  | 'document.extracted'
  | 'document.ready_for_review'
  | 'document.in_review'
  | 'document.approved'
  | 'document.rejected'
  | 'document.extraction_failed'
  | 'document.validation_failed'
  | 'document.exported'
  | 'document.export_failed';

export interface HandoffWebhookPayload {
  event: HandoffEventType;
  occurredAt: string;
  organizationId: string;
  documentId: string;
  status: DocumentStatus;
  documentType: string | null;
  fileName: string | null;
  /** Absolute editor URL when WEB/CORS origin is configured. */
  editorUrl: string | null;
  /** Compact extraction snapshot for order create on their side. */
  extraction: {
    documentNumber: string | null;
    supplierName: string | null;
    currency: string | null;
    fields: Record<string, string | null>;
    lineItems: Array<{
      id: string;
      lineType: string | null;
      articleNumber: string | null;
      description: string | null;
      purchaseQuantity: string | number | null;
      purchaseUnit: string | null;
      stockTakingQuantity: string | number | null;
      stocktakingUnit: string | null;
      stockTakingQuantityPerPurchaseUnit: string | number | null;
      unitPrice: string | number | null;
      amount: string | number | null;
    }>;
  } | null;
}
