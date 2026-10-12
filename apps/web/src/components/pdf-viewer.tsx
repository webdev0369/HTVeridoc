'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchDocumentPdfBlob } from '@/lib/api';
import type { BoundingBox } from '@/lib/types';

export type HighlightTone = 'ai' | 'edited' | 'error';

export interface PdfHighlight {
  page: number;
  boundingBox?: BoundingBox;
  tone?: HighlightTone;
  label?: string;
  value?: string | null;
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
  onValuePick?: (value: string, box: BoundingBox) => void;
  /** Rossum-style: save/confirm value (optional edited text from the popup) */
  onConfirmValue?: (value?: string) => void;
  /** Rossum-style: clear the selected field value */
  onClearValue?: () => void;
  /** Map a whole PDF column onto a line-item field */
  columnMapMode?: boolean;
  columnMapHint?: string | null;
  onColumnMapSeedPick?: (pick: ColumnMapSeedPick) => void;
  confirming?: boolean;
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

function boxArea(box: BoundingBox) {
  return box.width * box.height;
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

/**
 * Find the tightest page region for a field value.
 * Prefer exact / short spans so a date like "10.02.22" does not highlight
 * the whole "Planlagt leveringsdag: Torsdag 10.02.22" line.
 */
function findValueBoxes(
  textItems: PdfTextItem[],
  value: string | null | undefined,
): BoundingBox[] {
  const needle = normalizeMatch(value ?? '');
  if (!needle || needle.length < 2 || textItems.length === 0) return [];

  type Scored = { score: number; box: BoundingBox };
  const scored: Scored[] = [];

  // 1) Exact single-token match
  for (const item of textItems) {
    if (normalizeMatch(item.str) === needle) {
      scored.push({
        score: 10_000 + needle.length,
        box: {
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
        },
      });
    }
  }

  // 2) Needle contained in one token → highlight only that substring width
  for (const item of textItems) {
    const hay = normalizeMatch(item.str);
    if (hay === needle || !hay.includes(needle)) continue;
    const box = substringBox(item, needle);
    if (box) {
      scored.push({ score: 5_000 + needle.length, box });
    }
  }

  // 3) Exact / contained match across consecutive same-line tokens —
  //    box only the tokens that form the needle, not the whole line.
  for (let i = 0; i < textItems.length; i++) {
    const window: PdfTextItem[] = [textItems[i]];
    let joined = normalizeMatch(textItems[i].str);

    for (let j = i + 1; j < Math.min(i + 10, textItems.length); j++) {
      if (!sameLine(textItems[i], textItems[j])) break;
      window.push(textItems[j]);
      joined = normalizeMatch(
        window.map((t) => t.str).join(' '),
      );

      if (joined === needle) {
        scored.push({
          score: 9_000 + needle.length,
          box: mergeBoxes(window),
        });
        break;
      }

      // Minimal sub-window that contains the needle
      if (joined.includes(needle) && joined.length > needle.length) {
        for (let a = 0; a < window.length; a++) {
          for (let b = a; b < window.length; b++) {
            const slice = window.slice(a, b + 1);
            const part = normalizeMatch(slice.map((t) => t.str).join(' '));
            if (part === needle) {
              scored.push({
                score: 8_500 + needle.length,
                box: mergeBoxes(slice),
              });
            } else if (part.includes(needle) && part.length <= needle.length + 2) {
              scored.push({
                score: 4_000 + needle.length,
                box: mergeBoxes(slice),
              });
            }
          }
        }
        break;
      }

      if (joined.length > needle.length + 24) break;
    }
  }

  // 4) Last resort: short fragment contained in needle (avoid tiny noise)
  if (scored.length === 0) {
    for (const item of textItems) {
      const hay = normalizeMatch(item.str);
      if (
        needle.length >= 4 &&
        hay.length >= 4 &&
        needle.includes(hay) &&
        hay.length >= needle.length * 0.5
      ) {
        scored.push({
          score: 500 + hay.length,
          box: {
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
          },
        });
      }
    }
  }

  if (scored.length === 0) return [];

  // Prefer higher score, then tighter boxes
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return boxArea(a.box) - boxArea(b.box);
  });

