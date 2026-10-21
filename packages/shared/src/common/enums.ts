export enum RoleCode {
  ADMIN = 'ADMIN',
  REVIEWER = 'REVIEWER',
  OPERATOR = 'OPERATOR',
  VIEWER = 'VIEWER',
}

export enum PermissionCode {
  DOCUMENT_READ = 'document.read',
  DOCUMENT_CREATE = 'document.create',
  DOCUMENT_EDIT = 'document.edit',
  DOCUMENT_APPROVE = 'document.approve',
  DOCUMENT_REJECT = 'document.reject',
  DOCUMENT_EXPORT = 'document.export',
  QUEUE_READ = 'queue.read',
  QUEUE_MANAGE = 'queue.manage',
  FIELD_READ = 'field.read',
  FIELD_MANAGE = 'field.manage',
  USER_READ = 'user.read',
  USER_MANAGE = 'user.manage',
  INTEGRATION_READ = 'integration.read',
  INTEGRATION_MANAGE = 'integration.manage',
  AUDIT_READ = 'audit.read',
}

export enum DocumentStatus {
  UPLOADED = 'UPLOADED',
  PROCESSING = 'PROCESSING',
  EXTRACTED = 'EXTRACTED',
  VALIDATING = 'VALIDATING',
  READY_FOR_REVIEW = 'READY_FOR_REVIEW',
  IN_REVIEW = 'IN_REVIEW',
  APPROVED = 'APPROVED',
  EXPORTING = 'EXPORTING',
  EXPORTED = 'EXPORTED',
  PROCESSING_FAILED = 'PROCESSING_FAILED',
  EXTRACTION_FAILED = 'EXTRACTION_FAILED',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  EXPORT_FAILED = 'EXPORT_FAILED',
  REJECTED = 'REJECTED',
}

export enum DocumentType {
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  PURCHASE_ORDER_CONFIRMATION = 'PURCHASE_ORDER_CONFIRMATION',
  INVOICE = 'INVOICE',
  CREDIT_NOTE = 'CREDIT_NOTE',
  DELIVERY_NOTE = 'DELIVERY_NOTE',
  UNKNOWN = 'UNKNOWN',
}

/** Per-org field visibility / requirement for review UI + validation. */
export enum FieldMode {
  IGNORED = 'IGNORED',
  OPTIONAL = 'OPTIONAL',
  REQUIRED = 'REQUIRED',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}
