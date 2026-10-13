export type RoleCode = 'ADMIN' | 'REVIEWER' | 'OPERATOR' | 'VIEWER';

export type DocumentStatus =
  | 'UPLOADED'
  | 'PROCESSING'
  | 'EXTRACTED'
  | 'VALIDATING'
  | 'READY_FOR_REVIEW'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'EXPORTING'
  | 'EXPORTED'
  | 'PROCESSING_FAILED'
  | 'EXTRACTION_FAILED'
  | 'VALIDATION_FAILED'
  | 'EXPORT_FAILED'
  | 'REJECTED';

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  organizationId: string;
  role: RoleCode;
  permissions: string[];
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: RoleCode;
  isPrimary: boolean;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: string;
  user: AuthUser;
  organizations?: OrganizationSummary[];
}

export interface MeResponse {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  role: RoleCode;
  permissions: string[];
  organizations: OrganizationSummary[];
}

export interface DocumentDto {
  id: string;
  organizationId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  pageCount: number;
  documentType: string;
  status: DocumentStatus;
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentListResponse {
  items: DocumentDto[];
  total: number;
  page: number;
  limit: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExtractionSourceRef {
  page: number;
  boundingBox?: BoundingBox;
}

export interface ExtractionFieldDto {
  id: string;
  fieldKey: string;
  fieldLabel: string;
  originalValue: string | null;
  currentValue: string | null;
  confidence: number | null;
  isUserEdited: boolean;
  source: ExtractionSourceRef | null;
}

export interface ExtractionLineItemDto {
  id: string;
  sortOrder: number;
  position: number | null;
  articleNumber: string | null;
  description: string | null;
  brand: string | null;
  quantity: number | null;
  purchaseQuantity: number | null;
  stockTakingQuantity: number | null;
  packaging: string | null;
  packageQuantity: number | null;
  unit: string | null;
  purchaseUnit: string | null;
  stocktakingUnit: string | null;
  stockTakingQuantityPerPurchaseUnit: number | null;
  baseMeasurementUnit: string | null;
  /** Content of one stocktaking unit in baseMeasurementUnit (e.g. 0.75 when base is L). */
  baseContentQuantity: number | null;
  pricePerBaseUnit: number | null;
  stockTakingQuantityPerBaseMeasurementUnit: number | null;
  unitPrice: number | null;
  stocktakingUnitPrice: number | null;
  discount: number | null;
  amount: number | null;
  expectedDelivery: string | null;
  lineType: string;
  confidence: number | null;
  isUserEdited: boolean;
  source: ExtractionSourceRef | null;
}

export interface ExtractionDto {
  id: string;
  documentId: string;
  organizationId: string;
  status: 'pending' | 'completed' | 'failed';
  model: string | null;
  promptVersion: string | null;
  schemaVersion: string | null;
  structuredData: Record<string, unknown> | null;
  rawResponse: Record<string, unknown> | null;
  errorMessage: string | null;
  processingTimeMs: number | null;
  summary?: {
    documentNumber: string | null;
    documentDate: string | null;
    orderDate: string | null;
    currency: string | null;
    supplier: string | null;
    customer: string | null;
    lineItemCount: number;
    cancelledLineCount: number;
    feeLineCount: number;
  };
  fields?: ExtractionFieldDto[];
  lineItems?: ExtractionLineItemDto[];
  sources?: Array<{
    id: string;
    targetType: string;
    targetId: string;
    fieldKey: string | null;
    page: number;
    boundingBox: BoundingBox | null;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessResponse {
  documentId: string;
  status: DocumentStatus;
  jobId: string | null;
  mode: 'queue' | 'inline';
  extraction?: ExtractionDto;
}

export interface ValidationErrorDto {
  id: string;
  severity: 'error' | 'warning';
  code: string;
  message: string;
  fieldKey: string | null;
  lineItemId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

export interface ValidationDto {
  id: string;
  documentId: string;
  organizationId: string;
  extractionId: string | null;
  status: 'pending' | 'passed' | 'passed_with_warnings' | 'failed';
  errorCount: number;
  warningCount: number;
  errors: ValidationErrorDto[];
  createdAt: string;
  updatedAt: string;
}

export type FieldMode = 'IGNORED' | 'OPTIONAL' | 'REQUIRED';

/** Feature key: built-in (e.g. normalizeVolumeToLiters) or org-defined camelCase. */
export type LineItemFeature = string;

export interface LineItemColumnConfig {
  mode: FieldMode;
  features: LineItemFeature[];
}

export interface LineItemDocumentConfig {
  columns: Partial<Record<string, LineItemColumnConfig>>;
}

export interface CustomLineItemFeature {
  key: string;
  label: string;
}

export interface OrganizationSettings {
  lineItemConfigByDocumentType: Record<string, LineItemDocumentConfig>;
  customLineItemFeatures?: CustomLineItemFeature[];
}

export interface LineItemCatalogColumn {
  key: string;
  label: string;
}

export interface LineItemCatalogFeature {
  key: string;
  label: string;
  columnKeys: string[];
  builtin?: boolean;
}

export interface LineItemCatalog {
  columns: LineItemCatalogColumn[];
  features: LineItemCatalogFeature[];
}

export interface OrganizationDto {
  id: string;
  name: string;
  slug: string;
  settings: OrganizationSettings;
  lineItemCatalog?: LineItemCatalog;
  createdAt: string;
  updatedAt: string;
}

export type DocumentTypeCode =
  | 'PURCHASE_ORDER'
  | 'PURCHASE_ORDER_CONFIRMATION'
  | 'INVOICE'
  | 'CREDIT_NOTE'
  | 'DELIVERY_NOTE';

export interface FieldConfigItemDto {
  fieldKey: string;
  label: string;
  group: string;
  sortOrder: number;
  mode: FieldMode;
  defaultMode: FieldMode;
}

export interface FieldConfigResponse {
  documentType: DocumentTypeCode | string;
  documentTypeLabel: string;
  fields: FieldConfigItemDto[];
  requiresLineItems: boolean;
}

export interface DocumentTypeOptionDto {
  documentType: DocumentTypeCode | string;
  label: string;
  extractionSupported: boolean;
}

/** Per-org outbound webhook for status handoff to other projects. */
export interface WebhookEndpointDto {
  configured: boolean;
  url: string | null;
  hasSecret: boolean;
  isActive: boolean;
  updatedAt: string | null;
}

export interface EditorLinkDto {
  token: string;
  url: string;
  documentId: string;
  expiresAt: string;
}

/** Public export-destination connection for the current organization (secrets never returned). */
export interface ExportConnectionDto {
  configured: boolean;
  mode: 'mock' | 'live' | null;
  baseUrl: string | null;
  username: string | null;
  hasApiKey: boolean;
  hasPassword: boolean;
  inventoryId: string | null;
  usePartnerSchedule: boolean;
  isActive: boolean;
  updatedAt: string | null;
}

export interface ExportSupplierMatchDto {
  externalKey: string;
  displayName: string | null;
  destinationSupplierId: string | null;
  matchMethod: string | null;
  matched: boolean;
}

export interface ExportProductMatchDto {
  lineItemId: string;
  articleNumber: string | null;
  description: string | null;
  destinationProductId: string | null;
  matchMethod: string | null;
  matched: boolean;
}

export interface DocumentExportMatchPreviewDto {
  configured: boolean;
  connectionMode: 'mock' | 'live' | null;
  connectionActive: boolean;
  message: string | null;
  match: {
    documentNumber: string | null;
    supplier: ExportSupplierMatchDto;
    products: ExportProductMatchDto[];
    unmatchedProductCount: number;
    readyForExport: boolean;
  } | null;
}

export interface DocumentExportStatusDto {
  documentId: string;
  documentStatus: string;
  configured: boolean;
  connectionMode: 'mock' | 'live' | null;
  connectionActive: boolean;
  exportStatus: 'pending' | 'exporting' | 'exported' | 'failed' | null;
  destinationPoId: string | null;
  externalPoNumber: string | null;
  lastError: string | null;
  exportedAt: string | null;
  matchSummary: Record<string, unknown> | null;
}
