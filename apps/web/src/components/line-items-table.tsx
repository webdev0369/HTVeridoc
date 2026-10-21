'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ExtractionLineItemDto,
  ValidationDto,
  ValidationErrorDto,
} from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { columnMapLabel, mappableLineColumns } from '@/lib/column-map';
import { parseLocaleNumber } from '@/lib/parse-locale-number';
import {
  getLineColumnValue,
  LINE_REVIEW_COLUMN_LABELS,
  lineAnchorHints,
  lineSelectionLabel,
  linesHaveBaseContentQuantity,
  linesHaveBaseMeasurementUnit,
  linesNeedStocktakingPerBase,
  type LineReviewColumn,
  type ReviewSelection,
} from '@/lib/review-types';

type ColKey =
  | 'pos'
  | 'article'
  | 'description'
  | 'purchaseUnit'
  | 'purchaseQty'
  | 'purchasePrice'
  | 'stocktakingUnit'
  | 'stocktakingQty'
  | 'stocktakingPrice'
  | 'stPerPu'
  | 'baseUnit'
  | 'baseContent'
  | 'pricePerBase'
  | 'stPerBase'
  | 'discount'
  | 'vat'
  | 'amount'
  | 'type';

const DEFAULT_WIDTHS: Record<ColKey, number> = {
  pos: 52,
  article: 120,
  description: 220,
  purchaseUnit: 88,
  purchaseQty: 96,
  purchasePrice: 110,
  stocktakingUnit: 100,
  stocktakingQty: 110,
  stocktakingPrice: 120,
  stPerPu: 88,
  baseUnit: 88,
  baseContent: 96,
  pricePerBase: 100,
  stPerBase: 96,
  discount: 72,
  vat: 72,
  amount: 120,
  type: 88,
};

const MIN_WIDTHS: Record<ColKey, number> = {
  pos: 40,
  article: 80,
  description: 140,
  purchaseUnit: 64,
  purchaseQty: 64,
  purchasePrice: 72,
  stocktakingUnit: 72,
  stocktakingQty: 72,
  stocktakingPrice: 80,
  stPerPu: 64,
  baseUnit: 64,
  baseContent: 64,
  pricePerBase: 72,
  stPerBase: 64,
  discount: 56,
  vat: 56,
  amount: 80,
  type: 64,
};

const COLS: { key: ColKey; label: string; align?: 'left' | 'right' }[] = [
  { key: 'pos', label: '#' },
  { key: 'article', label: 'Item code' },
  { key: 'description', label: 'Description' },
  { key: 'purchaseUnit', label: 'Purchase unit' },
  { key: 'purchaseQty', label: 'Purchase qty', align: 'right' },
  { key: 'purchasePrice', label: 'Purchase price', align: 'right' },
  { key: 'stocktakingUnit', label: 'Stocktaking unit' },
  { key: 'stocktakingQty', label: 'Stocktaking qty', align: 'right' },
  { key: 'stocktakingPrice', label: 'Stocktaking price', align: 'right' },
  { key: 'stPerPu', label: 'ST qty / PU', align: 'right' },
  { key: 'baseUnit', label: 'Base unit' },
  { key: 'baseContent', label: 'Content / ST', align: 'right' },
  { key: 'pricePerBase', label: 'Price / base', align: 'right' },
  { key: 'stPerBase', label: 'ST qty / base', align: 'right' },
  { key: 'discount', label: 'Disc.', align: 'right' },
  { key: 'vat', label: 'VAT %', align: 'right' },
  { key: 'amount', label: 'Total amount', align: 'right' },
  { key: 'type', label: 'Type' },
];

const BASE_COL_KEYS = new Set<ColKey>(['baseUnit', 'pricePerBase']);
const BASE_CONTENT_COL_KEY: ColKey = 'baseContent';
const ST_PER_BASE_COL_KEY: ColKey = 'stPerBase';

function numToInput(value: number | null | undefined) {
  return value == null ? '' : String(value);
}

/**
 * Green ✓ only after the user confirmed this cell (PDF ✓ or table edit).
 * AI confidence must never look "validated" — that made every column look OK.
 */
function CellTick({ confirmed }: { confirmed: boolean }) {
  if (!confirmed) return null;
  return (
    <span
      title="Confirmed"
      className="ml-1 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[9px] text-white"
    >
      ✓
    </span>
  );
}

