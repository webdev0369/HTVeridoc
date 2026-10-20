'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { fetchDocumentPdfBlob } from '@/lib/api';
import {
  dateSearchNeedles,
  parseDateParts,
  sameCalendarDate,
  type DateParts,
} from '@/lib/date-format';
import {
  descriptionSeedOnArticleRow,
  expandDescriptionPick,
  expandDescriptionPickForLine,
} from '@/lib/description-pick';
import type { BoundingBox } from '@/lib/types';

export type HighlightTone = 'ai' | 'edited' | 'error';

/** How to place the float when several PDF tokens match the value. */
export type HighlightRole =
  | 'quantity'
  | 'price'
  | 'unit'
  | 'code'
  | 'text'
  | 'other';

export interface PdfHighlight {
  page: number;
  boundingBox?: BoundingBox;
  tone?: HighlightTone;
  label?: string;
  value?: string | null;
  /**
   * Disambiguate short/repeated PDF tokens (e.g. "PK" on many rows).
   * Prefer matches on the same visual line as these strings (position, item code).
   */
  anchorHints?: string[];
  /** quantity/price → prefer right-hand columns; never park on item code. */
  role?: HighlightRole;
}

export interface PdfTextItem {
  id: string;
  str: string;
  /** Normalized 0–1 page coords (top-left origin) */
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PageView {
  page: number;
  width: number;
  height: number;
  textItems: PdfTextItem[];
}

export interface ColumnMapSeedPick {
  page: number;
  seed: PdfTextItem;
  pageItems: PdfTextItem[];
}

interface PdfViewerProps {
  documentId: string;
  page?: number;
  onPageChange?: (page: number) => void;
  highlight?: PdfHighlight | null;
  /** When set, clicking PDF text assigns that value to the active field */
  pickMode?: boolean;
  onValuePick?: (
    value: string,
    box: BoundingBox,
    opts?: { append?: boolean },
  ) => void;
  /** Rossum-style: save/confirm value (optional edited text from the popup) */
  onConfirmValue?: (value?: string) => void;
  /** Rossum-style: clear the selected field value */
  onClearValue?: () => void;
  /** Map a whole PDF column onto a line-item field */
  columnMapMode?: boolean;
  columnMapHint?: string | null;
  onColumnMapSeedPick?: (pick: ColumnMapSeedPick) => void;
  confirming?: boolean;
  /** Description: expand multi-line product name on click. */
  appendPickHint?: boolean;
  className?: string;
}

const toneClass: Record<HighlightTone, string> = {
  ai: 'border-[#3b82f6] bg-[#3b82f6]/25',
  edited: 'border-emerald-400 bg-emerald-400/25',
  error: 'border-rose-400 bg-rose-400/25',
};

const PAGE_GAP = 16; // px between pages in the scroll stack

function normalizeMatch(s: string) {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Pack / case units that may sit beside a qty in one PDF token ("10 PK"). */
const PACK_UNIT_TOKEN =
  /^(PK|STK|KRT|CS|FL|EA|PCE|PCS|BOX|CSE|SKK|RLL|POS|ENH)$/i;

/**
 * Locale-aware number parse for PDF tokens ("75,49" / "1.234,56" / "75.49").
 * Allows "10 PK" / "10PK" (qty + pack unit). Rejects product sizes like "500ml".
 * Rejects spaced item codes ("8950 07") — those must use text search, not 895007.
 */
function parseHighlightNumber(s: string | null | undefined): number | null {
  if (s == null) return null;
  const original = s.trim();
  if (!original) return null;

  // Dates are not quantities (ISO or printed).
  if (parseDateParts(original)) return null;

  // Qty + pack unit in one glyph run: "10 PK", "10PK" (not "500ml").
  const withUnit =
    /^(-?\d+(?:[.,]\d+)?)(?:\s+([A-Za-zæøåÆØÅ.]+)|([A-ZÆØÅ]{2,4}))$/u.exec(
      original,
    );
  if (withUnit) {
    const unit = (withUnit[2] || withUnit[3] || '').trim();
    if (unit && !PACK_UNIT_TOKEN.test(unit)) return null;
    return parseHighlightNumber(withUnit[1]);
  }

  // Item codes like "8950 07" / "8806 50" — not a single quantity.
  if (/^\d{2,}(?:\s+\d{1,})+$/.test(original)) return null;

  // Thousand-separator spaces only: "1 234" / "12 345" (groups of 3).
  const t = original.includes(' ')
    ? /^\d{1,3}(?:\s\d{3})+(?:[.,]\d+)?$/.test(original)
      ? original.replace(/\s/g, '')
      : original
    : original.replace(/\s/g, '');
  if (t.includes(' ') && / /.test(original)) return null;

  // Glued product sizes: 500ml, 750ML, 1l
  if (/^\d+[.,]?\d*[a-zA-ZæøåÆØÅ]+$/u.test(t) && !PACK_UNIT_TOKEN.test(t.replace(/^\d+[.,]?\d*/, ''))) {
    return null;
  }
  if (/[a-zA-ZæøåÆØÅ]/u.test(t)) return null;
  if (!/^-?\d/.test(t)) return null;
  let nStr = t;
  if (nStr.includes(',') && nStr.includes('.')) {
    nStr = nStr.replace(/\./g, '').replace(',', '.');
  } else if (nStr.includes(',')) {
    nStr = nStr.replace(',', '.');
  }
  if (!/^-?\d+(?:\.\d+)?$/.test(nStr)) return null;
  const n = Number(nStr);
  return Number.isFinite(n) ? n : null;
}

/** Box covering only the numeric part of "10 PK" / "75,49". */
function numberOnlyBox(item: PdfTextItem, valueNum: number): BoundingBox {
  const original = item.str.trim();
  const m = /^(-?\d+(?:[.,]\d+)?)/u.exec(original);
  if (m && numbersEqual(parseHighlightNumber(m[1]) ?? NaN, valueNum)) {
    const ratio = m[1].length / Math.max(original.length, 1);
    return {
      x: item.x,
      y: item.y,
      width: Math.max(0.004, item.width * Math.min(1, ratio + 0.02)),
      height: item.height,
    };
  }
  return {
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
  };
}

function numbersEqual(a: number, b: number) {
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= 1e-6 * scale;
}

function boxArea(box: BoundingBox) {
  return box.width * box.height;
}

/**
 * Prefer the text item actually under the click. Inflated hit-targets from
 * neighboring rows (e.g. Mozzarella above French Twist) often steal the event.
 */
function resolveTextItemAtClick(
  pageItems: PdfTextItem[],
  nx: number,
  ny: number,
  fallback: PdfTextItem,
): PdfTextItem {
  type Hit = { item: PdfTextItem; area: number; dist: number };
  const hits: Hit[] = [];
  for (const item of pageItems) {
    if (!item.str.trim()) continue;
    const padY = Math.max(item.height * 0.15, 0.001);
    const padX = Math.max(item.width * 0.02, 0.001);
    const left = item.x - padX;
    const right = item.x + item.width + padX;
    const top = item.y - padY;
    const bottom = item.y + item.height + padY;
    if (nx < left || nx > right || ny < top || ny > bottom) continue;
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;
    hits.push({
      item,
      area: Math.max(item.width, 0.001) * Math.max(item.height, 0.001),
      dist: (nx - cx) ** 2 + (ny - cy) ** 2,
    });
  }
  if (!hits.length) return fallback;
  hits.sort((a, b) => a.area - b.area || a.dist - b.dist);
  return hits[0].item;
}

function mergeBoxes(items: PdfTextItem[]): BoundingBox {
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

/** Approximate the glyph span of `needle` inside a single PDF text item. */
function substringBox(item: PdfTextItem, needle: string): BoundingBox | null {
  const full = normalizeMatch(item.str);
  const idx = full.indexOf(needle);
  if (idx < 0) return null;
  const startRatio = idx / Math.max(full.length, 1);
  const endRatio = (idx + needle.length) / Math.max(full.length, 1);
  return {
    x: item.x + item.width * startRatio,
    y: item.y,
    width: Math.max(0.004, item.width * (endRatio - startRatio)),
    height: item.height,
  };
}

function sameLine(a: PdfTextItem, b: PdfTextItem) {
  return Math.abs(b.y - a.y) <= Math.max(a.height, 0.012) * 1.6;
}

function boxCenterY(box: BoundingBox) {
  return box.y + box.height / 2;
}

/** First text item of a multi-token same-line match for `needle`. */
function findMultiTokenStart(
  textItems: PdfTextItem[],
  needle: string,
): PdfTextItem | null {
  if (!needle || textItems.length === 0) return null;
  for (let i = 0; i < textItems.length; i++) {
    const window: PdfTextItem[] = [textItems[i]];
    let joined = normalizeMatch(textItems[i].str);
    if (joined === needle) return textItems[i];
    for (let j = i + 1; j < Math.min(i + 8, textItems.length); j++) {
      if (!sameLine(textItems[i], textItems[j])) break;
      window.push(textItems[j]);
      joined = normalizeMatch(window.map((t) => t.str).join(' '));
      if (joined === needle) return textItems[i];
      if (joined.length > needle.length + 8) break;
    }
  }
  return null;
}

/** PDF text item for line position / item code (row identity). */
function findAnchorItem(
  textItems: PdfTextItem[],
  hints: string[] | null | undefined,
): PdfTextItem | null {
  if (!hints?.length || textItems.length === 0) return null;
  // Prefer article/item code over position — position digits can collide with qtys.
  const ordered = [...hints].sort((a, b) => b.length - a.length);
  for (const hint of ordered) {
    const needle = normalizeMatch(hint);
    if (!needle || needle.length < 1) continue;
    for (const item of textItems) {
      if (normalizeMatch(item.str) === needle) return item;
    }
    // "8950 07" often splits across two PDF glyphs — match the joined row.
    const multi = findMultiTokenStart(textItems, needle);
    if (multi) return multi;
  }
  return null;
}

/** Bounding box covering a multi-token hint match (e.g. item code "8950 07"). */
function findAnchorHintBox(
  textItems: PdfTextItem[],
  hints: string[] | null | undefined,
): BoundingBox | null {
  if (!hints?.length || textItems.length === 0) return null;
  const ordered = [...hints].sort((a, b) => b.length - a.length);
  for (const hint of ordered) {
    const needle = normalizeMatch(hint);
    if (!needle || needle.length < 1) continue;
    for (let i = 0; i < textItems.length; i++) {
      const window: PdfTextItem[] = [textItems[i]];
      let joined = normalizeMatch(textItems[i].str);
      if (joined === needle) {
        return {
          x: textItems[i].x,
          y: textItems[i].y,
          width: Math.max(textItems[i].width, 0.08),
          height: textItems[i].height,
        };
      }
      for (let j = i + 1; j < Math.min(i + 8, textItems.length); j++) {
        if (!sameLine(textItems[i], textItems[j])) break;
        window.push(textItems[j]);
        joined = normalizeMatch(window.map((t) => t.str).join(' '));
        if (joined === needle) return mergeBoxes(window);
        if (joined.length > needle.length + 8) break;
      }
    }
  }
  return null;
}

/** Y of the PDF row that contains position / article code (disambiguates "PK"). */
function findAnchorY(
  textItems: PdfTextItem[],
  hints: string[] | null | undefined,
): number | null {
  const item = findAnchorItem(textItems, hints);
  return item ? item.y + item.height / 2 : null;
}

function findAnchorBox(
  textItems: PdfTextItem[],
  hints: string[] | null | undefined,
): BoundingBox | null {
  const fromHint = findAnchorHintBox(textItems, hints);
  if (fromHint) return fromHint;
  const item = findAnchorItem(textItems, hints);
  if (!item) return null;
  return {
    x: item.x,
    y: item.y,
    width: Math.max(item.width, 0.08),
    height: item.height,
  };
}

/**
 * When the value is a number, find it on the same visual row as the line
 * anchor — prefer the right-hand qty column ("10 PK"), never the Pos "200".
 *
 * Important: do NOT skip hits just because they equal the line position
 * hint (Line 1 qty "1" used to be skipped → float jumped to item code).
 */
function findNumericOnAnchorRow(
  textItems: PdfTextItem[],
  valueNum: number,
  hints: string[] | null | undefined,
  preferRight = true,
): BoundingBox | null {
  const anchor = findAnchorItem(textItems, hints);
  if (!anchor) return null;

  // Only skip long identity tokens (article codes), not short position digits.
  const identityHints = (hints ?? [])
    .map((h) => normalizeMatch(h))
    .filter((h) => h.length >= 3);

  const onRow = textItems.filter((item) => sameLine(anchor, item));
  const hits: BoundingBox[] = [];
  for (const item of onRow) {
    // Never treat the article-code glyph itself as the qty/price.
    if (item.id === anchor.id) continue;
    const n = parseHighlightNumber(item.str);
    if (n == null || !numbersEqual(n, valueNum)) continue;
    if (identityHints.some((h) => h === normalizeMatch(item.str))) continue;
    hits.push(numberOnlyBox(item, valueNum));
  }
  if (hits.length === 0) return null;
  // Qty / price / pakning columns sit to the right of description.
  hits.sort((a, b) => {
    const ax = a.x + a.width / 2;
    const bx = b.x + b.width / 2;
    if (preferRight && Math.abs(bx - ax) > 0.02) return bx - ax;
    // Prefer tokens clearly to the right of the item code.
    const aRight = ax > anchor.x + anchor.width + 0.05 ? 1 : 0;
    const bRight = bx > anchor.x + anchor.width + 0.05 ? 1 : 0;
    if (bRight !== aRight) return bRight - aRight;
    return bx - ax;
  });
  return hits[0];
}

/** Park qty/price float to the right of the row when the printed number isn't found. */
function qtyFallbackBox(
  textItems: PdfTextItem[],
  hints: string[] | null | undefined,
): BoundingBox | null {
  const anchor = findAnchorItem(textItems, hints);
  if (!anchor) return null;
  return {
    x: Math.min(0.78, Math.max(anchor.x + 0.42, 0.55)),
    y: anchor.y,
    width: Math.max(anchor.width, 0.05),
    height: anchor.height,
  };
}

/** Short unit tokens (ST, PK, …) — only match on the anchored line. */
function isShortUnitToken(value: string | null | undefined): boolean {
  const v = (value ?? '').trim();
  if (!v || v.length > 4) return false;
  return /^[A-Za-zæøåÆØÅ.]+$/u.test(v);
}

/**
 * Find unit text (ST / PK / …) on the same row as position/item code.
 * Prefer exact token; also "2,0 ST" → box only the unit part.
 */
function findUnitOnAnchorRow(
  textItems: PdfTextItem[],
  unit: string,
  hints: string[] | null | undefined,
): BoundingBox | null {
  const anchor = findAnchorItem(textItems, hints);
  if (!anchor) return null;
  const needle = normalizeMatch(unit);
  if (!needle) return null;

  const onRow = textItems.filter((item) => sameLine(anchor, item));
  const hits: BoundingBox[] = [];

  for (const item of onRow) {
    const hay = normalizeMatch(item.str);
    if (hay === needle) {
      hits.push({
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
      });
      continue;
    }
    // Combined qty+unit glyph: "2,0 ST" / "10PK"
    if (hay.endsWith(needle) || hay.includes(` ${needle}`)) {
      const box = substringBox(item, needle);
      if (box) hits.push(box);
    }
  }

  if (hits.length === 0) return null;
  // Units sit with qty on the right side of the row.
  hits.sort((a, b) => b.x + b.width / 2 - (a.x + a.width / 2));
  return hits[0];
}

/**
 * Find the tightest page region for a field value.
 *
 * Numeric values never use substring search ("45" must not match inside
 * "754,90"). Repeated tokens ("PK", "10") prefer the row from anchorHints
 * (line position / item code) over a possibly-wrong AI bounding box.
 */
function findValueBoxes(
  textItems: PdfTextItem[],
  value: string | null | undefined,
  opts?: {
    near?: BoundingBox | null;
    anchorHints?: string[] | null;
  },
): BoundingBox[] {
  const raw = (value ?? '').trim();
  if (!raw || textItems.length === 0) return [];

  const needle = normalizeMatch(raw);
  const needleNum = parseHighlightNumber(raw);
  const isNumeric = needleNum != null;

  if (!isNumeric && needle.length < 2) return [];

  type Scored = { score: number; box: BoundingBox };
  const scored: Scored[] = [];

  const pushItem = (item: PdfTextItem, score: number) => {
    scored.push({
      score,
      box: {
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
      },
    });
  };

  if (isNumeric) {
    // Exact numeric equality only (locale-aware) — never substring of larger amounts.
    // Also accepts "10 PK" and highlights only the "10".
    for (const item of textItems) {
      const n = parseHighlightNumber(item.str);
      if (n != null && numbersEqual(n, needleNum)) {
        scored.push({
          score: 10_000 + String(n).length,
          box: numberOnlyBox(item, needleNum),
        });
      }
    }
    // Multi-token: "10"+"PK", "75"+",49"
    for (let i = 0; i < textItems.length; i++) {
      const window: PdfTextItem[] = [textItems[i]];
      for (let j = i + 1; j < Math.min(i + 4, textItems.length); j++) {
        if (!sameLine(textItems[i], textItems[j])) break;
        window.push(textItems[j]);
        const joinedSpace = window.map((t) => t.str).join(' ');
        const joinedTight = window.map((t) => t.str).join('');
        const n =
          parseHighlightNumber(joinedSpace) ??
          parseHighlightNumber(joinedTight);
        if (n != null && numbersEqual(n, needleNum)) {
          // Prefer boxing just the leading numeric token when present.
          const lead = parseHighlightNumber(window[0].str);
          scored.push({
            score: 9_500 + String(n).length,
            box:
              lead != null && numbersEqual(lead, needleNum)
                ? numberOnlyBox(window[0], needleNum)
                : mergeBoxes(window),
          });
          break;
        }
      }
    }
  } else {
    // ISO dates ↔ printed EU dates (2026-08-05 ↔ 05.08.2026).
    const needles = [raw, ...dateSearchNeedles(raw)];
    const seenNeedle = new Set<string>();

    for (const candidate of needles) {
      const n = normalizeMatch(candidate);
      if (!n || seenNeedle.has(n)) continue;
      seenNeedle.add(n);

      // 1) Exact single-token match
      for (const item of textItems) {
        if (normalizeMatch(item.str) === n) {
          pushItem(item, 10_000 + n.length);
        }
      }

      // 2) Needle contained in one token → highlight only that substring width
      for (const item of textItems) {
        const hay = normalizeMatch(item.str);
        if (hay === n || !hay.includes(n)) continue;
        // Avoid matching short unit tokens inside longer words
        if (n.length <= 3 && hay.length > n.length + 1) continue;
        const box = substringBox(item, n);
        if (box) scored.push({ score: 5_000 + n.length, box });
      }

      // 3) Exact match across consecutive same-line tokens
      for (let i = 0; i < textItems.length; i++) {
        const window: PdfTextItem[] = [textItems[i]];
        let joined = normalizeMatch(textItems[i].str);

        for (let j = i + 1; j < Math.min(i + 10, textItems.length); j++) {
          if (!sameLine(textItems[i], textItems[j])) break;
          window.push(textItems[j]);
          joined = normalizeMatch(window.map((t) => t.str).join(' '));

          if (joined === n) {
            scored.push({
              score: 9_000 + n.length,
              box: mergeBoxes(window),
            });
            break;
          }

          if (joined.includes(n) && joined.length > n.length) {
            for (let a = 0; a < window.length; a++) {
              for (let b = a; b < window.length; b++) {
                const slice = window.slice(a, b + 1);
                const part = normalizeMatch(slice.map((t) => t.str).join(' '));
                if (part === n) {
                  scored.push({
                    score: 8_500 + n.length,
                    box: mergeBoxes(slice),
                  });
                }
              }
            }
            break;
          }

          if (joined.length > n.length + 24) break;
        }
      }
    }
  }

  if (scored.length === 0) return [];

  // Line position / item code beats a stale AI row bbox for ambiguous tokens.
  const fromAnchorY = findAnchorY(textItems, opts?.anchorHints);
  const fromNearY = opts?.near ? boxCenterY(opts.near) : null;
  const preferredY = fromAnchorY ?? fromNearY;

  const band = Math.max(opts?.near?.height ?? 0, 0.02) * 3;

  const rankNear = (list: Scored[]) =>
    [...list].sort((a, b) => {
      if (preferredY != null) {
        const da = Math.abs(boxCenterY(a.box) - preferredY);
        const db = Math.abs(boxCenterY(b.box) - preferredY);
        // Same visual row: for numbers prefer the right-hand column
        // (qty / price / pakning) over a left-side description hit.
        if (Math.abs(da - db) <= band * 0.5 && isNumeric) {
          const ax = a.box.x + a.box.width / 2;
          const bx = b.box.x + b.box.width / 2;
          if (Math.abs(bx - ax) > 0.03) return bx - ax;
        }
        if (Math.abs(da - db) > 1e-6) return da - db;
      } else if (isNumeric) {
        const ax = a.box.x + a.box.width / 2;
        const bx = b.box.x + b.box.width / 2;
        if (Math.abs(bx - ax) > 0.03) return bx - ax;
      }
      if (b.score !== a.score) return b.score - a.score;
      return boxArea(a.box) - boxArea(b.box);
    });

  // When AI bbox Y is wrong, ignore `near` and pick the best text hit.
  const rankScore = (list: Scored[]) =>
    [...list].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return boxArea(a.box) - boxArea(b.box);
    });

  if (preferredY != null) {
    const inBand = scored.filter(
      (s) => Math.abs(boxCenterY(s.box) - preferredY) <= band,
    );
    // Stay on the anchored row when possible. If the AI bbox/`near` Y is
    // wrong (e.g. header), do NOT return [] — that parked the float at the
    // top of the page. Prefer the best text match on the page instead.
    if (inBand.length > 0) return [rankNear(inBand)[0].box];
    if (fromAnchorY != null) {
      const anchorBand = scored.filter(
        (s) => Math.abs(boxCenterY(s.box) - fromAnchorY) <= band,
      );
      if (anchorBand.length > 0) return [rankNear(anchorBand)[0].box];
    }
    // Stale AI bbox only — don't pull toward a wrong Y.
    return [rankScore(scored)[0].box];
  }

  return [rankNear(scored)[0].box];
}

/**
 * Locate a calendar date on the page regardless of printed format.
 * Prefer the glyph nearest the AI bbox / Ordredato label (detected position).
 */
function findDateValueBoxes(
  textItems: PdfTextItem[],
  target: DateParts,
  opts?: {
    near?: BoundingBox | null;
    anchorHints?: string[] | null;
  },
): BoundingBox[] {
  type Scored = { dist: number; area: number; box: BoundingBox };
  const hits: Scored[] = [];

  const push = (box: BoundingBox) => {
    const preferredY =
      findAnchorY(textItems, opts?.anchorHints) ??
      (opts?.near ? boxCenterY(opts.near) : null);
    const preferredX = opts?.near
      ? opts.near.x + opts.near.width / 2
      : null;
    const cy = boxCenterY(box);
    const cx = box.x + box.width / 2;
    const dy = preferredY != null ? Math.abs(cy - preferredY) : 0;
    const dx = preferredX != null ? Math.abs(cx - preferredX) : 0;
    hits.push({ dist: dy * 2 + dx, area: boxArea(box), box });
  };

  for (const item of textItems) {
    const parts = parseDateParts(item.str);
    if (parts && sameCalendarDate(parts, target)) {
      push({
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
      });
    }
  }

  for (let i = 0; i < textItems.length; i++) {
    const window: PdfTextItem[] = [textItems[i]];
    for (let j = i + 1; j < Math.min(i + 5, textItems.length); j++) {
      if (!sameLine(textItems[i], textItems[j])) break;
      window.push(textItems[j]);
      const joined = window.map((t) => t.str).join('');
      const spaced = window.map((t) => t.str).join(' ');
      const parts =
        parseDateParts(joined) ?? parseDateParts(spaced);
      if (parts && sameCalendarDate(parts, target)) {
        push(mergeBoxes(window));
        break;
      }
    }
  }

  if (hits.length === 0) return [];

  // If AI bbox overlaps / is near a hit, keep that detected position.
  if (opts?.near) {
    const nearY = boxCenterY(opts.near);
    const band = Math.max(opts.near.height, 0.02) * 4;
    const nearHits = hits.filter(
      (h) => Math.abs(boxCenterY(h.box) - nearY) <= band,
    );
    if (nearHits.length > 0) {
      nearHits.sort((a, b) => a.dist - b.dist || a.area - b.area);
      return [nearHits[0].box];
    }
  }

  const fromAnchor = findAnchorY(textItems, opts?.anchorHints);
  if (fromAnchor != null) {
    const band = 0.04;
    const onLabel = hits.filter(
      (h) => Math.abs(boxCenterY(h.box) - fromAnchor) <= band,
    );
    if (onLabel.length > 0) {
      onLabel.sort((a, b) => a.dist - b.dist || a.area - b.area);
      return [onLabel[0].box];
    }
  }

  hits.sort((a, b) => a.dist - b.dist || a.area - b.area);
  return [hits[0].box];
}

/** Product-name box on the same PDF row as this line's item code. */
function descriptionBandOnAnchorRow(
  textItems: PdfTextItem[],
  hints: string[] | null | undefined,
): BoundingBox | null {
  const seed = descriptionSeedOnArticleRow(textItems, hints);
  if (!seed) return null;
  return expandDescriptionPick(seed, textItems).box;
}

function boxNearAnchorRow(
  box: BoundingBox,
  textItems: PdfTextItem[],
  hints: string[] | null | undefined,
): boolean {
  const anchorY = findAnchorY(textItems, hints);
  if (anchorY == null) return true;
  const band = 0.045;
  return Math.abs(boxCenterY(box) - anchorY) <= band;
}

/** Resolve highlight / popup anchor for a selection on a page. */
function resolveHighlightBoxes(
  textItems: PdfTextItem[],
  highlight: PdfHighlight,
): BoundingBox[] {
  const valueNum = parseHighlightNumber(highlight.value);
  const rawValue = (highlight.value ?? '').trim();
  const role = highlight.role ?? 'other';
  const preferRight = role === 'quantity' || role === 'price';
  const isDescription = role === 'text';

  // Dates: normalize in storage (ISO) but locate the printed form on the PDF.
  const dateParts = parseDateParts(rawValue);
  if (dateParts) {
    const dateBoxes = findDateValueBoxes(textItems, dateParts, {
      near: highlight.boundingBox,
      anchorHints: highlight.anchorHints,
    });
    if (dateBoxes.length > 0) return dateBoxes;
  }

  // Description: keep the ring on this line's product name — never on Varenr.
  if (isDescription && highlight.anchorHints?.length) {
    const fromText = findValueBoxes(textItems, highlight.value, {
      near: highlight.boundingBox,
      anchorHints: highlight.anchorHints,
    });
    if (
      fromText.length > 0 &&
      boxNearAnchorRow(fromText[0], textItems, highlight.anchorHints)
    ) {
      return fromText;
    }
    const onRow = descriptionBandOnAnchorRow(
      textItems,
      highlight.anchorHints,
    );
    if (onRow) return [onRow];
    if (
      highlight.boundingBox &&
      boxNearAnchorRow(
        highlight.boundingBox,
        textItems,
        highlight.anchorHints,
      )
    ) {
      return [highlight.boundingBox];
    }
    // Stale value from another row — still prefer this row's name band above.
    if (fromText.length > 0) return fromText;
    if (highlight.boundingBox) return [highlight.boundingBox];
    return [];
  }

  // Numeric fields (stocktaking qty, prices, …): find the value on *this*
  // line's row, preferring the qty column ("10 PK") — not Pos / item code.
  if (valueNum != null && highlight.anchorHints?.length) {
    const onRow = findNumericOnAnchorRow(
      textItems,
      valueNum,
      highlight.anchorHints,
      preferRight,
    );
    if (onRow) return [onRow];
  }

  // Short units (ST, PK) appear on every row — lock to the anchored line first.
  if (isShortUnitToken(rawValue) && highlight.anchorHints?.length) {
    const onRow = findUnitOnAnchorRow(
      textItems,
      rawValue,
      highlight.anchorHints,
    );
    if (onRow) return [onRow];
  }

  const fromText = findValueBoxes(textItems, highlight.value, {
    near: highlight.boundingBox,
    anchorHints: highlight.anchorHints,
  });
  if (fromText.length > 0) {
    // For qty/price, reject a "match" that is still on the item-code glyph.
    if (preferRight && highlight.anchorHints?.length) {
      const anchor = findAnchorItem(textItems, highlight.anchorHints);
      if (!anchor) return fromText;
      const box = fromText[0];
      const cx = box.x + box.width / 2;
      if (cx > anchor.x + anchor.width + 0.04) return fromText;
      // Left-side hit (often confused with position) — keep searching.
    } else {
      return fromText;
    }
  }

  if (valueNum != null && highlight.anchorHints?.length) {
    const onRow = findNumericOnAnchorRow(
      textItems,
      valueNum,
      highlight.anchorHints,
      preferRight,
    );
    if (onRow) return [onRow];
  }

  // Qty/price: never park the float on the item code — sit in the qty band.
  if (preferRight && highlight.anchorHints?.length) {
    const fallback = qtyFallbackBox(textItems, highlight.anchorHints);
    if (fallback) return [fallback];
  }

  // Last resort: park on article/position so we stay on the correct row.
  // (Description handled above — never lands on Varenr alone.)
  const anchor = findAnchorBox(textItems, highlight.anchorHints);
  if (anchor) return [anchor];
  if (highlight.boundingBox) {
    return [highlight.boundingBox];
  }
  return [];
}

/**
 * Park the edit popup clear of the highlight so the printed value stays
 * visible and clickable. Prefer below the row (line amounts), else beside.
 */
function popupPositionStyle(box: BoundingBox): CSSProperties {
  const boxLeft = box.x * 100;
  const boxRight = (box.x + box.width) * 100;
  const boxTop = box.y * 100;
  const boxBottom = (box.y + box.height) * 100;
  const boxCenterX = (box.x + box.width / 2) * 100;

  const spaceBelow = 100 - boxBottom;
  const spaceAbove = boxTop;
  const spaceRight = 100 - boxRight;
  const spaceLeft = boxLeft;
  const sideRoom = 26;

  // Prefer below/above so the highlighted number is never under the panel.
  if (spaceBelow >= 20 || spaceAbove >= 20) {
    const placeBelow = spaceBelow >= 18 || spaceBelow >= spaceAbove;
    return {
      left: `${Math.min(Math.max(boxCenterX, 16), 84)}%`,
      top: placeBelow ? `${boxBottom}%` : `${boxTop}%`,
      transform: placeBelow
        ? 'translate(-50%, 14px)'
        : 'translate(-50%, calc(-100% - 14px))',
    };
  }

  const placeRight = spaceRight >= sideRoom || spaceRight >= spaceLeft;
  return {
    left: placeRight ? `${boxRight}%` : `${boxLeft}%`,
    top: `${Math.min(Math.max(boxTop, 0.5), 82)}%`,
    transform: placeRight
      ? 'translate(10px, 0)'
      : 'translate(calc(-100% - 10px), 0)',
  };
}

export function PdfViewer({
  documentId,
  page: controlledPage,
  onPageChange,
  highlight,
  pickMode = false,
  onValuePick,
  onConfirmValue,
  onClearValue,
  columnMapMode = false,
  columnMapHint = null,
  onColumnMapSeedPick,
  confirming = false,
  appendPickHint = false,
  className = '',
}: PdfViewerProps) {
  const textPickEnabled = pickMode || columnMapMode;
  const containerRef = useRef<HTMLDivElement>(null);
  const pageElRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfRef = useRef<any>(null);
  const renderGenRef = useRef(0);
  const scrollLockRef = useRef(false);
  const lastReportedPage = useRef(1);

  const [internalPage, setInternalPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1.15);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [pages, setPages] = useState<PageView[]>([]);

  const page = controlledPage ?? internalPage;

  const setPage = useCallback(
    (next: number) => {
      const clamped = Math.max(1, Math.min(pageCount || next, next));
      lastReportedPage.current = clamped;
      onPageChange?.(clamped);
      if (controlledPage == null) setInternalPage(clamped);
    },
    [controlledPage, onPageChange, pageCount],
  );

  const scrollToPage = useCallback(
    (targetPage: number, behavior: ScrollBehavior = 'smooth') => {
      const el = pageElRefs.current.get(targetPage);
      const container = containerRef.current;
      if (!el || !container) return;
      scrollLockRef.current = true;
      const top =
        el.offsetTop - container.offsetTop - 8;
      container.scrollTo({ top: Math.max(0, top), behavior });
      setPage(targetPage);
      window.setTimeout(() => {
        scrollLockRef.current = false;
      }, behavior === 'smooth' ? 450 : 50);
    },
    [setPage],
  );

  // Load PDF document
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      pdfRef.current = null;
      setPageCount(0);
      setPages([]);

      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
        const blob = await fetchDocumentPdfBlob(documentId);
        const data = new Uint8Array(await blob.arrayBuffer());
        const pdf = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;
        pdfRef.current = pdf;
        setPageCount(pdf.numPages);
        if (controlledPage == null) setInternalPage(1);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load PDF');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  // Create page shells when PDF loads
  useEffect(() => {
    if (loading || pageCount < 1) return;
    setPages(
      Array.from({ length: pageCount }, (_, i) => ({
        page: i + 1,
        width: 0,
        height: 0,
        textItems: [],
      })),
    );
  }, [pageCount, loading, documentId]);

  // Render all pages into a continuous scroll stack
  useEffect(() => {
    let cancelled = false;
    const gen = ++renderGenRef.current;

    async function renderAll() {
      const pdf = pdfRef.current;
      if (!pdf || pageCount < 1 || loading || pages.length !== pageCount) return;

      // Wait until canvases are mounted
      for (let attempt = 0; attempt < 20; attempt++) {
        if (cancelled) return;
        let ready = true;
        for (let p = 1; p <= pageCount; p++) {
          if (!canvasRefs.current.get(p)) {
            ready = false;
            break;
          }
        }
        if (ready) break;
        await new Promise((r) => requestAnimationFrame(() => r(undefined)));
      }

      setRendering(true);
      setError(null);

      try {
        const outputScale = window.devicePixelRatio || 1;
        const nextPages: PageView[] = [];

        for (let p = 1; p <= pageCount; p++) {
          if (cancelled || gen !== renderGenRef.current) return;

          const pdfPage = await pdf.getPage(p);
          const viewport = pdfPage.getViewport({ scale });
          const canvas = canvasRefs.current.get(p);
          if (!canvas) continue;

          const context = canvas.getContext('2d', { alpha: false });
          if (!context) continue;

          canvas.width = Math.floor(viewport.width * outputScale);
          canvas.height = Math.floor(viewport.height * outputScale);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;

          context.setTransform(1, 0, 0, 1, 0, 0);
          context.clearRect(0, 0, canvas.width, canvas.height);

          const transform =
            outputScale !== 1
              ? [outputScale, 0, 0, outputScale, 0, 0]
              : undefined;

          const task = pdfPage.render({
            canvasContext: context,
            viewport,
            transform,
          });
          await task.promise;
          if (cancelled || gen !== renderGenRef.current) return;

          const content = await pdfPage.getTextContent();
          if (cancelled || gen !== renderGenRef.current) return;

          const items: PdfTextItem[] = [];
          let idx = 0;
          for (const raw of content.items as Array<{
            str?: string;
            transform?: number[];
            width?: number;
            height?: number;
          }>) {
            if (!raw.str?.trim() || !raw.transform) continue;
            const m = raw.transform;
            const fontHeightPx = Math.hypot(m[2], m[3]) * viewport.scale || 10;
            const widthPx =
              (raw.width ?? 0) * viewport.scale || fontHeightPx * 0.5;
            const [vx, vy] = viewport.convertToViewportPoint(m[4], m[5]);
            items.push({
              id: `t-${p}-${idx++}`,
              str: raw.str,
              x: Math.max(0, vx / viewport.width),
              y: Math.max(0, (vy - fontHeightPx) / viewport.height),
              width: Math.max(0.004, widthPx / viewport.width),
              height: Math.max(0.01, fontHeightPx / viewport.height),
            });
          }

          nextPages.push({
            page: p,
            width: viewport.width,
            height: viewport.height,
            textItems: items,
          });
        }

        if (
          !cancelled &&
          gen === renderGenRef.current &&
          nextPages.length === pageCount
        ) {
          setPages(nextPages);
        }
      } catch (err) {
        const name =
          err && typeof err === 'object' && 'name' in err
            ? String((err as { name: string }).name)
            : '';
        if (name === 'RenderingCancelledException') return;
        if (!cancelled) setError('Failed to render pages');
      } finally {
        if (!cancelled && gen === renderGenRef.current) {
          setRendering(false);
        }
      }
    }

    void renderAll();
    return () => {
      cancelled = true;
    };
  }, [pageCount, scale, loading, pages.length, documentId]);

  // Track visible page while scrolling
  useEffect(() => {
    const container = containerRef.current;
    if (!container || pageCount < 1) return;

    const onScroll = () => {
      if (scrollLockRef.current) return;
      const containerTop = container.scrollTop + container.clientHeight * 0.35;
      let bestPage = 1;
      let bestDist = Infinity;

      for (let p = 1; p <= pageCount; p++) {
        const el = pageElRefs.current.get(p);
        if (!el) continue;
        const mid = el.offsetTop - container.offsetTop + el.offsetHeight / 2;
        const dist = Math.abs(mid - containerTop);
        if (dist < bestDist) {
          bestDist = dist;
          bestPage = p;
        }
      }

      if (bestPage !== lastReportedPage.current) {
        lastReportedPage.current = bestPage;
        onPageChange?.(bestPage);
        if (controlledPage == null) setInternalPage(bestPage);
      }
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [pageCount, onPageChange, controlledPage]);

  // Scroll to highlight only when the selected *field* changes — not when the
  // user edits/confirms the value (that was jumping the view to the wrong place).
  const lastScrollKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!highlight?.page || !pages.length) return;
    const target = pages.find((p) => p.page === highlight.page);
    if (!target?.height) return;

    const scrollKey = `${highlight.label ?? ''}::${highlight.page}`;
    if (lastScrollKeyRef.current === scrollKey) return;
    // Wait until text layer is ready so we can locate the box once.
    if (!target.textItems.length && !highlight.boundingBox) return;
    lastScrollKeyRef.current = scrollKey;

    const boxes = resolveHighlightBoxes(target.textItems, highlight);
    const box = boxes[0] ?? highlight.boundingBox;
    const pageEl = pageElRefs.current.get(highlight.page);
    const container = containerRef.current;
    if (!pageEl || !container) return;

    scrollLockRef.current = true;
    const pageOffset = pageEl.offsetTop - container.offsetTop;
    const boxTop = box ? box.y * target.height : 0;
    container.scrollTo({
      top: Math.max(0, pageOffset + boxTop - 80),
      behavior: 'smooth',
    });
    setPage(highlight.page);
    const t = window.setTimeout(() => {
      scrollLockRef.current = false;
    }, 450);
    return () => window.clearTimeout(t);
  }, [
    highlight?.page,
    highlight?.label,
    highlight?.boundingBox,
    highlight?.value,
    highlight?.anchorHints,
    pages,
    setPage,
  ]);

