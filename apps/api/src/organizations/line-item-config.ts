import { FieldMode } from '../common/enums';

/** Known line-item column keys (aligned with review table). */
export const LINE_ITEM_COLUMN_KEYS = [
  'articleNumber',
  'description',
  'purchaseUnit',
  'purchaseQuantity',
  'unitPrice',
  'stocktakingUnit',
  'stockTakingQuantity',
  'stocktakingUnitPrice',
  'stockTakingQuantityPerPurchaseUnit',
  'baseMeasurementUnit',
  'baseContentQuantity',
  'pricePerBaseUnit',
  'stockTakingQuantityPerBaseMeasurementUnit',
  'discount',
  'amount',
] as const;

export type LineItemColumnKey = (typeof LINE_ITEM_COLUMN_KEYS)[number];

export const LINE_ITEM_COLUMN_LABELS: Record<LineItemColumnKey, string> = {
  articleNumber: 'Item code',
  description: 'Description',
  purchaseUnit: 'Purchase unit',
  purchaseQuantity: 'Purchase qty',
  unitPrice: 'Purchase price',
  stocktakingUnit: 'Stocktaking unit',
  stockTakingQuantity: 'Stocktaking qty',
  stocktakingUnitPrice: 'Stocktaking price',
  stockTakingQuantityPerPurchaseUnit: 'ST qty / PU',
  baseMeasurementUnit: 'Base unit',
  baseContentQuantity: 'Content / ST',
  pricePerBaseUnit: 'Price / base',
  stockTakingQuantityPerBaseMeasurementUnit: 'ST qty / base',
  discount: 'Disc.',
  amount: 'Total amount',
};

/** Built-in features with extraction/runtime behavior. */
export const BUILTIN_LINE_ITEM_FEATURES = ['normalizeVolumeToLiters'] as const;

export type BuiltinLineItemFeature =
  (typeof BUILTIN_LINE_ITEM_FEATURES)[number];

export const BUILTIN_LINE_ITEM_FEATURE_LABELS: Record<
  BuiltinLineItemFeature,
  string
> = {
  normalizeVolumeToLiters: 'Normalize volume to L',
};

/** Columns that may host each built-in feature. */
export const BUILTIN_LINE_ITEM_FEATURE_COLUMNS: Record<
  BuiltinLineItemFeature,
  LineItemColumnKey[]
> = {
  normalizeVolumeToLiters: ['baseMeasurementUnit', 'baseContentQuantity'],
};

/** Org-defined feature (label only for now; runtime hooks can come later). */
export interface CustomLineItemFeature {
  key: string;
  label: string;
}

export interface LineItemColumnConfig {
  mode: FieldMode;
  /** Built-in and/or custom feature keys. */
  features: string[];
}

export interface LineItemDocumentConfig {
  columns: Partial<Record<LineItemColumnKey, LineItemColumnConfig>>;
}

export function isLineItemColumnKey(value: string): value is LineItemColumnKey {
  return (LINE_ITEM_COLUMN_KEYS as readonly string[]).includes(value);
}

export function isBuiltinLineItemFeature(
  value: string,
): value is BuiltinLineItemFeature {
  return (BUILTIN_LINE_ITEM_FEATURES as readonly string[]).includes(value);
}

export function isValidCustomFeatureKey(value: string): boolean {
  return /^[a-z][a-zA-Z0-9]{1,63}$/.test(value);
}

export function slugifyFeatureLabel(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w, i) =>
      i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join('');
  if (!base) return 'customFeature';
  return base.charAt(0).match(/[a-z]/) ? base : `f${base}`;
}

export function defaultLineItemDocumentConfig(): LineItemDocumentConfig {
  const columns: LineItemDocumentConfig['columns'] = {};
  for (const key of LINE_ITEM_COLUMN_KEYS) {
    columns[key] = { mode: FieldMode.OPTIONAL, features: [] };
  }
  return { columns };
}

export function hasNormalizeVolumeToLiters(
  config: LineItemDocumentConfig | undefined | null,
): boolean {
  if (!config?.columns) return false;
  for (const key of BUILTIN_LINE_ITEM_FEATURE_COLUMNS.normalizeVolumeToLiters) {
    const features = config.columns[key]?.features ?? [];
    if (features.includes('normalizeVolumeToLiters')) return true;
  }
  return false;
}

export function setNormalizeVolumeToLiters(
  config: LineItemDocumentConfig,
  enabled: boolean,
): LineItemDocumentConfig {
  const next = {
    columns: { ...config.columns },
  } as LineItemDocumentConfig;

  for (const key of BUILTIN_LINE_ITEM_FEATURE_COLUMNS.normalizeVolumeToLiters) {
    const existing = next.columns[key] ?? {
      mode: FieldMode.OPTIONAL,
      features: [],
    };
    const features = new Set(existing.features ?? []);
    if (enabled) features.add('normalizeVolumeToLiters');
    else features.delete('normalizeVolumeToLiters');
    next.columns[key] = {
      mode: existing.mode ?? FieldMode.OPTIONAL,
      features: [...features],
    };
  }
  return next;
}

export function allowedColumnsForFeature(
  featureKey: string,
  customFeatures: CustomLineItemFeature[],
): LineItemColumnKey[] | 'all' {
  if (isBuiltinLineItemFeature(featureKey)) {
    return BUILTIN_LINE_ITEM_FEATURE_COLUMNS[featureKey];
  }
  if (customFeatures.some((f) => f.key === featureKey)) {
    return 'all';
  }
  return [];
}