/** Map a line patch onto review columns that were just saved. */
function columnsFromPatch(
  patch: Partial<ExtractionLineItemDto>,
): LineReviewColumn[] {
  const cols: LineReviewColumn[] = [];
  if ('articleNumber' in patch) cols.push('articleNumber');
  if ('description' in patch) cols.push('description');
  if ('purchaseUnit' in patch || 'unit' in patch) cols.push('purchaseUnit');
  if ('purchaseQuantity' in patch || 'quantity' in patch) {
    cols.push('purchaseQuantity');
  }
  if ('unitPrice' in patch) cols.push('unitPrice');
  if ('stocktakingUnit' in patch) cols.push('stocktakingUnit');
  if ('stockTakingQuantity' in patch) cols.push('stockTakingQuantity');
  if ('stocktakingUnitPrice' in patch) cols.push('stocktakingUnitPrice');
  if ('stockTakingQuantityPerPurchaseUnit' in patch) {
    cols.push('stockTakingQuantityPerPurchaseUnit');
  }
  if ('baseMeasurementUnit' in patch) cols.push('baseMeasurementUnit');
  if ('baseContentQuantity' in patch) cols.push('baseContentQuantity');
  if ('pricePerBaseUnit' in patch) cols.push('pricePerBaseUnit');
  if ('stockTakingQuantityPerBaseMeasurementUnit' in patch) {
    cols.push('stockTakingQuantityPerBaseMeasurementUnit');
  }
  if ('discount' in patch) cols.push('discount');
  if ('vat' in patch) cols.push('vat');
  if ('amount' in patch) cols.push('amount');
  return cols;
}

function cellConfirmKey(lineId: string, column: LineReviewColumn) {
  return `${lineId}:${column}`;
}

interface LineItemsTableProps {
  lineItems: ExtractionLineItemDto[];
  validation?: ValidationDto | null;
  editable: boolean;
  selection: ReviewSelection;
  onSelect: (selection: ReviewSelection) => void;
  onSaveLine: (
    lineItemId: string,
    patch: Partial<ExtractionLineItemDto>,
  ) => void | Promise<void>;
  onAddLine?: () => void | Promise<void>;
  onDeleteLine?: (lineItemId: string) => void | Promise<void>;
  mapColumn?: LineReviewColumn | null;
  onStartMapColumn?: (column: LineReviewColumn) => void;
  onCancelMapColumn?: () => void;
  saving?: boolean;
  /** Auth/permissions still loading — skeleton Map / Add row instead of empty gap. */
  actionsLoading?: boolean;
  /** Fired when PDF popup confirms a line cell (so the table can show ✓). */
  confirmSignal?: {
    lineId: string;
    column: LineReviewColumn;
    at: number;
  } | null;
}

