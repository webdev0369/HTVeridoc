import type { BoundingBox, ExtractionLineItemDto } from '@/lib/types';
import type { HighlightTone } from '@/components/pdf-viewer';
import { parseLocaleNumber } from '@/lib/parse-locale-number';

/** Editable line-item columns, left → right (review / confirm order). */
export const LINE_REVIEW_COLUMNS = [
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
  'pricePerBaseUnit',
  'stockTakingQuantityPerBaseMeasurementUnit',
  'discount',
  'amount',
] as const;

export type LineReviewColumn = (typeof LINE_REVIEW_COLUMNS)[number];

export const LINE_REVIEW_COLUMN_LABELS: Record<LineReviewColumn, string> = {
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
  pricePerBaseUnit: 'Price / base',
  stockTakingQuantityPerBaseMeasurementUnit: 'ST qty / base',
  discount: 'Disc.',
  amount: 'Total amount',
};

export type ReviewSelection =
  | {
      type: 'field';
      id: string;
      label: string;
      value: string | null;
      page: number | null;
      boundingBox?: BoundingBox;
      tone: HighlightTone;
    }
  | {
      type: 'line';
      id: string;
      /** Which cell within the row is active for PDF confirm. */
      column: LineReviewColumn;
      label: string;
      value: string | null;
      page: number | null;
      boundingBox?: BoundingBox;
      tone: HighlightTone;
    }
  | null;

function numStr(value: number | null | undefined): string | null {
  return value == null ? null : String(value);
}

export function getLineColumnValue(
  line: ExtractionLineItemDto,
  column: LineReviewColumn,
): string | null {
  switch (column) {
    case 'articleNumber':
      return line.articleNumber;
    case 'description':
      return line.description;
    case 'purchaseUnit':
      return line.purchaseUnit ?? line.unit;
    case 'purchaseQuantity':
      return numStr(line.purchaseQuantity ?? line.quantity);
    case 'unitPrice':
      return numStr(line.unitPrice);
    case 'stocktakingUnit':
      return line.stocktakingUnit;
    case 'stockTakingQuantity':
      return numStr(line.stockTakingQuantity);
    case 'stocktakingUnitPrice':
      return numStr(line.stocktakingUnitPrice);
    case 'stockTakingQuantityPerPurchaseUnit':
      return numStr(line.stockTakingQuantityPerPurchaseUnit);
    case 'baseMeasurementUnit':
      return line.baseMeasurementUnit;
    case 'pricePerBaseUnit':
      return numStr(line.pricePerBaseUnit);
    case 'stockTakingQuantityPerBaseMeasurementUnit':
      return numStr(line.stockTakingQuantityPerBaseMeasurementUnit);
    case 'discount':
      return numStr(line.discount);
    case 'amount':
      return numStr(line.amount);
  }
}

/** Build a PATCH for one line cell from the PDF popup string. */
export function lineColumnToPatch(
  column: LineReviewColumn,
  raw: string | null,
): Partial<ExtractionLineItemDto> {
  const text = raw?.trim() || null;
  const asNum = (): number | null => parseLocaleNumber(text);

  switch (column) {
    case 'articleNumber':
      return { articleNumber: text };
    case 'description':
      return { description: text };
    case 'purchaseUnit':
      return { purchaseUnit: text, unit: text };
    case 'purchaseQuantity': {
      const n = asNum();
      return { purchaseQuantity: n, quantity: n };
    }
    case 'unitPrice':
      return { unitPrice: asNum() };
    case 'stocktakingUnit':
      return { stocktakingUnit: text };
    case 'stockTakingQuantity':
      return { stockTakingQuantity: asNum() };
    case 'stocktakingUnitPrice':
      return { stocktakingUnitPrice: asNum() };
    case 'stockTakingQuantityPerPurchaseUnit':
      return { stockTakingQuantityPerPurchaseUnit: asNum() };
    case 'baseMeasurementUnit':
      return { baseMeasurementUnit: text };
    case 'pricePerBaseUnit':
      return { pricePerBaseUnit: asNum() };
    case 'stockTakingQuantityPerBaseMeasurementUnit':
      return { stockTakingQuantityPerBaseMeasurementUnit: asNum() };
    case 'discount':
      return { discount: asNum() };
    case 'amount':
      return { amount: asNum() };
  }
}

export function lineSelectionLabel(
  line: ExtractionLineItemDto,
  column: LineReviewColumn,
): string {
  const pos = line.position ?? line.sortOrder + 1;
  return `Line ${pos} · ${LINE_REVIEW_COLUMN_LABELS[column]}`;
}

const BASE_ONLY_COLUMNS: LineReviewColumn[] = [
  'baseMeasurementUnit',
  'pricePerBaseUnit',
];

function normalizeUnitToken(unit: string | null | undefined): string | null {
  if (!unit?.trim()) return null;
  return unit.trim().toUpperCase().replace(/\s+/g, '');
}

/** True when any line has a detected base measurement unit (3rd unit type). */
export function linesHaveBaseMeasurementUnit(
  lines: ExtractionLineItemDto[] | undefined | null,
): boolean {
  return (lines ?? []).some((l) => Boolean(l.baseMeasurementUnit?.trim()));
}

/**
 * True when base unit exists and differs from stocktaking on at least one line
 * (ST qty / base is only meaningful then).
 */
export function linesNeedStocktakingPerBase(
  lines: ExtractionLineItemDto[] | undefined | null,
): boolean {
  return (lines ?? []).some((l) => {
    const base = normalizeUnitToken(l.baseMeasurementUnit);
    const stock = normalizeUnitToken(l.stocktakingUnit);
    return Boolean(base && stock && base !== stock);
  });
}

/** Review / map columns visible for the current line set. */
export function visibleLineReviewColumns(
  lines: ExtractionLineItemDto[] | undefined | null,
): LineReviewColumn[] {
  const showBase = linesHaveBaseMeasurementUnit(lines);
  const showStPerBase = linesNeedStocktakingPerBase(lines);
  return LINE_REVIEW_COLUMNS.filter((col) => {
    if (BASE_ONLY_COLUMNS.includes(col)) return showBase;
    if (col === 'stockTakingQuantityPerBaseMeasurementUnit') {
      return showStPerBase;
    }
    return true;
  });
}
