import type { PdfTextItem } from '@/components/pdf-viewer';
import type { BoundingBox } from '@/lib/types';

/** Fee / delivery / totals — not part of the product name. */
const STOP_LINE =
  /^(forventet\s+levering|miljøvederlag|miljovederlag|environment(al)?\s+fee|moms\b|mva\b|sum\b|total\b|frakt\b)/i;

/** Table / column headers that must never enter the description. */
const HEADER_LINE =
  /^(produktnavn|beskrivelse|artikkel(?:\/beskrivelse)?|art\.?nr\.?|description|item\s*name|varetekst|pos\.?|kvt\.?|pakning|pris|enh\.?|rab\.?|beløp)$/i;

/** New table row starting with Pos + article, e.g. "20 343769". */
const NEW_POS_ARTICLE = /^\d{1,4}\s+\d{3,}/;

function sameVisualLine(a: PdfTextItem, b: PdfTextItem) {
  return Math.abs(b.y - a.y) <= Math.max(a.height, b.height, 0.012) * 1.6;
}

function sameVisualLineY(y: number, height: number, item: PdfTextItem) {
  return Math.abs(item.y - y) <= Math.max(height, item.height, 0.012) * 1.6;
}

function isPosOrArticleToken(str: string) {
  const t = str.trim();
  if (!t) return true;
  if (/^\d{1,3}$/.test(t)) return true;
  if (/^\d{4,}$/.test(t)) return true;
  if (/^\d{4,}(?:\s+\d+)+$/.test(t)) return true;
  return false;
}

function mergeItemBoxes(items: PdfTextItem[]): BoundingBox {
  let minX = items[0].x;
  let minY = items[0].y;
  let maxX = items[0].x + items[0].width;
  let maxY = items[0].y + items[0].height;
  for (let i = 1; i < items.length; i++) {
    minX = Math.min(minX, items[i].x);
    minY = Math.min(minY, items[i].y);
    maxX = Math.max(maxX, items[i].x + items[i].width);
    maxY = Math.max(maxY, items[i].y + items[i].height);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(0.004, maxX - minX),
    height: Math.max(0.01, maxY - minY),
  };
}

