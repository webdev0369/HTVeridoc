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

/**
 * Qty / pack / unit / price / amount cells on the same visual row as the
 * product name — must not enter description text or the highlight box.
 * (Bare integers like "7" in "7kg" stay allowed; column gaps stop those.)
 */
const OTHER_COLUMN_TOKEN =
  /^(?:-?\d{1,3}(?:[.\s]\d{3})+[.,]\d{2}|-?\d+[.,]\d{2}|\d{1,3}%|PK|STK?|KRT|CS|FL|EA|PCE|PCS|BOX|CSE|SKK|RLL|POS|ENH|D|%|NOK|EUR|SEK|DKK|CHF|GBP|USD)$/i;

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

/** True for clear table cells to the right of Artikkelbeskrivelse. */
function isOtherColumnToken(str: string) {
  const t = str.trim();
  if (!t) return true;
  if (OTHER_COLUMN_TOKEN.test(t)) return true;
  // Glued qty+pack unit only (not "57cm" / "7kg" product sizes).
  if (/^\d{1,6}([.,]\d{1,3})?(PK|STK?|KRT|CS|FL|EA|PCE|PCS|BOX|D)$/i.test(t)) {
    return true;
  }
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
  const sorted = [...rawLine].sort((a, b) => a.x - b.x);

  if (isSeedLine) {
    // Same line: product-name tokens only — stop before qty/price columns.
    const out: PdfTextItem[] = [];
    let passedSeed = false;
    for (const item of sorted) {
      const t = item.str.trim();
      if (!t || HEADER_LINE.test(t)) {
        if (passedSeed) break;
        continue;
      }
      if (isPosOrArticleToken(t) && item.x < seedLeft - 0.005) continue;
      if (isOtherColumnToken(t)) {
        // Reached Kvt / Pakning / Pris / Beløp — end of description band.
        if (passedSeed || item.x >= seedLeft - 0.008) break;
        continue;
      }
      const overlapsSeed =
        item.x >= seedLeft - 0.008 ||
        (sameVisualLine(item, seed) &&
          !isPosOrArticleToken(t) &&
          item.x + item.width >= seedLeft - 0.01);
      if (!overlapsSeed && !passedSeed) continue;

      // Column gap before a bare number ⇒ qty column, not "7kg" size text.
      if (passedSeed && out.length && /^\d{1,5}$/.test(t)) {
        const prev = out[out.length - 1];
        const gap = item.x - (prev.x + prev.width);
        if (gap > Math.max(0.018, prev.height * 1.8)) break;
      }

      out.push(item);
      passedSeed = true;
    }
    return out;
  }

  return sorted.filter((item) => {
    const t = item.str.trim();
    if (!t || HEADER_LINE.test(t) || isOtherColumnToken(t)) return false;
    if (isPosOrArticleToken(t) && item.x < seedLeft) return false;
    return true;
  });
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

function normalizeArticle(s: string) {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Longest article-like hint (prefer item code over short Pos). */
function primaryArticleHint(hints: string[] | null | undefined): string | null {
  const ranked = (hints ?? [])
    .map((h) => h.trim())
    .filter((h) => h.length >= 3)
    .sort((a, b) => b.length - a.length);
  return ranked[0] ?? null;
}

function findArticleItem(
  pageItems: PdfTextItem[],
  article: string,
): PdfTextItem | null {
  const needle = normalizeArticle(article);
  if (!needle) return null;
  for (const item of pageItems) {
    if (normalizeArticle(item.str) === needle) return item;
  }
  // Split codes e.g. "8950 07"
  for (let i = 0; i < pageItems.length; i++) {
    const window: PdfTextItem[] = [pageItems[i]];
    let joined = normalizeArticle(pageItems[i].str);
    if (joined === needle) return pageItems[i];
    for (let j = i + 1; j < Math.min(i + 6, pageItems.length); j++) {
      if (!sameVisualLine(pageItems[i], pageItems[j])) break;
      window.push(pageItems[j]);
      joined = normalizeArticle(window.map((t) => t.str).join(' '));
      if (joined === needle) return pageItems[i];
      if (joined.length > needle.length + 8) break;
    }
  }
  return null;
}

/** First non-code text token to the right of the article on that row. */
export function descriptionSeedOnArticleRow(
  pageItems: PdfTextItem[],
  articleHints: string[] | null | undefined,
): PdfTextItem | null {
  const article = primaryArticleHint(articleHints);
  if (!article) return null;
  const anchor = findArticleItem(pageItems, article);
  if (!anchor) return null;
  const onRow = pageItems
    .filter(
      (item) =>
        sameVisualLine(anchor, item) &&
        item.x > anchor.x + 0.002 &&
        !isPosOrArticleToken(item.str) &&
        !isOtherColumnToken(item.str) &&
        item.str.trim() &&
        !HEADER_LINE.test(item.str.trim()),
    )
    .sort((a, b) => a.x - b.x);
  return onRow[0] ?? null;
}

/**
 * Description pick for a selected line.
 * Always expands at the clicked seed — user click wins over article-row locking
 * (retargeting previously blocked footer notes and off-row corrections).
 */
export function expandDescriptionPickForLine(
  seed: PdfTextItem,
  pageItems: PdfTextItem[],
  _articleHints?: string[] | null,
): { text: string; box: BoundingBox } {
  return expandDescriptionPick(seed, pageItems);
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
  // Keep the search band in the name column — not across Kvt/Pris/Beløp.
  const bandRight = Math.min(0.56, seedLeft + Math.max(0.3, seed.width * 6));
  const maxGap = Math.max(seed.height, 0.012) * 2.2;
  const maxExtraLines = 2;

  const candidates = pageItems.filter((item) => {
    const t = item.str.trim();
    if (!t) return false;
    if (HEADER_LINE.test(t)) return false;
    if (isOtherColumnToken(t)) return false;
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
