import { DocumentType, FieldMode } from '../common/enums';
import {
  HEADER_FIELD_KEYS,
  HEADER_FIELD_LABELS,
  HeaderFieldKey,
} from '../ai/schemas/po-confirmation.schema';

export interface CatalogField {
  fieldKey: string;
  label: string;
  group: string;
  sortOrder: number;
  defaultMode: FieldMode;
}

/**
 * Document types exposed in Settings (UNKNOWN excluded).
 * `PURCHASE_ORDER` remains in the enum / CATALOG for DB/API compatibility
 * but is not listed here — use `PURCHASE_ORDER_CONFIRMATION` (label: Purchase order).
 */
export const CONFIGURABLE_DOCUMENT_TYPES = [
  DocumentType.PURCHASE_ORDER_CONFIRMATION,
  DocumentType.INVOICE,
  DocumentType.CREDIT_NOTE,
  DocumentType.DELIVERY_NOTE,
] as const;

export type ConfigurableDocumentType =
  (typeof CONFIGURABLE_DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<ConfigurableDocumentType, string> = {
  [DocumentType.PURCHASE_ORDER_CONFIRMATION]: 'Purchase order',
  [DocumentType.INVOICE]: 'Invoice',
  [DocumentType.CREDIT_NOTE]: 'Credit note',
  [DocumentType.DELIVERY_NOTE]: 'Delivery note',
};

const PO_CONFIRMATION_GROUPS: Record<HeaderFieldKey, string> = {
  documentNumber: 'Basic information',
  documentDate: 'Basic information',
  orderDate: 'Basic information',
  currency: 'Basic information',
  customerReference: 'Other',
  paymentTerms: 'Other',
  deliveryTerms: 'Other',
  'supplier.name': 'Supplier',
  'customer.name': 'Customer',
  'buyer.name': 'Customer',
  'receiver.name': 'Customer',
};

const PO_CONFIRMATION_DEFAULTS: Record<HeaderFieldKey, FieldMode> = {
  documentNumber: FieldMode.REQUIRED,
  documentDate: FieldMode.OPTIONAL,
  orderDate: FieldMode.OPTIONAL,
  currency: FieldMode.REQUIRED,
  customerReference: FieldMode.OPTIONAL,
  paymentTerms: FieldMode.OPTIONAL,
  deliveryTerms: FieldMode.OPTIONAL,
  'supplier.name': FieldMode.REQUIRED,
  'customer.name': FieldMode.OPTIONAL,
  'buyer.name': FieldMode.IGNORED,
  'receiver.name': FieldMode.IGNORED,
};

function poConfirmationCatalog(): CatalogField[] {
  return HEADER_FIELD_KEYS.map((key, index) => ({
    fieldKey: key,
    label: HEADER_FIELD_LABELS[key],
    group: PO_CONFIRMATION_GROUPS[key],
    sortOrder: index,
    defaultMode: PO_CONFIRMATION_DEFAULTS[key],
  }));
}

/** Minimal shared header catalog for types without extraction yet. */
function minimalPartyCatalog(): CatalogField[] {
  const fields: Array<{
    fieldKey: string;
    label: string;
    group: string;
    defaultMode: FieldMode;
  }> = [
    {
      fieldKey: 'documentNumber',
      label: 'Document Number',
      group: 'Basic information',
      defaultMode: FieldMode.REQUIRED,
    },
    {
      fieldKey: 'documentDate',
      label: 'Document Date',
      group: 'Basic information',
      defaultMode: FieldMode.OPTIONAL,
    },
    {
      fieldKey: 'currency',
      label: 'Currency',
      group: 'Basic information',
      defaultMode: FieldMode.OPTIONAL,
    },
    {
      fieldKey: 'supplier.name',
      label: 'Supplier',
      group: 'Supplier',
      defaultMode: FieldMode.REQUIRED,
    },
    {
      fieldKey: 'customer.name',
      label: 'Customer',
      group: 'Customer',
      defaultMode: FieldMode.OPTIONAL,
    },
    {
      fieldKey: 'buyer.name',
      label: 'Buyer',
      group: 'Customer',
      defaultMode: FieldMode.IGNORED,
    },
    {
      fieldKey: 'receiver.name',
      label: 'Receiver',
      group: 'Customer',
      defaultMode: FieldMode.IGNORED,
    },
    {
      fieldKey: 'paymentTerms',
      label: 'Payment Terms',
      group: 'Other',
      defaultMode: FieldMode.OPTIONAL,
    },
    {
      fieldKey: 'deliveryTerms',
      label: 'Delivery Terms',
      group: 'Other',
      defaultMode: FieldMode.OPTIONAL,
    },
  ];

  return fields.map((f, index) => ({
    ...f,
    sortOrder: index,
  }));
}

const CATALOG: Record<string, CatalogField[]> = {
  [DocumentType.PURCHASE_ORDER_CONFIRMATION]: poConfirmationCatalog(),
  [DocumentType.PURCHASE_ORDER]: minimalPartyCatalog(),
  [DocumentType.INVOICE]: [
    ...minimalPartyCatalog().map((f) =>
      f.fieldKey === 'currency'
        ? { ...f, defaultMode: FieldMode.REQUIRED }
        : f,
    ),
  ],
  [DocumentType.CREDIT_NOTE]: minimalPartyCatalog(),
  [DocumentType.DELIVERY_NOTE]: minimalPartyCatalog().map((f) =>
    f.fieldKey === 'currency'
      ? { ...f, defaultMode: FieldMode.IGNORED }
      : f,
  ),
};

export function getCatalogFields(documentType: DocumentType): CatalogField[] {
  return CATALOG[documentType] ?? [];
}

export function isConfigurableDocumentType(
  value: string,
): value is ConfigurableDocumentType {
  return (CONFIGURABLE_DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function getCatalogFieldKeys(documentType: DocumentType): Set<string> {
  return new Set(getCatalogFields(documentType).map((f) => f.fieldKey));
}