function joinLineItems(items: PdfTextItem[]) {
  return [...items]
    .sort((a, b) => a.x - b.x)
    .map((i) => i.str.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function filterLineForDescription(
  rawLine: PdfTextItem[],
  seed: PdfTextItem,
  isSeedLine: boolean,
): PdfTextItem[] {
  const seedLeft = seed.x;
  if (isSeedLine) {
    // Same line: take the clicked fragment and text to its right (full name).
    return rawLine.filter((item) => {
      if (isPosOrArticleToken(item.str) && item.x < seedLeft - 0.005) {
        return false;
      }
      if (item.x >= seedLeft - 0.008) return true;
      if (sameVisualLine(item, seed) && !isPosOrArticleToken(item.str)) {
        return item.x + item.width >= seedLeft - 0.01;
      }
      return false;
    });
  }
  return rawLine.filter(
    (item) => !isPosOrArticleToken(item.str) || item.x >= seedLeft,
  );
}

function shouldStopLine(text: string) {
  const t = text.trim();
  return (
    STOP_LINE.test(t) || HEADER_LINE.test(t) || NEW_POS_ARTICLE.test(t)
  );
}

/** True if this visual row has a Pos/article code to the left of the description band. */
function rowHasCodeToTheLeft(
  pageItems: PdfTextItem[],
  lineY: number,
  lineHeight: number,
  seedLeft: number,
) {
  return pageItems.some((item) => {
    if (!sameVisualLineY(lineY, lineHeight, item)) return false;
    if (item.x >= seedLeft - 0.02) return false;
    return isPosOrArticleToken(item.str);
  });
}

/**
 * Expand a Description PDF click into the product-name block at that click:
 * 1) join glyph fragments on the same visual line (to the right of the click)
 * 2) optionally pull a short continuation below / above (Latin name, etc.)
 *    without grabbing column headers or the previous product row.
 */
export function expandDescriptionPick(
  seed: PdfTextItem,
  pageItems: PdfTextItem[],
): { text: string; box: BoundingBox } {
  const seedLeft = seed.x;
  const bandLeft = seedLeft - 0.015;
  const bandRight = Math.min(0.92, seedLeft + Math.max(0.22, seed.width * 4));
  const maxGap = Math.max(seed.height, 0.012) * 2.2;
  const maxExtraLines = 2;

  const candidates = pageItems.filter((item) => {
    const t = item.str.trim();
    if (!t) return false;
    if (HEADER_LINE.test(t)) return false;
    const left = item.x;
    const cx = item.x + item.width / 2;
    return left >= bandLeft - 0.02 && cx <= bandRight + 0.03;
  });

  if (!candidates.length) {
    return {
      text: seed.str.trim(),
      box: {
        x: seed.x,
        y: seed.y,
        width: seed.width,
        height: seed.height,
      },
    };
  }

  const sorted = [...candidates].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: PdfTextItem[][] = [];
  for (const item of sorted) {
    const last = lines[lines.length - 1];
    if (last && sameVisualLine(last[0], item)) {
      last.push(item);
    } else {
      lines.push([item]);
    }
  }

  const seedLineIdx = lines.findIndex((line) =>
    line.some((i) => i.id === seed.id || sameVisualLine(i, seed)),
  );
  if (seedLineIdx < 0) {
    return {
      text: seed.str.trim(),
      box: {
        x: seed.x,
        y: seed.y,
        width: seed.width,
        height: seed.height,
      },
    };
  }

  const pickedLines: PdfTextItem[][] = [];

  const seedItems = filterLineForDescription(lines[seedLineIdx], seed, true);
  if (seedItems.length) pickedLines.push(seedItems);

  // Walk upward only for tight continuations (e.g. Latin under Norwegian).
  // Stop if the row above looks like another product (has article/pos to the left).
  let lastTop = lines[seedLineIdx][0].y;
  let upCount = 0;
  for (let i = seedLineIdx - 1; i >= 0 && upCount < maxExtraLines; i--) {
    const gap = lastTop - (lines[i][0].y + lines[i][0].height);
    if (gap > maxGap) break;
    if (
      rowHasCodeToTheLeft(
        pageItems,
        lines[i][0].y,
        lines[i][0].height,
        seedLeft,
      )
    ) {
      break;
    }
    const items = filterLineForDescription(lines[i], seed, false);
    if (!items.length) break;
    const text = joinLineItems(items);
    if (!text || shouldStopLine(text)) break;
    pickedLines.unshift(items);
    lastTop = lines[i][0].y;
    upCount += 1;
  }

  // Walk downward (continuation lines under the product name).
  let lastBottom =
    lines[seedLineIdx][0].y + lines[seedLineIdx][0].height;
  let downCount = 0;
  for (
    let i = seedLineIdx + 1;
    i < lines.length && downCount < maxExtraLines;
    i++
  ) {
    const gap = lines[i][0].y - lastBottom;
    if (gap > maxGap) break;
    if (
      rowHasCodeToTheLeft(
        pageItems,
        lines[i][0].y,
        lines[i][0].height,
        seedLeft,
      )
    ) {
      break;
    }
    const items = filterLineForDescription(lines[i], seed, false);
    if (!items.length) break;
    const text = joinLineItems(items);
    if (!text || shouldStopLine(text)) break;
    pickedLines.push(items);
    lastBottom = lines[i][0].y + lines[i][0].height;
    downCount += 1;
  }

  const picked = pickedLines.flat();
  if (!picked.length) {
    return {
      text: seed.str.trim(),
      box: {
        x: seed.x,
        y: seed.y,
        width: seed.width,
        height: seed.height,
      },
    };
  }

  return {
    text: joinLineItems(picked),
    box: mergeItemBoxes(picked),
  };
}

export interface DescriptionBandValue {
  value: string;
  raw: string;
  y: number;
  x: number;
  width: number;
  height: number;
}

/**
 * Map-column helper: one entry per product row in the description column.
 * Uses expandDescriptionPick so multi-line names stay on the correct row
 * (does not treat continuation lines as separate products).
 */
export function collectDescriptionColumnBand(
  pageItems: PdfTextItem[],
  seed: PdfTextItem,
): DescriptionBandValue[] {
  const seedLeft = seed.x;
  const bandLeft = seedLeft - 0.02;
  const bandRight = Math.min(0.92, seedLeft + Math.max(0.28, seed.width * 5));
  const minY = seed.y - seed.height * 0.75;

  const inBand = pageItems.filter((item) => {
    const t = item.str.trim();
    if (!t || HEADER_LINE.test(t)) return false;
    if (item.y + item.height < minY) return false;
    const cx = item.x + item.width / 2;
    return item.x >= bandLeft - 0.02 && cx <= bandRight + 0.04;
  });

  if (!inBand.length) {
    const one = expandDescriptionPick(seed, pageItems);
    if (!one.text.trim()) return [];
    return [
      {
        value: one.text,
        raw: one.text,
        y: one.box.y,
        x: one.box.x,
        width: one.box.width,
        height: one.box.height,
      },
    ];
  }

  const sorted = [...inBand].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: PdfTextItem[][] = [];
  for (const item of sorted) {
    const last = lines[lines.length - 1];
    if (last && sameVisualLine(last[0], item)) {
      last.push(item);
    } else {
      lines.push([item]);
    }
  }

  const results: DescriptionBandValue[] = [];
  const seenY = new Set<number>();

  for (const line of lines) {
    line.sort((a, b) => a.x - b.x);
    const lineY = line[0].y;
    const lineH = line[0].height;

    // Only start a new product on rows that have Varenr / article to the left.
    // Continuation lines (Latin name, size) are pulled in by expand below.
    if (!rowHasCodeToTheLeft(pageItems, lineY, lineH, seedLeft)) {
      continue;
    }

    const nameSeed =
      line.find((item) => !isPosOrArticleToken(item.str)) ?? line[0];
    const expanded = expandDescriptionPick(nameSeed, pageItems);
    const text = expanded.text.trim();
    if (!text || shouldStopLine(text)) continue;

    // Dedupe if expand collapsed two visual lines into one box.
    const yKey = Math.round(expanded.box.y * 1000);
    if (seenY.has(yKey)) continue;
    seenY.add(yKey);

    results.push({
      value: text,
      raw: text,
      y: expanded.box.y,
      x: expanded.box.x,
      width: expanded.box.width,
      height: expanded.box.height,
    });
  }

  if (!results.length) {
    const one = expandDescriptionPick(seed, pageItems);
    if (!one.text.trim()) return [];
    return [
      {
        value: one.text,
        raw: one.text,
        y: one.box.y,
        x: one.box.x,
        width: one.box.width,
        height: one.box.height,
      },
    ];
  }

  if (results.length <= 1) return results;

  // Keep contiguous cluster around the clicked seed.
  const seedCenterY = seed.y + seed.height / 2;
  let seedIdx = results.findIndex(
    (r) =>
      seedCenterY >= r.y - 0.004 &&
      seedCenterY <= r.y + r.height + 0.004,
  );
  if (seedIdx < 0) {
    seedIdx = results.reduce(
      (best, r, i) =>
        Math.abs(r.y + r.height / 2 - seedCenterY) <
        Math.abs(results[best].y + results[best].height / 2 - seedCenterY)
          ? i
          : best,
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
      : 0.025;
  const maxGap = Math.max(0.04, medianGap * 3.5);

  let start = seedIdx;
  while (start > 0 && gaps[start - 1] <= maxGap) start -= 1;
  let end = seedIdx;
  while (end < results.length - 1 && gaps[end] <= maxGap) end += 1;

  return results.slice(start, end + 1);
}
