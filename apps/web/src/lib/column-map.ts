import type { PdfTextItem } from '@/components/pdf-viewer';
import { parseLocaleNumber } from '@/lib/parse-locale-number';
import {
  LINE_REVIEW_COLUMN_LABELS,
  visibleLineReviewColumns,
  type LineReviewColumn,
} from '@/lib/review-types';
import type { ExtractionLineItemDto } from '@/lib/types';

export function mappableLineColumns(
  lines: ExtractionLineItemDto[] | undefined | null,
): LineReviewColumn[] {
  return visibleLineReviewColumns(lines);
}

export function isNumericLineColumn(column: LineReviewColumn): boolean {
  return (
    column === 'purchaseQuantity' ||
    column === 'unitPrice' ||
    column === 'stockTakingQuantity' ||
    column === 'stocktakingUnitPrice' ||
    column === 'stockTakingQuantityPerPurchaseUnit' ||
    column === 'pricePerBaseUnit' ||
    column === 'stockTakingQuantityPerBaseMeasurementUnit' ||
    column === 'discount' ||
    column === 'amount'
  );
}

export function columnMapLabel(column: LineReviewColumn): string {
  return LINE_REVIEW_COLUMN_LABELS[column];
}

/** Pull a usable cell value from a PDF text snippet. */
export function parseColumnCellValue(
  raw: string,
  numeric: boolean,
): string | null {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (!numeric) return text;

  // "á 20 RLL", "501,72", "1 003,44" → first number as normalized string
  const match = text.match(/-?\d[\d\s]*(?:[.,]\d+)?/);
  if (!match) return null;
  const n = parseLocaleNumber(match[0]);
  return n == null ? null : String(n);
}

export interface ColumnBandValue {
  value: string;
  y: number;
  x: number;
  width: number;
  height: number;
  raw: string;
}

/**
 * Collect values in the same vertical column as the clicked seed text.
 * Ignores text above the click (e.g. header "Fraktfritt over 1500") and
 * stops at large vertical gaps so footer noise is not pulled in.
 */
export function collectColumnBandValues(
  pageItems: PdfTextItem[],
  seed: PdfTextItem,
  numeric: boolean,
): ColumnBandValue[] {
  const seedCx = seed.x + seed.width / 2;
  const tol = Math.max(0.022, Math.min(0.045, seed.width * 1.8));
  // Allow a little slack so the whole seed line is kept, but not header rows above.
  const minY = seed.y - seed.height * 0.75;

  const inBand = pageItems.filter((item) => {
    if (!item.str.trim()) return false;
    if (item.y < minY) return false;
    const cx = item.x + item.width / 2;
    return Math.abs(cx - seedCx) <= tol;
  });

  if (!inBand.length) return [];

  // Cluster into horizontal lines
  const sorted = [...inBand].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: PdfTextItem[][] = [];
  for (const item of sorted) {
    const last = lines[lines.length - 1];
    if (
      last &&
      Math.abs(item.y - last[0].y) <= Math.max(item.height, last[0].height) * 1.4
    ) {
      last.push(item);
    } else {
      lines.push([item]);
    }
  }

  const results: ColumnBandValue[] = [];
  for (const group of lines) {
    group.sort((a, b) => a.x - b.x);
    const raw = group
      .map((g) => g.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const value = parseColumnCellValue(raw, numeric);
    if (!value) continue;

    const minX = Math.min(...group.map((g) => g.x));
    const rowY = Math.min(...group.map((g) => g.y));
    const maxX = Math.max(...group.map((g) => g.x + g.width));
    const maxY = Math.max(...group.map((g) => g.y + g.height));
    results.push({
      value,
      raw,
      y: rowY,
      x: minX,
      width: Math.max(0.004, maxX - minX),
      height: Math.max(0.01, maxY - rowY),
    });
  }

  if (results.length <= 1) return results;

  // Keep the contiguous table cluster that contains the seed — cut at large gaps.
  const seedCenterY = seed.y + seed.height / 2;
  let seedIdx = results.findIndex(
    (r) => seedCenterY >= r.y - 0.002 && seedCenterY <= r.y + r.height + 0.002,
  );
  if (seedIdx < 0) {
    // Nearest row to the click
    seedIdx = results.reduce(
      (best, r, i) =>
        Math.abs(r.y - seed.y) < Math.abs(results[best].y - seed.y) ? i : best,
      0,
    );
  }

  const gaps: number[] = [];
  for (let i = 1; i < results.length; i++) {
    gaps.push(results[i].y - (results[i - 1].y + results[i - 1].height));
  }
  const positiveGaps = gaps.filter((g) => g > 0).sort((a, b) => a - b);
  const medianGap =
    positiveGaps.length > 0
      ? positiveGaps[Math.floor(positiveGaps.length / 2)]
      : 0.02;
  const maxGap = Math.max(0.035, medianGap * 3.5);

  let start = seedIdx;
  while (start > 0 && gaps[start - 1] <= maxGap) start -= 1;
  let end = seedIdx;
  while (end < results.length - 1 && gaps[end] <= maxGap) end += 1;

  return results.slice(start, end + 1);
}

export interface ColumnMapAssignment {
  lineItemId: string;
  lineLabel: string;
  previous: string | null;
  next: string | null;
}

/**
 * Zip column values (top→bottom) with line items.
 * Prefer lines on the same PDF page when available.
 */
export function assignColumnValuesToLines(
  lines: ExtractionLineItemDto[],
  page: number,
  bandValues: ColumnBandValue[],
  getPrevious: (line: ExtractionLineItemDto) => string | null,
): ColumnMapAssignment[] {
  const sorted = [...lines].sort((a, b) => a.sortOrder - b.sortOrder);
  const onPage = sorted.filter(
    (l) => l.source?.page == null || l.source.page === page,
  );
  const targets = onPage.length ? onPage : sorted;

  return targets.map((line, index) => {
    const band = bandValues[index];
    return {
      lineItemId: line.id,
      lineLabel: `Line ${line.position ?? line.sortOrder + 1}`,
      previous: getPrevious(line),
      next: band?.value ?? null,
    };
  });
}
