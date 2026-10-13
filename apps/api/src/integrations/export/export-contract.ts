/**
 * HTVeriDoc ↔ TotalCtrl Live export contract (aligned with Rossum → store-orders).
 *
 * Rossum upload/parse is OCR only. Real PO ingest is:
 *   POST /orders/store-orders  or  POST /partner/v1/orders/schedule
 *
 * TotalCtrl has no global /api/v1 prefix. Sandbox (mode=mock) never hits these URLs.
 *
 * @see docs/export-destination-contract.md
 */
export const EXPORT_CONTRACT_VERSION = '1.1.0';

/** TotalCtrl store-order source: Partner (external systems such as HTVeriDoc). */
export const EXPORT_STORE_ORDER_SOURCE_PARTNER = 4;

export const EXPORT_PATHS = {
  health: '/health',
  healthReady: '/health/ready',
  /** Primary JWT/API create (same body as Rossum parse → create). */
  storeOrders: '/orders/store-orders',
  storeOrder: (id: string) =>
    `/orders/store-orders/${encodeURIComponent(id)}`,
  /** Preferred when the org has Partner OAuth. */
  partnerScheduleOrder: '/partner/v1/orders/schedule',
  /** Optional soft supplier search (UI list) — not a dedicated match API. */
  suppliers: '/suppliers',
} as const;

/** Line shape compatible with TotalCtrl CreateStoreOrderDto / RossumParsedOrderData. */
export interface DestinationStoreOrderProduct {
  name: string | null;
  sku: string | null;
  orderQuantity: number | null;
  pricePerPurchaseUnit: number | null;
  pricePerStockTakingUnit?: number | null;
  purchaseUnitId?: string | null;
  stockTakingUnitId?: string | null;
  stockTakingQuantityPerPurchaseUnit?: number | null;
  baseUnitId?: string | null;
  pricePerBaseUnit?: number | null;
  subtotal?: string | number | null;
  taxRate?: string | null;
  vatRate?: string | null;
}

/** Body posted to create/update a store order at TotalCtrl. */
export interface DestinationStoreOrderPayload {
  supplierId: string | null;
  supplier?: {
    address?: string;
    email?: string;
    phone?: string;
    website?: string;
    bankAccountNumber?: string;
    iban?: string;
    swift?: string;
  };
  number: string | null;
  requestDate?: string;
  deliveryDate?: string;
  inventoryId: string | null;
  receivedDate?: string;
  subtotal?: string | number | null;
  total?: string | number | null;
  vatAmount?: string | number | null;
  vatRate?: string | number | null;
  currency?: string | null;
  storeOrderUserUploadStatusId?: string | null;
  /** 0 OCR, 1 Millum, 2 Manual, 3 Gmail, 4 Partner */
  source: number;
  products: DestinationStoreOrderProduct[];
  meta?: {
    contractVersion: string;
    source: 'htveridoc';
    documentId: string;
  };
}

/** Unwrap TotalCtrl create response `{ orderId }` or interceptor `{ Data: { orderId } }`. */
export function extractDestinationOrderId(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;
  const root = response as Record<string, unknown>;
  if (typeof root.orderId === 'string' && root.orderId) return root.orderId;
  if (typeof root.id === 'string' && root.id) return root.id;
  const data = (root.Data ?? root.data) as Record<string, unknown> | undefined;
  if (data && typeof data === 'object') {
    if (typeof data.orderId === 'string' && data.orderId) return data.orderId;
    if (typeof data.id === 'string' && data.id) return data.id;
  }
  return null;
}
