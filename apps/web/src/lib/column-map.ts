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
    column === 'baseContentQuantity' ||
    column === 'pricePerBaseUnit' ||
    column === 'stockTakingQuantityPerBaseMeasurementUnit' ||
    column === 'discount' ||
    column === 'vat' ||
    column === 'amount'
  );
}

export function isUnitLineColumn(column: LineReviewColumn): boolean {
  return (
    column === 'purchaseUnit' ||
    column === 'stocktakingUnit' ||
    column === 'baseMeasurementUnit'
  );
}

export type ColumnMapParseMode = 'numeric' | 'unit' | 'text';

export function columnMapParseMode(
  column: LineReviewColumn,
): ColumnMapParseMode {
  if (isNumericLineColumn(column)) return 'numeric';
  if (isUnitLineColumn(column)) return 'unit';
  return 'text';
}

export function columnMapLabel(column: LineReviewColumn): string {
  return LINE_REVIEW_COLUMN_LABELS[column];
}

/** Normalize a unit token (D, PK, STK, …). */
function normalizeUnitToken(raw: string): string | null {
  const t = raw.trim().toUpperCase().replace(/\.$/, '');
  return t || null;
}

/**
 * Pull a usable cell value from a PDF text snippet.
 * - numeric: "1 D" / "501,72" → "1" / "501.72"
 * - unit: "1 D" / "2,0 ST" / "10PK" → "D" / "ST" / "PK"
 * - text: keep full string
 */