  return [scored[0].box];
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

    const boxes = findValueBoxes(target.textItems, highlight.value);
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
    const fromText = findValueBoxes(activePageView.textItems, highlight.value);
    if (fromText.length > 0) return fromText;
    if (highlight.boundingBox) return [highlight.boundingBox];
    return [];
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
            Click a value on the PDF to fill “{highlight?.label ?? 'field'}”
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
                        if (columnMapMode && onColumnMapSeedPick) {
                          onColumnMapSeedPick({
                            page: pageView.page,
                            seed: item,
                            pageItems: pageView.textItems,
                          });
                          return;
                        }
                        if (!onValuePick) return;
                        onValuePick(item.str.trim(), {
                          x: item.x,
                          y: item.y,
                          width: item.width,
                          height: item.height,
                        });
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
                        height: `${Math.max(item.height * 100, 1.2)}%`,
                      }}
                    />
                  ))}
                </div>

                {pageBoxes.map((box, i) => (
                  <div
                    key={`hl-${pageView.page}-${i}`}
                    className={`pointer-events-none absolute border-2 ${
                      toneClass[highlight?.tone ?? 'ai']
                    }`}
                    style={{
                      left: `${box.x * 100}%`,
                      top: `${box.y * 100}%`,
                      width: `${box.width * 100}%`,
                      height: `${box.height * 100}%`,
                    }}
                  />
                ))}

                {isHighlightPage && highlight && (
                  <HighlightPopup
                    highlight={highlight}
                    primaryBox={pagePrimary}
                    pickMode={pickMode}
                    confirming={confirming}
                    onConfirmValue={onConfirmValue}
                    onClearValue={onClearValue}
                  />
                )}

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
  onConfirmValue,
  onClearValue,
}: {
  highlight: PdfHighlight;
  primaryBox: BoundingBox | null;
  pickMode: boolean;
  confirming: boolean;
  onConfirmValue?: (value?: string) => void;
  onClearValue?: () => void;
}) {
  const [draft, setDraft] = useState(highlight.value ?? '');

  useEffect(() => {
    setDraft(highlight.value ?? '');
  }, [highlight.value, highlight.label, highlight.page]);

  // Allow confirm with empty value so optional line cells can be skipped.
  const canSave = pickMode && !confirming;

  return (
    <div
      className="absolute z-30 w-[240px] rounded-xl bg-[#1a2230] p-2.5 text-white shadow-2xl ring-1 ring-[#3b82f6]/50"
      style={
        primaryBox
          ? {
              left: `${Math.min(Math.max(primaryBox.x * 100, 0), 72)}%`,
              top: `${Math.min(
                primaryBox.y * 100 + primaryBox.height * 100 + 0.8,
                92,
              )}%`,
            }
          : { left: '12px', top: '12px' }
      }
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="rounded-lg border border-white/15 bg-[#0f1419] px-2.5 py-2">
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
          />
        ) : (
          <p className="truncate text-[17px] font-semibold leading-tight tracking-tight">
            {highlight.value || '—'}
          </p>
        )}
      </div>
      <p className="mt-1.5 truncate px-0.5 text-xs text-slate-400">
        {highlight.label || 'Selected field'}
      </p>
      <p className="mt-1 px-0.5 text-[11px] text-slate-500">
        Edit the value, then press ✓ to save and go to next
      </p>
      {!primaryBox && (
        <p className="mt-1 px-0.5 text-[11px] text-amber-300/90">
          Click text on the PDF to reassign
        </p>
      )}
      <div className="mt-2 flex items-center justify-end gap-2 border-t border-white/10 pt-2">
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
          {confirming ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <CheckIcon />
          )}
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