  // Reset scroll memory when highlight clears so the next field selection scrolls again.
  useEffect(() => {
    if (!highlight) lastScrollKeyRef.current = null;
  }, [highlight]);

  const activePageView = useMemo(
    () => pages.find((p) => p.page === (highlight?.page ?? page)) ?? null,
    [pages, highlight?.page, page],
  );

  const matchedBoxes = useMemo(() => {
    if (!highlight || !activePageView) return [] as BoundingBox[];
    if (highlight.page !== activePageView.page) return [];
    return resolveHighlightBoxes(activePageView.textItems, highlight);
  }, [highlight, activePageView]);

  const primaryBox = matchedBoxes[0] ?? null;
  const showActive =
    Boolean(highlight) &&
    Boolean(activePageView) &&
    highlight!.page === activePageView!.page &&
    activePageView!.width > 0;

  if (loading) {
    return (
      <div
        className={`flex items-center justify-center bg-[#0b0f14] text-slate-400 ${className}`}
      >
        Loading document…
      </div>
    );
  }

  if (error && pageCount < 1) {
    return (
      <div
        className={`flex items-center justify-center bg-[#0b0f14] px-6 text-rose-300 ${className}`}
      >
        {error}
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 min-w-0 flex-col bg-[#0b0f14] ${className}`}>
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-[#151b22] px-3 py-1.5">
        <button
          type="button"
          title="Previous page"
          className="rounded px-2 py-1 text-xs font-medium text-slate-300 hover:bg-white/10 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => scrollToPage(page - 1)}
        >
          ↑
        </button>
        <span className="text-xs font-medium tabular-nums text-slate-300">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          title="Next page"
          className="rounded px-2 py-1 text-xs font-medium text-slate-300 hover:bg-white/10 disabled:opacity-40"
          disabled={page >= pageCount}
          onClick={() => scrollToPage(page + 1)}
        >
          ↓
        </button>
        {columnMapMode && (
          <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-200">
            {columnMapHint ??
              'Map column: click any value in the PDF column to fill all rows'}
          </span>
        )}
        {!columnMapMode && pickMode && (
          <span className="rounded bg-[#3b82f6]/20 px-2 py-0.5 text-[11px] font-medium text-[#93c5fd]">
            Type the correct value, or click it on the PDF — “
            {highlight?.label ?? 'field'}”
          </span>
        )}
        {rendering && (
          <span className="text-[11px] text-slate-500">Rendering…</span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-white/10"
            onClick={() =>
              setScale((s) => Math.max(0.55, +(s - 0.12).toFixed(2)))
            }
          >
            −
          </button>
          <span className="w-10 text-center text-[11px] tabular-nums text-slate-400">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-white/10"
            onClick={() =>
              setScale((s) => Math.min(2.6, +(s + 0.12).toFixed(2)))
            }
          >
            +
          </button>
        </div>
      </div>

      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto p-5">
        <div className="mx-auto flex w-fit flex-col" style={{ gap: PAGE_GAP }}>
          {(pages.length
            ? pages
            : Array.from({ length: pageCount }, (_, i) => ({
                page: i + 1,
                width: 0,
                height: 400,
                textItems: [] as PdfTextItem[],
              }))
          ).map((pageView) => {
            const isHighlightPage =
              showActive && highlight?.page === pageView.page;
            const pageBoxes = isHighlightPage ? matchedBoxes : [];
            const pagePrimary = isHighlightPage ? primaryBox : null;

            return (
              <div
                key={pageView.page}
                ref={(el) => {
                  if (el) pageElRefs.current.set(pageView.page, el);
                  else pageElRefs.current.delete(pageView.page);
                }}
                data-page={pageView.page}
                className="relative bg-white shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
                style={{
                  width: pageView.width || undefined,
                  minHeight: pageView.height || 320,
                }}
              >
                <canvas
                  ref={(el) => {
                    if (el) canvasRefs.current.set(pageView.page, el);
                    else canvasRefs.current.delete(pageView.page);
                  }}
                  className="block"
                />

                <div className="absolute inset-0">
                  {pageView.textItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      title={item.str}
                      disabled={!textPickEnabled}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!textPickEnabled) return;
                        const pageEl = pageElRefs.current.get(pageView.page);
                        const rect = pageEl?.getBoundingClientRect();
                        const seed =
                          rect && rect.width > 0 && rect.height > 0
                            ? resolveTextItemAtClick(
                                pageView.textItems,
                                (e.clientX - rect.left) / rect.width,
                                (e.clientY - rect.top) / rect.height,
                                item,
                              )
                            : item;
                        if (columnMapMode && onColumnMapSeedPick) {
                          onColumnMapSeedPick({
                            page: pageView.page,
                            seed,
                            pageItems: pageView.textItems,
                          });
                          return;
                        }
                        if (!onValuePick) return;
                        if (appendPickHint) {
                          // Lock to this line's article row so a click on the
                          // product above/below cannot steal the wrong name.
                          const expanded = expandDescriptionPickForLine(
                            seed,
                            pageView.textItems,
                            highlight?.anchorHints,
                          );
                          onValuePick(expanded.text, expanded.box, {
                            append: e.shiftKey,
                          });
                          return;
                        }
                        onValuePick(
                          seed.str.trim(),
                          {
                            x: seed.x,
                            y: seed.y,
                            width: seed.width,
                            height: seed.height,
                          },
                          { append: e.shiftKey },
                        );
                      }}
                      className={`absolute rounded-[2px] ${
                        textPickEnabled
                          ? columnMapMode
                            ? 'cursor-crosshair hover:bg-amber-400/30 hover:ring-1 hover:ring-amber-400'
                            : 'cursor-crosshair hover:bg-[#3b82f6]/25 hover:ring-1 hover:ring-[#3b82f6]'
                          : 'pointer-events-none'
                      }`}
                      style={{
                        left: `${item.x * 100}%`,
                        top: `${item.y * 100}%`,
                        width: `${item.width * 100}%`,
                        // Keep hit height close to real glyphs so rows don't overlap.
                        height: `${Math.max(item.height * 100, 0.45)}%`,
                      }}
                    />
                  ))}
                </div>

                {/* Popup first (lower z), highlight ring on top so the PDF value stays readable. */}
                {isHighlightPage && highlight && (
                  <HighlightPopup
                    highlight={highlight}
                    primaryBox={pagePrimary}
                    pickMode={pickMode}
                    confirming={confirming}
                    appendPickHint={appendPickHint}
                    onConfirmValue={onConfirmValue}
                    onClearValue={onClearValue}
                  />
                )}

                {pageBoxes.map((box, i) => (
                  <div
                    key={`hl-${pageView.page}-${i}`}
                    className={`pointer-events-none absolute z-40 border-2 ${
                      toneClass[highlight?.tone ?? 'ai']
                    }`}
                    style={{
                      left: `${box.x * 100}%`,
                      top: `${box.y * 100}%`,
                      width: `${Math.max(box.width * 100, 1.2)}%`,
                      height: `${Math.max(box.height * 100, 1.4)}%`,
                    }}
                  />
                ))}

                {pageCount > 1 && (
                  <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white/80">
                    {pageView.page}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HighlightPopup({
  highlight,
  primaryBox,
  pickMode,
  confirming,
  appendPickHint,
  onConfirmValue,
  onClearValue,
}: {
  highlight: PdfHighlight;
  primaryBox: BoundingBox | null;
  pickMode: boolean;
  confirming: boolean;
  appendPickHint?: boolean;
  onConfirmValue?: (value?: string) => void;
  onClearValue?: () => void;
}) {
  const [draft, setDraft] = useState(highlight.value ?? '');

  useEffect(() => {
    setDraft(highlight.value ?? '');
  }, [highlight.value, highlight.label, highlight.page]);

  // Allow confirm with empty value so optional line cells can be skipped.
  const canSave = pickMode && !confirming;

  const anchorBox = primaryBox ?? highlight.boundingBox ?? null;

  return (
    <div
      className="pointer-events-none absolute z-30 w-[240px] max-w-[min(240px,calc(100%-16px))] rounded-xl bg-[#1a2230]/95 p-2.5 text-white shadow-2xl ring-1 ring-[#3b82f6]/50 backdrop-blur-[2px]"
      style={
        anchorBox
          ? popupPositionStyle(anchorBox)
          : { right: '12px', bottom: '12px', left: 'auto', top: 'auto' }
      }
    >
      {/* Only input + actions capture clicks — labels pass through so PDF
          rows under the float (e.g. next product name) stay selectable. */}
      <div
        className="pointer-events-auto rounded-lg border border-white/15 bg-[#0f1419] px-2.5 py-2"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {pickMode ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSave) {
                e.preventDefault();
                onConfirmValue?.(draft.trim());
              }
            }}
            className="w-full border-0 bg-transparent text-[17px] font-semibold leading-tight tracking-tight text-white outline-none placeholder:text-slate-600"
            placeholder="Enter value…"
            aria-label={highlight.label || 'Field value'}
            autoFocus
          />
        ) : (
          <p className="truncate text-[17px] font-semibold leading-tight tracking-tight">
            {highlight.value || '—'}
          </p>
        )}
      </div>
      <p className="pointer-events-none mt-1.5 truncate px-0.5 text-xs text-slate-400">
        {highlight.label || 'Selected field'}
      </p>
      <p className="pointer-events-none mt-1 px-0.5 text-[11px] text-slate-500">
        {appendPickHint
          ? 'Click the correct product name on the PDF (replaces). Shift+click to add more, then ✓'
          : 'Type the correct value, or click it on the PDF, then press ✓'}
      </p>
      {!anchorBox && (
        <p className="pointer-events-none mt-1 px-0.5 text-[11px] text-amber-300/90">
          Click text on the PDF to reassign
        </p>
      )}
      <div
        className="pointer-events-auto mt-2 flex items-center justify-end gap-2 border-t border-white/10 pt-2"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          title="Clear value"
          disabled={!pickMode || confirming}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClearValue?.();
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40"
        >
          <TrashIcon />
        </button>
        <button
          type="button"
          title="Save and go to next"
          disabled={!canSave}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onConfirmValue?.(draft.trim());
          }}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-full disabled:opacity-40 ${
            highlight.tone === 'edited'
              ? 'bg-emerald-500 text-white ring-2 ring-emerald-300/50'
              : 'bg-emerald-500 text-white hover:bg-emerald-400'
          }`}
        >
          <CheckIcon />
        </button>
      </div>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
