import { z } from 'zod';

export const LINE_TYPES = [
  'PRODUCT',
  'FEE',
  'NOTE',
  'CANCELLED',
  'UNKNOWN',
] as const;

export type LineType = (typeof LINE_TYPES)[number];

export const HEADER_FIELD_KEYS = [
  'documentNumber',
  'documentDate',
  'orderDate',
  'customerReference',
  'currency',
  'paymentTerms',
  'deliveryTerms',
  'supplier.name',
  'customer.name',
  'buyer.name',
  'receiver.name',
] as const;

export type HeaderFieldKey = (typeof HEADER_FIELD_KEYS)[number];

export const boundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

/** Gemini often emits `"source": null` when a value has no page location. */
export const sourceSchema = z
  .object({
    page: z.number().int().positive(),
    boundingBox: boundingBoxSchema.nullish(),
  })
  .nullish();

/** Header scalar with confidence + source (Rossum-style). */
export const extractedScalarSchema = z.object({
  value: z.union([z.string(), z.number(), z.null()]).optional().default(null),
  confidence: z.number().min(0).max(1).optional(),
  source: sourceSchema,
});

export const partySchema = z.object({
  name: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  source: sourceSchema,
});

export const lineItemSchema = z.object({
  position: z.number().nullable().optional(),
  articleNumber: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  quantity: z.number().nullable().optional(),
  /** Ordered qty in purchaseUnit (preferred over legacy quantity). */
  purchaseQuantity: z.number().nullable().optional(),
  /** Ordered qty in stocktakingUnit when shown separately. */
  stockTakingQuantity: z.number().nullable().optional(),
  packaging: z.string().nullable().optional(),
  packageQuantity: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  purchaseUnit: z.string().nullable().optional(),
  stocktakingUnit: z.string().nullable().optional(),
  stockTakingQuantityPerPurchaseUnit: z.number().nullable().optional(),
  /** Only when clearly printed — never invent. */
  baseMeasurementUnit: z.string().nullable().optional(),
  /** Price per base measurement unit when shown. */
  pricePerBaseUnit: z.number().nullable().optional(),
  /** Stocktaking qty per base unit when stocktaking ≠ base unit. */
  stockTakingQuantityPerBaseMeasurementUnit: z.number().nullable().optional(),
  /** Price per purchase unit (purchase price). */
  unitPrice: z.number().nullable().optional(),
  /** Price per stocktaking unit when shown separately on the document. */
  stocktakingUnitPrice: z.number().nullable().optional(),
  discount: z.number().nullable().optional(),
  amount: z.number().nullable().optional(),
  expectedDelivery: z.string().nullable().optional(),
  lineType: z.enum(LINE_TYPES).default('UNKNOWN'),
  confidence: z.number().min(0).max(1).optional(),
  source: sourceSchema,
});

/**
 * Accept either plain scalars or { value, confidence, source } for header fields.
 * Normalization converts both shapes into structured rows.
 */
const flexibleHeader = z.union([
  z.string(),
  z.number(),
  z.null(),
  extractedScalarSchema,
]);

export const poConfirmationExtractionSchema = z.object({
  documentType: z
    .literal('PURCHASE_ORDER_CONFIRMATION')
    .or(z.string())
    .default('PURCHASE_ORDER_CONFIRMATION'),
  documentNumber: flexibleHeader.optional(),
  documentDate: flexibleHeader.optional(),
  orderDate: flexibleHeader.optional(),
  customerReference: flexibleHeader.optional(),
  currency: flexibleHeader.optional(),
  paymentTerms: flexibleHeader.optional(),
  deliveryTerms: flexibleHeader.optional(),
  supplier: partySchema.nullable().optional(),
  customer: partySchema.nullable().optional(),
  buyer: partySchema.nullable().optional(),
  receiver: partySchema.nullable().optional(),
  lineItems: z
    .array(lineItemSchema)
    .nullable()
    .optional()
    .transform((v) => v ?? []),
});

export type PoConfirmationExtraction = z.infer<
  typeof poConfirmationExtractionSchema
>;

export const EXTRACTION_SCHEMA_VERSION = '1.5.1';

export const HEADER_FIELD_LABELS: Record<HeaderFieldKey, string> = {
  documentNumber: 'Document Number',
  documentDate: 'Document Date',
  orderDate: 'Order Date',
  customerReference: 'Customer Reference',
  currency: 'Currency',
  paymentTerms: 'Payment Terms',
  deliveryTerms: 'Delivery Terms',
  'supplier.name': 'Supplier',
  'customer.name': 'Customer',
  'buyer.name': 'Buyer',
  'receiver.name': 'Receiver',
};