export function LineItemsTable({
  lineItems,
  validation,
  editable,
  selection,
  onSelect,
  onSaveLine,
  onAddLine,
  onDeleteLine,
  mapColumn = null,
  onStartMapColumn,
  onCancelMapColumn,
  saving,
  actionsLoading = false,
  confirmSignal = null,
}: LineItemsTableProps) {
  const [mapMenuOpen, setMapMenuOpen] = useState(false);
  /** Per-cell confirms — never use line-level AI confidence / isUserEdited. */
  const [confirmedCells, setConfirmedCells] = useState<Set<string>>(
    () => new Set(),
  );

  const markColumnsConfirmed = useCallback(
    (lineId: string, columns: LineReviewColumn[]) => {
      if (!columns.length) return;
      setConfirmedCells((prev) => {
        const next = new Set(prev);
        for (const col of columns) {
          next.add(cellConfirmKey(lineId, col));
        }
        return next;
      });
    },
    [],
  );

  // PDF popup ✓ / pick — parent passes the exact cell that was confirmed.
  useEffect(() => {
    if (!confirmSignal) return;
    markColumnsConfirmed(confirmSignal.lineId, [confirmSignal.column]);
  }, [confirmSignal, markColumnsConfirmed]);

  const saveLineAndMark = useCallback(
    async (lineItemId: string, patch: Partial<ExtractionLineItemDto>) => {
      // Mark ✓ immediately — parent save is optimistic / fire-and-forget.
      markColumnsConfirmed(lineItemId, columnsFromPatch(patch));
      await onSaveLine(lineItemId, patch);
    },
    [onSaveLine, markColumnsConfirmed],
  );
  const showBaseCols = useMemo(
    () => linesHaveBaseMeasurementUnit(lineItems),
    [lineItems],
  );
  const showBaseContentCol = useMemo(
    () => linesHaveBaseContentQuantity(lineItems),
    [lineItems],
  );
  const showStPerBaseCol = useMemo(
    () => linesNeedStocktakingPerBase(lineItems),
    [lineItems],
  );
  const visibleCols = useMemo(
    () =>
      COLS.filter((col) => {
        if (BASE_COL_KEYS.has(col.key)) return showBaseCols;
        if (col.key === BASE_CONTENT_COL_KEY) return showBaseContentCol;
        if (col.key === ST_PER_BASE_COL_KEY) return showStPerBaseCol;
        return true;
      }),
    [showBaseCols, showBaseContentCol, showStPerBaseCol],
  );
  const mapColumns = useMemo(
    () => mappableLineColumns(lineItems),
    [lineItems],
  );
  const [widths, setWidths] = useState<Record<ColKey, number>>(() => {
    if (typeof window === 'undefined') return { ...DEFAULT_WIDTHS };
    try {
      const raw = localStorage.getItem('htveridoc.lineColWidths');
      if (!raw) return { ...DEFAULT_WIDTHS };
      return { ...DEFAULT_WIDTHS, ...(JSON.parse(raw) as Record<ColKey, number>) };
    } catch {
      return { ...DEFAULT_WIDTHS };
    }
  });
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    label: string;
    detail: string | null;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const dragRef = useRef<{
    key: ColKey;
    startX: number;
    startW: number;
  } | null>(null);

  useEffect(() => {
    if (!pendingDelete) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleting) setPendingDelete(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingDelete, deleting]);

  const confirmDelete = () => {
    if (!pendingDelete || !onDeleteLine || deleting) return;
    const lineId = pendingDelete.id;
    // Close immediately — parent removes the row optimistically.
    setPendingDelete(null);
    setDeleting(false);
    void onDeleteLine(lineId);
  };

  const issueByLine = useMemo(() => {
    const map = new Map<string, ValidationErrorDto>();
    for (const err of validation?.errors ?? []) {
      if (err.lineItemId && !map.has(err.lineItemId)) {
        map.set(err.lineItemId, err);
      }
    }
    return map;
  }, [validation]);

  const totalAmount = useMemo(
    () =>
      lineItems.reduce((sum, line) => {
        if (line.lineType === 'CANCELLED') return sum;
        return sum + (line.amount ?? 0);
      }, 0),
    [lineItems],
  );

  const showActions = Boolean(editable && onDeleteLine);
  const actionsColWidth = 48;
  const totalWidth = useMemo(
    () =>
      visibleCols.reduce((sum, c) => sum + widths[c.key], 0) +
      (showActions ? actionsColWidth : 0),
    [widths, showActions, visibleCols],
  );

  useEffect(() => {
    localStorage.setItem('htveridoc.lineColWidths', JSON.stringify(widths));
  }, [widths]);

  const onResizeStart = useCallback(
    (key: ColKey, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { key, startX: e.clientX, startW: widths[key] };

      const onMove = (ev: MouseEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const delta = ev.clientX - drag.startX;
        const next = Math.max(MIN_WIDTHS[drag.key], drag.startW + delta);
        setWidths((prev) => ({ ...prev, [drag.key]: next }));
      };

      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [widths],
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden bg-[#0f1419]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
            Line items
          </span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-slate-300">
            {lineItems.length}
          </span>
          <span className="hidden text-[11px] text-slate-500 sm:inline">
            Scroll for more columns · drag edges to resize
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {actionsLoading && !editable ? (
            <>
              <Skeleton className="h-7 w-[88px] rounded-md bg-white/10" />
              <Skeleton className="h-7 w-[76px] rounded-md bg-[#3b82f6]/30" />
            </>
          ) : null}
          {editable && onStartMapColumn ? (
            mapColumn ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => onCancelMapColumn?.()}
                className="rounded-md bg-amber-500/20 px-2.5 py-1 text-[11px] font-semibold text-amber-200 ring-1 ring-amber-400/40 hover:bg-amber-500/30 disabled:opacity-50"
              >
                Mapping {columnMapLabel(mapColumn)} — Cancel
              </button>
            ) : (
              <div className="relative">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setMapMenuOpen((o) => !o)}
                  className="rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-slate-200 ring-1 ring-white/15 hover:bg-white/15 disabled:opacity-50"
                >
                  Map column
                </button>
                {mapMenuOpen ? (
                  <div className="absolute right-0 top-full z-30 mt-1 max-h-64 w-48 overflow-auto rounded-lg border border-white/10 bg-[#1c2430] py-1 shadow-xl">
                    {mapColumns.map((col) => (
                      <button
                        key={col}
                        type="button"
                        className="block w-full px-3 py-1.5 text-left text-xs text-slate-200 hover:bg-[#3b82f6]/25"
                        onClick={() => {
                          setMapMenuOpen(false);
                          onStartMapColumn(col);
                        }}
                      >
                        {LINE_REVIEW_COLUMN_LABELS[col]}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          ) : null}
          {editable && onAddLine ? (
            <button
              type="button"
              disabled={saving || Boolean(mapColumn)}
              onClick={() => void onAddLine()}
              className="rounded-md bg-[#3b82f6] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#2563eb] disabled:opacity-50"
            >
              + Add row
            </button>
          ) : null}
          <div className="rounded-full bg-[#1c2430] px-3 py-1 text-xs text-slate-300 ring-1 ring-white/10">
            <span className="text-slate-500">fx Total Amount </span>
            <span className="font-semibold text-white">
              {totalAmount.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Single scrollport: H + V; sticky header / delete stay in view */}
      <div className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain">
        <table
          className="border-separate border-spacing-0 text-left text-sm"
          style={{
            width: totalWidth,
            minWidth: totalWidth,
            tableLayout: 'fixed',
          }}
        >
          <colgroup>
            {visibleCols.map((col) => (
              <col
                key={col.key}
                style={{
                  width: widths[col.key],
                  minWidth: widths[col.key],
                }}
              />
            ))}
            {showActions ? (
              <col
                style={{
                  width: actionsColWidth,
                  minWidth: actionsColWidth,
                }}
              />
            ) : null}
          </colgroup>
          <thead className="text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              {visibleCols.map((col) => (
                <th
                  key={col.key}
                  className={`relative sticky top-0 z-20 border-b border-white/10 bg-[#151b22] px-3 py-2.5 font-semibold shadow-[0_1px_0_rgba(255,255,255,0.06)] ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                  style={{ width: widths[col.key], minWidth: widths[col.key] }}
                >
                  {col.label}
                  <button
                    type="button"
                    aria-label={`Resize ${col.label}`}
                    onMouseDown={(e) => onResizeStart(col.key, e)}
                    className="absolute inset-y-0 right-0 z-20 w-3 cursor-col-resize touch-none"
                  >
                    <span className="absolute inset-y-2 right-[5px] w-px bg-white/15 group-hover:bg-[#3b82f6]" />
                    <span className="absolute top-1/2 right-[2px] h-4 w-1.5 -translate-y-1/2 rounded-sm bg-slate-500/80 hover:bg-[#3b82f6]" />
                  </button>
                </th>
              ))}
              {showActions ? (
                <th
                  className="sticky top-0 right-0 z-30 border-b border-white/10 bg-[#151b22] px-1 py-2.5 shadow-[-6px_0_8px_rgba(0,0,0,0.45)]"
                  style={{ width: actionsColWidth, minWidth: actionsColWidth }}
                  aria-label="Delete"
                />
              ) : null}
            </tr>
          </thead>
          <tbody>
            {lineItems.map((line) => (
              <LineRow
                key={line.id}
                line={line}
                editable={editable}
                selected={
                  selection?.type === 'line' && selection.id === line.id
                }
                selectedColumn={
                  selection?.type === 'line' && selection.id === line.id
                    ? selection.column
                    : null
                }
                confirmedCells={confirmedCells}
                showBaseCols={showBaseCols}
                showBaseContentCol={showBaseContentCol}
                showStPerBaseCol={showStPerBaseCol}
                issue={issueByLine.get(line.id)}
                disabled={saving}
                onSelectColumn={(column) =>
                  onSelect({
                    type: 'line',
                    id: line.id,
                    column,
                    label: lineSelectionLabel(line, column),
                    value: getLineColumnValue(line, column),
                    page: line.source?.page ?? null,
                    boundingBox: line.source?.boundingBox,
                    anchorHints: lineAnchorHints(line),
                    tone: issueByLine.has(line.id)
                      ? 'error'
                      : confirmedCells.has(
                            cellConfirmKey(line.id, column),
                          )
                        ? 'edited'
                        : 'ai',
                  })
                }
                onSave={(patch) => saveLineAndMark(line.id, patch)}
                onDelete={
                  showActions
                    ? () =>
                        setPendingDelete({
                          id: line.id,
                          label: `Line ${line.position ?? line.sortOrder + 1}`,
                          detail:
                            line.description?.trim() ||
                            line.articleNumber?.trim() ||
                            null,
                        })
                    : undefined
                }
              />
            ))}
            {!lineItems.length && (
              <tr>
                <td
                  colSpan={
                    visibleCols.length + (editable && onDeleteLine ? 1 : 0)
                  }
                  className="px-4 py-10 text-center text-sm text-slate-500"
                >
                  No line items extracted
                  {editable && onAddLine ? (
                    <>
                      {' — '}
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void onAddLine()}
                        className="font-semibold text-[#3b82f6] hover:underline disabled:opacity-50"
                      >
                        add a row
                      </button>
                    </>
                  ) : null}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pendingDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onClick={() => {
            if (!deleting) setPendingDelete(null);
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-line-title"
            aria-describedby="delete-line-desc"
            className="w-full max-w-md rounded-xl border border-white/10 bg-[#151b22] p-5 shadow-2xl shadow-black/50"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="delete-line-title"
              className="text-base font-semibold text-white"
            >
              Delete line item?
            </h2>
            <p id="delete-line-desc" className="mt-2 text-sm text-slate-400">
              This will permanently remove{' '}
              <span className="font-medium text-slate-200">
                {pendingDelete.label}
              </span>
              {pendingDelete.detail ? (
                <>
                  {' '}
                  (
                  <span className="text-slate-300">
                    {pendingDelete.detail}
                  </span>
                  )
                </>
              ) : null}{' '}
              from this document. This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setPendingDelete(null)}
                className="rounded-md px-3.5 py-2 text-sm font-medium text-slate-300 ring-1 ring-white/15 hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void confirmDelete()}
                className="rounded-md bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LineRow({
  line,
  editable,
  selected,
  selectedColumn,
  confirmedCells,
  showBaseCols,
  showBaseContentCol,
  showStPerBaseCol,
  issue,
  disabled,
  onSelectColumn,
  onSave,
  onDelete,
}: {
  line: ExtractionLineItemDto;
  editable: boolean;
  selected: boolean;
  selectedColumn: LineReviewColumn | null;
  confirmedCells: Set<string>;
  showBaseCols: boolean;
  showBaseContentCol: boolean;
  showStPerBaseCol: boolean;
  issue?: ValidationErrorDto;
  disabled?: boolean;
  onSelectColumn: (column: LineReviewColumn) => void;
  onSave: (patch: Partial<ExtractionLineItemDto>) => Promise<void>;
  onDelete?: () => void;
}) {
  const isConfirmed = (column: LineReviewColumn) =>
    confirmedCells.has(cellConfirmKey(line.id, column));
  const [articleNumber, setArticleNumber] = useState(line.articleNumber ?? '');
  const [description, setDescription] = useState(line.description ?? '');
  const [purchaseUnit, setPurchaseUnit] = useState(
    line.purchaseUnit ?? line.unit ?? '',
  );
  const [purchaseQty, setPurchaseQty] = useState(
    numToInput(line.purchaseQuantity ?? line.quantity),
  );
  const [purchasePrice, setPurchasePrice] = useState(numToInput(line.unitPrice));
  const [stocktakingUnit, setStocktakingUnit] = useState(
    line.stocktakingUnit ?? '',
  );
  const [stocktakingQty, setStocktakingQty] = useState(
    numToInput(line.stockTakingQuantity),
  );
  const [stocktakingPrice, setStocktakingPrice] = useState(
    numToInput(line.stocktakingUnitPrice),
  );
  const [stPerPu, setStPerPu] = useState(
    numToInput(line.stockTakingQuantityPerPurchaseUnit),
  );
  const [baseUnit, setBaseUnit] = useState(line.baseMeasurementUnit ?? '');
  const [baseContent, setBaseContent] = useState(
    numToInput(line.baseContentQuantity),
  );
  const [pricePerBase, setPricePerBase] = useState(
    numToInput(line.pricePerBaseUnit),
  );
  const [stPerBase, setStPerBase] = useState(
    numToInput(line.stockTakingQuantityPerBaseMeasurementUnit),
  );
  const [discount, setDiscount] = useState(numToInput(line.discount));
  const [vat, setVat] = useState(numToInput(line.vat));
  const [amount, setAmount] = useState(numToInput(line.amount));
  const [dirty, setDirty] = useState(false);

  // Sync from server only when this line's identity/values change — not on
  // every new object reference (which would wipe in-progress edits).
  const syncKey = [
    line.id,
    line.articleNumber,
    line.description,
    line.purchaseUnit,
    line.unit,
    line.purchaseQuantity,
    line.quantity,
    line.unitPrice,
    line.stocktakingUnit,
    line.stockTakingQuantity,
    line.stocktakingUnitPrice,
    line.stockTakingQuantityPerPurchaseUnit,
    line.baseMeasurementUnit,
    line.baseContentQuantity,
    line.pricePerBaseUnit,
    line.stockTakingQuantityPerBaseMeasurementUnit,
    line.discount,
    line.vat,
    line.amount,
    line.isUserEdited,
  ].join('|');

  useEffect(() => {
    setArticleNumber(line.articleNumber ?? '');
    setDescription(line.description ?? '');
    setPurchaseUnit(line.purchaseUnit ?? line.unit ?? '');
    setPurchaseQty(numToInput(line.purchaseQuantity ?? line.quantity));
    setPurchasePrice(numToInput(line.unitPrice));
    setStocktakingUnit(line.stocktakingUnit ?? '');
    setStocktakingQty(numToInput(line.stockTakingQuantity));
    setStocktakingPrice(numToInput(line.stocktakingUnitPrice));
    setStPerPu(numToInput(line.stockTakingQuantityPerPurchaseUnit));
    setBaseUnit(line.baseMeasurementUnit ?? '');
    setBaseContent(numToInput(line.baseContentQuantity));
    setPricePerBase(numToInput(line.pricePerBaseUnit));
    setStPerBase(numToInput(line.stockTakingQuantityPerBaseMeasurementUnit));
    setDiscount(numToInput(line.discount));
    setVat(numToInput(line.vat));
    setAmount(numToInput(line.amount));
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- syncKey captures field values
  }, [syncKey]);

  const commit = async () => {
    if (!editable || !dirty) return;

    // Only send fields that actually changed vs server — never wipe siblings.
    const patch: Partial<ExtractionLineItemDto> = {};
    const nextArticle = articleNumber.trim() || null;
    const nextDesc = description.trim() || null;
    const nextPurchaseUnit = purchaseUnit.trim() || null;
    const nextStockUnit = stocktakingUnit.trim() || null;
    const nextBaseUnit = baseUnit.trim() || null;
    const nextPurchaseQty = parseLocaleNumber(purchaseQty);
    const nextStockQty = parseLocaleNumber(stocktakingQty);
    const nextPrice = parseLocaleNumber(purchasePrice);
    const nextStockPrice = parseLocaleNumber(stocktakingPrice);
    const nextStPerPu = parseLocaleNumber(stPerPu);
    const nextBaseContent = parseLocaleNumber(baseContent);
    const nextPricePerBase = parseLocaleNumber(pricePerBase);
    const nextStPerBase = parseLocaleNumber(stPerBase);
    const nextDisc = parseLocaleNumber(discount);
    const nextVat = parseLocaleNumber(vat);
    const nextAmt = parseLocaleNumber(amount);

    const serverPurchaseQty = line.purchaseQuantity ?? line.quantity ?? null;

    if (nextArticle !== (line.articleNumber ?? null)) {
      patch.articleNumber = nextArticle;
    }
    if (nextDesc !== (line.description ?? null)) {
      patch.description = nextDesc;
    }
    if (nextPurchaseUnit !== (line.purchaseUnit ?? line.unit ?? null)) {
      patch.purchaseUnit = nextPurchaseUnit;
      patch.unit = nextPurchaseUnit;
    }
    if (nextPurchaseQty !== serverPurchaseQty) {
      patch.purchaseQuantity = nextPurchaseQty;
      patch.quantity = nextPurchaseQty;
    }
    if (nextStockUnit !== (line.stocktakingUnit ?? null)) {
      patch.stocktakingUnit = nextStockUnit;
    }
    if (nextStockQty !== (line.stockTakingQuantity ?? null)) {
      patch.stockTakingQuantity = nextStockQty;
    }
    if (nextPrice !== (line.unitPrice ?? null)) {
      patch.unitPrice = nextPrice;
    }
    if (nextStockPrice !== (line.stocktakingUnitPrice ?? null)) {
      patch.stocktakingUnitPrice = nextStockPrice;
    }
    if (nextStPerPu !== (line.stockTakingQuantityPerPurchaseUnit ?? null)) {
      patch.stockTakingQuantityPerPurchaseUnit = nextStPerPu;
    }
    if (nextBaseUnit !== (line.baseMeasurementUnit ?? null)) {
      patch.baseMeasurementUnit = nextBaseUnit;
    }
    if (nextBaseContent !== (line.baseContentQuantity ?? null)) {
      patch.baseContentQuantity = nextBaseContent;
    }
    if (nextPricePerBase !== (line.pricePerBaseUnit ?? null)) {
      patch.pricePerBaseUnit = nextPricePerBase;
    }
    if (
      nextStPerBase !==
      (line.stockTakingQuantityPerBaseMeasurementUnit ?? null)
    ) {
      patch.stockTakingQuantityPerBaseMeasurementUnit = nextStPerBase;
    }
    if (nextDisc !== (line.discount ?? null)) {
      patch.discount = nextDisc;
    }
    if (nextVat !== (line.vat ?? null)) {
      patch.vat = nextVat;
    }
    if (nextAmt !== (line.amount ?? null)) {
      patch.amount = nextAmt;
    }

    if (Object.keys(patch).length === 0) {
      setDirty(false);
      return;
    }

    await onSave(patch);
    setDirty(false);
  };

  const cellInput = (
    column: LineReviewColumn,
    value: string,
    set: (v: string) => void,
    align: 'left' | 'right' = 'left',
  ) => {
    const active = selectedColumn === column;
    return editable ? (
      <input
        value={value}
        disabled={disabled}
        onFocus={() => onSelectColumn(column)}
        onChange={(e) => {
          set(e.target.value);
          setDirty(true);
        }}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        className={`w-full min-w-0 truncate border-0 bg-transparent py-0.5 text-sm text-white outline-none placeholder:text-slate-600 focus:text-white ${
          align === 'right' ? 'text-right' : 'text-left'
        } ${
          active
            ? 'rounded bg-[#3b82f6]/35 px-1 ring-1 ring-[#3b82f6]/70'
            : ''
        }`}
      />
    ) : (
      <span
        className={`block truncate ${align === 'right' ? 'text-right' : ''}`}
      >
        {value || '—'}
      </span>
    );
  };

  // Soft row tint only — the active *cell* carries the strong highlight.
  const rowBg = selected
    ? 'bg-[#1a4d8c]/15'
    : issue
      ? 'bg-rose-950/40'
      : line.lineType === 'CANCELLED'
        ? 'bg-rose-950/20 text-slate-400'
        : 'bg-[#0f1419]';
  const rowHover = selected
    ? ''
    : issue
      ? 'hover:bg-rose-950/55'
      : line.lineType === 'CANCELLED'
        ? 'hover:bg-rose-950/30'
        : 'hover:bg-white/[0.03]';
  const actionBg = selected
    ? 'bg-[#121826]'
    : issue
      ? 'bg-[#2a1218]'
      : line.lineType === 'CANCELLED'
        ? 'bg-[#1a1214]'
        : 'bg-[#0f1419]';

  return (
    <tr title={issue?.message} className={`transition ${rowBg} ${rowHover}`}>
      <td
        className="overflow-hidden border-b border-white/5 px-3 py-2.5 text-xs text-slate-500"
        onClick={() => onSelectColumn('description')}
      >
        {line.position ?? '—'}
      </td>
      <td
        className="overflow-hidden border-b border-white/5 px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-0 items-center">
          {cellInput('articleNumber', articleNumber, setArticleNumber)}
          <CellTick confirmed={isConfirmed('articleNumber')} />
        </div>
      </td>
      <td
        className="overflow-hidden border-b border-white/5 px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-0 items-center">
          {cellInput('description', description, setDescription)}
          <CellTick confirmed={isConfirmed('description')} />
        </div>
      </td>
      <td
        className="overflow-hidden border-b border-white/5 px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-0 items-center">
          {cellInput('purchaseUnit', purchaseUnit, setPurchaseUnit)}
          <CellTick confirmed={isConfirmed('purchaseUnit')} />
        </div>
      </td>
      <td
        className="overflow-hidden border-b border-white/5 px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-0 items-center justify-end">
          {cellInput('purchaseQuantity', purchaseQty, setPurchaseQty, 'right')}
          <CellTick confirmed={isConfirmed('purchaseQuantity')} />
        </div>
      </td>
      <td
        className="overflow-hidden border-b border-white/5 px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-0 items-center justify-end">
          {cellInput('unitPrice', purchasePrice, setPurchasePrice, 'right')}
          <CellTick confirmed={isConfirmed('unitPrice')} />
        </div>
      </td>
      <td
        className="overflow-hidden border-b border-white/5 px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        {cellInput('stocktakingUnit', stocktakingUnit, setStocktakingUnit)}
      </td>
      <td
        className="overflow-hidden border-b border-white/5 px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-0 items-center justify-end">
          {cellInput(
            'stockTakingQuantity',
            stocktakingQty,
            setStocktakingQty,
            'right',
          )}
        </div>
      </td>
      <td
        className="overflow-hidden border-b border-white/5 px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-0 items-center justify-end">
          {cellInput(
            'stocktakingUnitPrice',
            stocktakingPrice,
            setStocktakingPrice,
            'right',
          )}
        </div>
      </td>
      <td
        className="overflow-hidden border-b border-white/5 px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-0 items-center justify-end">
          {cellInput(
            'stockTakingQuantityPerPurchaseUnit',
            stPerPu,
            setStPerPu,
            'right',
          )}
        </div>
      </td>
      {showBaseCols ? (
        <td
          className="overflow-hidden border-b border-white/5 px-3 py-2"
          onClick={(e) => e.stopPropagation()}
        >
          {cellInput('baseMeasurementUnit', baseUnit, setBaseUnit)}
        </td>
      ) : null}
      {showBaseContentCol ? (
        <td
          className="overflow-hidden border-b border-white/5 px-3 py-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex min-w-0 items-center justify-end">
            {cellInput(
              'baseContentQuantity',
              baseContent,
              setBaseContent,
              'right',
            )}
          </div>
        </td>
      ) : null}
      {showBaseCols ? (
        <td
          className="overflow-hidden border-b border-white/5 px-3 py-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex min-w-0 items-center justify-end">
            {cellInput(
              'pricePerBaseUnit',
              pricePerBase,
              setPricePerBase,
              'right',
            )}
          </div>
        </td>
      ) : null}
      {showStPerBaseCol ? (
        <td
          className="overflow-hidden border-b border-white/5 px-3 py-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex min-w-0 items-center justify-end">
            {cellInput(
              'stockTakingQuantityPerBaseMeasurementUnit',
              stPerBase,
              setStPerBase,
              'right',
            )}
          </div>
        </td>
      ) : null}
      <td
        className="overflow-hidden border-b border-white/5 px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        {cellInput('discount', discount, setDiscount, 'right')}
      </td>
      <td
        className="overflow-hidden border-b border-white/5 px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        {cellInput('vat', vat, setVat, 'right')}
      </td>
      <td
        className="overflow-hidden border-b border-white/5 px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-0 items-center justify-end">
          {cellInput('amount', amount, setAmount, 'right')}
          <CellTick confirmed={isConfirmed('amount')} />
        </div>
      </td>
      <td className="overflow-hidden border-b border-white/5 px-3 py-2">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
            line.lineType === 'CANCELLED'
              ? 'bg-rose-500/20 text-rose-300'
              : line.lineType === 'FEE'
                ? 'bg-amber-500/20 text-amber-200'
                : 'bg-white/10 text-slate-300'
          }`}
        >
          {line.lineType}
        </span>
      </td>
      {onDelete ? (
        <td
          className={`sticky right-0 z-20 border-b border-white/5 px-1 py-2 text-center shadow-[-6px_0_8px_rgba(0,0,0,0.45)] ${actionBg}`}
          style={{ width: 48, minWidth: 48 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            title="Delete row"
            aria-label="Delete row"
            disabled={disabled}
            onClick={() => onDelete()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-300 hover:bg-rose-500/25 hover:text-rose-300 disabled:opacity-40"
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.58.22-2.365.468a.75.75 0 00-.51 1.15l.224.337A11.02 11.02 0 014.75 7.5v7.25A2.75 2.75 0 007.5 17.5h5a2.75 2.75 0 002.75-2.75V7.5c0-.69.11-1.36.321-1.992l.224-.337a.75.75 0 00-.51-1.15A12.3 12.3 0 0014 4.193v-.443A2.75 2.75 0 0011.25 1h-2.5zM7.5 3.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25v.326a13.35 13.35 0 00-5 0V3.75zm1 5.5a.75.75 0 00-1.5 0v5a.75.75 0 001.5 0v-5zm3.75-.75a.75.75 0 01.75.75v5a.75.75 0 01-1.5 0v-5a.75.75 0 01.75-.75z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </td>
      ) : null}
    </tr>
  );
}