export function parseColumnCellValue(
  raw: string,
  mode: ColumnMapParseMode | boolean,
): string | null {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const parseMode: ColumnMapParseMode =
    typeof mode === 'boolean' ? (mode ? 'numeric' : 'text') : mode;

  if (parseMode === 'text') return text;

  if (parseMode === 'numeric') {
    // "á 20 RLL", "501,72", "1 003,44" → first number as normalized string
    const match = text.match(/-?\d[\d\s]*(?:[.,]\d+)?/);
    if (!match) return null;
    const n = parseLocaleNumber(match[0]);
    return n == null ? null : String(n);
  }

  // unit mode — strip leading qty from combined PDF glyphs like "1 D"
  const qtyThenUnit =
    /^(-?\d+(?:[.,]\d+)?)(?:\s+([A-Za-zæøåÆØÅ.]+)|([A-ZÆØÅ]{1,4}))$/u.exec(
      text,
    );
  if (qtyThenUnit) {
    return normalizeUnitToken(qtyThenUnit[2] || qtyThenUnit[3] || '');
  }

  // Already a bare unit
  if (/^[A-Za-zæøåÆØÅ.]+$/u.test(text)) {
    return normalizeUnitToken(text);
  }

  // "á 12 PK" / trailing unit token
  const parts = text.split(/\s+/);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^[A-Za-zæøåÆØÅ.]+$/u.test(parts[i]) && !/^\d/.test(parts[i])) {
      return normalizeUnitToken(parts[i]);
    }
  }

  return null;
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
  mode: ColumnMapParseMode | boolean,
): ColumnBandValue[] {
  const parseMode: ColumnMapParseMode =
    typeof mode === 'boolean' ? (mode ? 'numeric' : 'text') : mode;
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
    const value = parseColumnCellValue(raw, parseMode);
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

function normalizePdfText(s: string) {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function samePdfLine(a: PdfTextItem, b: PdfTextItem) {
  return Math.abs(b.y - a.y) <= Math.max(a.height, 0.012) * 1.6;
}

/**
 * Y center of a line item on the PDF page (article code / bbox).
 * Used so column-map can skip rows that have no value in the clicked column.
 */
export function findLineAnchorYOnPage(
  pageItems: PdfTextItem[],
  line: ExtractionLineItemDto,
): number | null {
  const hints: string[] = [];
  if (line.articleNumber?.trim()) hints.push(line.articleNumber.trim());
  if (line.description?.trim()) {
    // First few words are enough to find the row without over-matching.
    const head = line.description.trim().split(/\s+/).slice(0, 4).join(' ');
    if (head.length >= 4) hints.push(head);
  }
  if (line.position != null) hints.push(String(line.position));

  const ordered = [...hints].sort((a, b) => b.length - a.length);
  for (const hint of ordered) {
    const needle = normalizePdfText(hint);
    if (!needle || needle.length < 1) continue;

    for (let i = 0; i < pageItems.length; i++) {
      const window: PdfTextItem[] = [pageItems[i]];
      let joined = normalizePdfText(pageItems[i].str);
      if (joined === needle) {
        return pageItems[i].y + pageItems[i].height / 2;
      }
      for (let j = i + 1; j < Math.min(i + 8, pageItems.length); j++) {
        if (!samePdfLine(pageItems[i], pageItems[j])) break;
        window.push(pageItems[j]);
        joined = normalizePdfText(window.map((t) => t.str).join(' '));
        if (joined === needle) {
          const y =
            Math.min(...window.map((t) => t.y)) +
            Math.max(...window.map((t) => t.height)) / 2;
          return y;
        }
        if (joined.length > needle.length + 12) break;
      }
    }
  }

  const box = line.source?.boundingBox;
  if (box) return box.y + box.height / 2;
  return null;
}

function rowMatchThreshold(bandValues: ColumnBandValue[]): number {
  if (bandValues.length < 2) return 0.04;
  const gaps: number[] = [];
  for (let i = 1; i < bandValues.length; i++) {
    const prev = bandValues[i - 1];
    const cur = bandValues[i];
    gaps.push(cur.y - (prev.y + prev.height));
  }
  const positive = gaps.filter((g) => g > 0).sort((a, b) => a - b);
  const median =
    positive.length > 0
      ? positive[Math.floor(positive.length / 2)]
      : 0.02;
  // Half a typical row gap — far enough to ignore empty rows, tight enough
  // to not steal the next row's value.
  return Math.max(0.018, Math.min(0.045, median * 0.55 + 0.01));
}

/**
 * Assign column-band values to line items by PDF row (Y), not by index.
 * Rows with no value in that column stay empty (no shifting).
 * Falls back to sequential zip only when no page text / anchors are available.
 */
export function assignColumnValuesToLines(
  lines: ExtractionLineItemDto[],
  page: number,
  bandValues: ColumnBandValue[],
  getPrevious: (line: ExtractionLineItemDto) => string | null,
  pageItems?: PdfTextItem[],
): ColumnMapAssignment[] {
  const sorted = [...lines].sort((a, b) => a.sortOrder - b.sortOrder);
  const onPage = sorted.filter(
    (l) => l.source?.page == null || l.source.page === page,
  );
  const targets = onPage.length ? onPage : sorted;

  const canMatchByRow =
    Boolean(pageItems?.length) &&
    bandValues.length > 0 &&
    targets.some((l) => findLineAnchorYOnPage(pageItems!, l) != null);

  if (canMatchByRow && pageItems) {
    const threshold = rowMatchThreshold(bandValues);
    const usedBand = new Set<number>();

    // Greedy: process lines top→bottom, pick nearest unused band value in range.
    const withY = targets
      .map((line) => ({
        line,
        y: findLineAnchorYOnPage(pageItems, line),
      }))
      .sort((a, b) => (a.y ?? 999) - (b.y ?? 999));

    const nextById = new Map<string, string | null>();
    for (const { line, y } of withY) {
      if (y == null) {
        nextById.set(line.id, null);
        continue;
      }
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < bandValues.length; i++) {
        if (usedBand.has(i)) continue;
        const by = bandValues[i].y + bandValues[i].height / 2;
        const dist = Math.abs(by - y);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0 && bestDist <= threshold) {
        usedBand.add(bestIdx);
        nextById.set(line.id, bandValues[bestIdx].value);
      } else {
        nextById.set(line.id, null);
      }
    }

    return targets.map((line) => ({
      lineItemId: line.id,
      lineLabel: `Line ${line.position ?? line.sortOrder + 1}`,
      previous: getPrevious(line),
      next: nextById.get(line.id) ?? null,
    }));
  }

  // Fallback: sequential zip (legacy) when we cannot locate rows on the page.
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
