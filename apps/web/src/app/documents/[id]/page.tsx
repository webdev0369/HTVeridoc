'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { type ProcessingEventDto } from '@/components/processing-log';
import {
  PdfViewer,
  type ColumnMapSeedPick,
  type PdfHighlight,
} from '@/components/pdf-viewer';
import { LineItemsTable } from '@/components/line-items-table';
import { ReviewActions } from '@/components/review-actions';
import {
  ProcessingSidebar,
  ReviewEditor,
} from '@/components/review-editor';
import { StatusBadge } from '@/components/status-badge';
import {
  DocumentPageSkeleton,
  LineItemsTableSkeleton,
  ReviewFooterActionsSkeleton,
  ReviewSidebarSkeleton,
} from '@/components/document-review-skeletons';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { isEmbedSession } from '@/lib/editor-session';
import {
  assignColumnValuesToLines,
  collectColumnBandValues,
  columnMapLabel,
  columnMapParseMode,
  type ColumnMapAssignment,
} from '@/lib/column-map';
import { isDateFieldKey, normalizeDateInput } from '@/lib/date-format';
import {
  buildReviewQueue,
  nextReviewSelection,
} from '@/lib/review-queue';
import {
  getLineColumnValue,
  highlightRoleForColumn,
  lineColumnToPatch,
  type LineReviewColumn,
  type ReviewSelection,
} from '@/lib/review-types';
import type {
  DocumentDto,
  EditorLinkDto,
  ExtractionDto,
  ExtractionLineItemDto,
  FieldConfigResponse,
  ProcessResponse,
  ValidationDto,
} from '@/lib/types';

const LIVE_STATUSES = new Set([
  'PROCESSING',
  'EXTRACTED',
  'VALIDATING',
  'APPROVED',
  'EXPORTING',
]);
const REVIEW_EDIT_STATUSES = new Set([
  'EXTRACTED',
  'READY_FOR_REVIEW',
  'IN_REVIEW',
  'VALIDATION_FAILED',
]);
/** Statuses where completed extraction should be shown in the review UI */
const REVIEW_UI_STATUSES = new Set([
  'EXTRACTED',
  'VALIDATING',
  'READY_FOR_REVIEW',
  'IN_REVIEW',
  'VALIDATION_FAILED',
  'APPROVED',
  'EXPORTING',
  'EXPORTED',
  'EXPORT_FAILED',
  'REJECTED',
]);

function hasPerm(permissions: string[] | undefined, code: string) {
  return Boolean(permissions?.includes(code));
}

function toApiScalar(value: string | number | null | undefined) {
  if (value == null) return null;
  return String(value);
}

function selectionPickKey(sel: NonNullable<ReviewSelection>): string {
  if (sel.type === 'field') return `field:${sel.id}`;
  return `line:${sel.id}:${sel.column}`;
}

function mergePickBoxes(
  a?: { x: number; y: number; width: number; height: number } | null,
  b?: { x: number; y: number; width: number; height: number } | null,
) {
  if (!a) return b ?? undefined;
  if (!b) return a;
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.width, b.x + b.width);
  const y2 = Math.max(a.y + a.height, b.y + b.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function linePatchToApiBody(patch: Partial<ExtractionLineItemDto>) {
  const body: Record<string, unknown> = {};
  if ('articleNumber' in patch) body.articleNumber = patch.articleNumber;
  if ('description' in patch) body.description = patch.description;
  if ('unit' in patch) body.unit = patch.unit;
  if ('purchaseUnit' in patch) body.purchaseUnit = patch.purchaseUnit;
  if ('stocktakingUnit' in patch) body.stocktakingUnit = patch.stocktakingUnit;
  if ('quantity' in patch) body.quantity = toApiScalar(patch.quantity);
  if ('purchaseQuantity' in patch) {
    body.purchaseQuantity = toApiScalar(patch.purchaseQuantity);
  }
  if ('stockTakingQuantity' in patch) {
    body.stockTakingQuantity = toApiScalar(patch.stockTakingQuantity);
  }
  if ('stockTakingQuantityPerPurchaseUnit' in patch) {
    body.stockTakingQuantityPerPurchaseUnit = toApiScalar(
      patch.stockTakingQuantityPerPurchaseUnit,
    );
  }
  if ('baseMeasurementUnit' in patch) {
    body.baseMeasurementUnit = patch.baseMeasurementUnit;
  }
  if ('baseContentQuantity' in patch) {
    body.baseContentQuantity = toApiScalar(patch.baseContentQuantity);
  }
  if ('pricePerBaseUnit' in patch) {
    body.pricePerBaseUnit = toApiScalar(patch.pricePerBaseUnit);
  }
  if ('stockTakingQuantityPerBaseMeasurementUnit' in patch) {
    body.stockTakingQuantityPerBaseMeasurementUnit = toApiScalar(
      patch.stockTakingQuantityPerBaseMeasurementUnit,
    );
  }
  if ('unitPrice' in patch) body.unitPrice = toApiScalar(patch.unitPrice);
  if ('stocktakingUnitPrice' in patch) {
    body.stocktakingUnitPrice = toApiScalar(patch.stocktakingUnitPrice);
  }
  if ('discount' in patch) body.discount = toApiScalar(patch.discount);
  if ('vat' in patch) body.vat = toApiScalar(patch.vat);
  if ('amount' in patch) body.amount = toApiScalar(patch.amount);
  if ('lineType' in patch) body.lineType = patch.lineType;
  return body;
}

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const { user, loading: authLoading, isEmbed } = useAuth();
  const embedMode = isEmbed || isEmbedSession(id);
  const shellLayout = embedMode ? 'embed' : 'workspace';

  const [selection, setSelection] = useState<ReviewSelection>(null);
  const [mapColumn, setMapColumn] = useState<LineReviewColumn | null>(null);
  /** Signals LineItemsTable which line cell was just confirmed via PDF ✓. */
  const [lineConfirmSignal, setLineConfirmSignal] = useState<{
    lineId: string;
    column: LineReviewColumn;
    at: number;
  } | null>(null);
  const [mapPreview, setMapPreview] = useState<{
    column: LineReviewColumn;
    page: number;
    assignments: ColumnMapAssignment[];
  } | null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [tableHeight, setTableHeight] = useState(280);
  const splitRef = useRef<HTMLDivElement>(null);
  const resizingSplit = useRef(false);
  const tableHeightRef = useRef(tableHeight);
  tableHeightRef.current = tableHeight;
  /** Avoid re-firing auto-validate for the same document while stuck on EXTRACTED */
  const autoValidateRef = useRef<string | null>(null);
  const autoStartReviewRef = useRef<string | null>(null);
  /** Local review draft — flushed once on Confirm / Re-validate. */
  const pendingDraftRef = useRef<{
    fields: Map<string, string | null>;
    lines: Map<string, Partial<ExtractionLineItemDto>>;
  }>({ fields: new Map(), lines: new Map() });
  const pdfPickSessionRef = useRef<{ key: string; count: number }>({
    key: '',
    count: 0,
  });
  const [dirtyTick, setDirtyTick] = useState(0);
  const [savingDraft, setSavingDraft] = useState(false);
  const [reloadPromptOpen, setReloadPromptOpen] = useState(false);
  /** Skip native leave dialog after Save/Discard & reload from our modal. */
  const skipBeforeUnloadRef = useRef(false);
  const hasUnsavedEdits =
    pendingDraftRef.current.fields.size > 0 ||
    pendingDraftRef.current.lines.size > 0;
  void dirtyTick;

  useEffect(() => {
    try {
      const saved = localStorage.getItem('htveridoc.lineTableHeight');
      // Restore height; live drag still clamps to viewport (PDF ≥160px).
      if (saved) setTableHeight(Math.max(160, Math.min(1200, Number(saved))));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingSplit.current || !splitRef.current) return;
      const rect = splitRef.current.getBoundingClientRect();
      const fromBottom = rect.bottom - e.clientY;
      // Keep PDF usable (≥160px) while allowing a large line-items panel.
      const next = Math.max(160, Math.min(rect.height - 160, fromBottom));
      tableHeightRef.current = next;
      setTableHeight(next);
    };
    const onUp = () => {
      if (!resizingSplit.current) return;
      resizingSplit.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem(
        'htveridoc.lineTableHeight',
        String(tableHeightRef.current),
      );
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ['documents', id],
    queryFn: () => apiFetch<DocumentDto>(`/documents/${id}`),
    enabled: Boolean(id),
    refetchInterval: (query) =>
      query.state.data?.status && LIVE_STATUSES.has(query.state.data.status)
        ? 1500
        : false,
  });

  const extractionQuery = useQuery({
    queryKey: ['extraction', id],
    queryFn: () => apiFetch<ExtractionDto>(`/documents/${id}/extraction`),
    enabled: Boolean(id) && Boolean(data) && data?.status !== 'UPLOADED',
    retry: false,
    refetchInterval: (query) =>
      (data?.status && LIVE_STATUSES.has(data.status)) ||
      query.state.data?.status === 'pending'
        ? 1500
        : false,
  });

  const validationQuery = useQuery({
    queryKey: ['validation', id],
    queryFn: () => apiFetch<ValidationDto>(`/documents/${id}/validation`),
    enabled:
      Boolean(id) &&
      Boolean(data?.status) &&
      [
        'EXTRACTED',
        'READY_FOR_REVIEW',
        'IN_REVIEW',
        'APPROVED',
        'REJECTED',
        'VALIDATION_FAILED',
        'VALIDATING',
      ].includes(data?.status ?? ''),
    retry: false,
  });

  const eventsQuery = useQuery({
    queryKey: ['events', id],
    queryFn: () =>
      apiFetch<ProcessingEventDto[]>(`/documents/${id}/events`),
    enabled: Boolean(id) && Boolean(data) && data?.status !== 'UPLOADED',
    refetchInterval: () =>
      data?.status && LIVE_STATUSES.has(data.status) ? 800 : false,
  });

  const fieldConfigQuery = useQuery({
    queryKey: ['field-config', data?.documentType],
    queryFn: () =>
      apiFetch<FieldConfigResponse>(
        `/field-config?documentType=${encodeURIComponent(data!.documentType)}`,
      ),
    enabled: Boolean(data?.documentType),
  });

  const invalidateDoc = () => {
    queryClient.invalidateQueries({ queryKey: ['documents', id] });
    queryClient.invalidateQueries({ queryKey: ['extraction', id] });
    queryClient.invalidateQueries({ queryKey: ['validation', id] });
    queryClient.invalidateQueries({ queryKey: ['events', id] });
    queryClient.invalidateQueries({ queryKey: ['documents'] });
  };

  const markDraftDirty = () => setDirtyTick((n) => n + 1);

  const clearPendingDraft = () => {
    pendingDraftRef.current = { fields: new Map(), lines: new Map() };
    markDraftDirty();
  };

  const queueFieldEdit = (fieldId: string, currentValue: string | null) => {
    pendingDraftRef.current.fields.set(fieldId, currentValue);
    queryClient.setQueryData<ExtractionDto>(['extraction', id], (prev) => {
      if (!prev?.fields) return prev;
      return {
        ...prev,
        fields: prev.fields.map((f) =>
          f.id === fieldId
            ? { ...f, currentValue, isUserEdited: true }
            : f,
        ),
      };
    });
    markDraftDirty();
  };

  const queueLineEdit = (
    lineItemId: string,
    patch: Partial<ExtractionLineItemDto>,
  ) => {
    const prev = pendingDraftRef.current.lines.get(lineItemId) ?? {};
    pendingDraftRef.current.lines.set(lineItemId, { ...prev, ...patch });
    queryClient.setQueryData<ExtractionDto>(['extraction', id], (prevExt) => {
      if (!prevExt?.lineItems) return prevExt;
      return {
        ...prevExt,
        lineItems: prevExt.lineItems.map((l) =>
          l.id === lineItemId ? { ...l, ...patch, isUserEdited: true } : l,
        ),
      };
    });
    markDraftDirty();
  };

  const buildDraftBatchPayload = () => {
    const draft = pendingDraftRef.current;
    if (draft.fields.size === 0 && draft.lines.size === 0) return null;
    return {
      fields: [...draft.fields.entries()].map(([fieldId, currentValue]) => ({
        fieldId,
        currentValue,
      })),
      lineItems: [...draft.lines.entries()].map(([lineItemId, patch]) => ({
        lineItemId,
        ...linePatchToApiBody(patch),
      })),
    };
  };

  const flushPendingEdits = async () => {
    const payload = buildDraftBatchPayload();
    if (!payload) return;

    await apiFetch<{ ok: true }>(`/documents/${id}/extraction/batch`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    clearPendingDraft();
  };

  const saveDraftNow = async () => {
    if (savingDraft) return;
    setSavingDraft(true);
    try {
      await flushPendingEdits();
      toast.success('Edits saved');
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Failed to save edits',
      );
    } finally {
      setSavingDraft(false);
    }
  };

  const discardDraftNow = () => {
    if (!hasUnsavedEdits) return;
    const ok = window.confirm(
      'Discard unsaved cell edits? This cannot be undone.',
    );
    if (!ok) return;
    clearPendingDraft();
    // Reload extraction from server so UI matches last saved values.
    void queryClient.invalidateQueries({ queryKey: ['extraction', id] });
    toast.message('Unsaved edits discarded');
  };

  useEffect(() => {
    clearPendingDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset draft on document change
  }, [id]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (skipBeforeUnloadRef.current) return;
      const payload = buildDraftBatchPayload();
      if (!payload) return;

      // Best-effort save if the user leaves via browser chrome / close tab.
      try {
        const accessToken =
          typeof window !== 'undefined'
            ? localStorage.getItem('accessToken')
            : null;
        const apiBase =
          process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        void fetch(`${apiBase}/documents/${id}/extraction/batch`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken
              ? { Authorization: `Bearer ${accessToken}` }
              : {}),
          },
          body: JSON.stringify(payload),
          keepalive: true,
        });
      } catch {
        /* ignore — browser leave dialog still shown */
      }

      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- id + draft helpers
  }, [id]);

  // Custom modal for F5 / Ctrl+R (browser cannot show a custom UI for the
  // toolbar reload button — that still uses the native leave dialog).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isRefresh =
        e.key === 'F5' ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r');
      if (!isRefresh) return;
      if (
        pendingDraftRef.current.fields.size === 0 &&
        pendingDraftRef.current.lines.size === 0
      ) {
        return;
      }
      e.preventDefault();
      setReloadPromptOpen(true);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const reloadAfterSave = async () => {
    setSavingDraft(true);
    try {
      await flushPendingEdits();
      toast.success('Edits saved');
      skipBeforeUnloadRef.current = true;
      window.location.reload();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Failed to save edits',
      );
      setSavingDraft(false);
    }
  };

  const reloadAfterDiscard = () => {
    clearPendingDraft();
    skipBeforeUnloadRef.current = true;
    window.location.reload();
  };

  const afterExtractionEdit = (extraction: ExtractionDto) => {
    queryClient.setQueryData<ExtractionDto>(['extraction', id], (prev) => {
      if (!prev) return extraction;
      return {
        ...extraction,
        rawResponse: prev.rawResponse ?? extraction.rawResponse,
        structuredData: prev.structuredData ?? extraction.structuredData,
      };
    });
    queryClient.invalidateQueries({ queryKey: ['documents', id] });
    queryClient.invalidateQueries({ queryKey: ['events', id] });
  };

  const processMutation = useMutation({
    mutationFn: () =>
      apiFetch<ProcessResponse>(`/documents/${id}/process`, { method: 'POST' }),
    onSuccess: invalidateDoc,
  });

  const revalidateMutation = useMutation({
    mutationFn: async () => {
      await flushPendingEdits();
      return apiFetch<ValidationDto>(`/documents/${id}/validate`, {
        method: 'POST',
      });
    },
    onSuccess: invalidateDoc,
  });

  // If extraction finished but validation never advanced the status, show data
  // and resume validation automatically.
  useEffect(() => {
    if (!id || !data) return;
    if (data.status !== 'EXTRACTED') return;
    if (extractionQuery.data?.status !== 'completed') return;
    if (revalidateMutation.isPending) return;
    if (autoValidateRef.current === id) return;
    autoValidateRef.current = id;
    revalidateMutation.mutate();
  }, [
    id,
    data,
    extractionQuery.data?.status,
    revalidateMutation,
  ]);

  const startReviewMutation = useMutation({
    mutationFn: () =>
      apiFetch<DocumentDto>(`/documents/${id}/review/start`, {
        method: 'POST',
      }),
    onSuccess: (doc) => {
      queryClient.setQueryData(['documents', id], doc);
      invalidateDoc();
    },
  });

  // Client backup: if GET already flipped status server-side, cache updates on
  // refetch. Also call start when still ready (e.g. stale cache).
  useEffect(() => {
    if (!id || !data) return;
    if (
      data.status !== 'READY_FOR_REVIEW' &&
      data.status !== 'VALIDATION_FAILED'
    ) {
      return;
    }
    if (!hasPerm(user?.permissions, 'document.edit')) return;
    if (autoStartReviewRef.current === id) return;
    if (startReviewMutation.isPending) return;
    autoStartReviewRef.current = id;
    startReviewMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutate once per doc open
  }, [id, data?.status, user?.permissions]);

  const approveMutation = useMutation({
    mutationFn: async () => {
      await flushPendingEdits();
      const validation = await apiFetch<ValidationDto>(
        `/documents/${id}/validate`,
        { method: 'POST' },
      );
      queryClient.setQueryData(['validation', id], validation);
      return apiFetch<DocumentDto>(`/documents/${id}/approve`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      clearPendingDraft();
      invalidateDoc();
      toast.success('Document approved');
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Approve failed');
      void queryClient.invalidateQueries({ queryKey: ['validation', id] });
    },
  });

  const editorLinkMutation = useMutation({
    mutationFn: () =>
      apiFetch<EditorLinkDto>('/integrations/handoff/editor-link', {
        method: 'POST',
        body: JSON.stringify({ documentId: id }),
      }),
    onSuccess: async (data) => {
      try {
        await navigator.clipboard.writeText(data.url);
        toast.success('Editor link copied — share with other systems');
      } catch {
        toast.message('Editor link ready', { description: data.url });
      }
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not create editor link',
      );
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (reason?: string) =>
      apiFetch<DocumentDto>(`/documents/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      invalidateDoc();
      toast.success('Document rejected');
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Reject failed');
    },
  });

  const reopenMutation = useMutation({
    mutationFn: () =>
      apiFetch<DocumentDto>(`/documents/${id}/reopen`, { method: 'POST' }),
    onSuccess: () => {
      invalidateDoc();
      toast.success('Document reopened for review');
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Reopen failed');
    },
  });

  const addLineMutation = useMutation({
    mutationFn: () =>
      apiFetch<ExtractionDto>(`/documents/${id}/extraction/line-items`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: afterExtractionEdit,
  });

  const deleteLineMutation = useMutation({
    mutationFn: (lineItemId: string) =>
      apiFetch<ExtractionDto>(
        `/documents/${id}/extraction/line-items/${lineItemId}`,
        { method: 'DELETE' },
      ),
    onMutate: async (lineItemId) => {
      await queryClient.cancelQueries({ queryKey: ['extraction', id] });
      const prevExtraction = queryClient.getQueryData<ExtractionDto>([
        'extraction',
        id,
      ]);
      const prevValidation = queryClient.getQueryData<ValidationDto>([
        'validation',
        id,
      ]);

      if (prevExtraction) {
        const nextLines = (prevExtraction.lineItems ?? []).filter(
          (l) => l.id !== lineItemId,
        );
        queryClient.setQueryData<ExtractionDto>(['extraction', id], {
          ...prevExtraction,
          lineItems: nextLines,
          summary: prevExtraction.summary
            ? {
                ...prevExtraction.summary,
                lineItemCount: nextLines.length,
                cancelledLineCount: nextLines.filter(
                  (l) => l.lineType === 'CANCELLED',
                ).length,
                feeLineCount: nextLines.filter((l) => l.lineType === 'FEE')
                  .length,
              }
            : prevExtraction.summary,
        });
      }

      if (prevValidation) {
        const nextErrors = (prevValidation.errors ?? []).filter(
          (e) => e.lineItemId !== lineItemId,
        );
        const errorCount = nextErrors.filter((e) => e.severity === 'error')
          .length;
        const warningCount = nextErrors.filter(
          (e) => e.severity === 'warning',
        ).length;
        queryClient.setQueryData<ValidationDto>(['validation', id], {
          ...prevValidation,
          errors: nextErrors,
          errorCount,
          warningCount,
          status:
            errorCount > 0
              ? 'failed'
              : warningCount > 0
                ? 'passed_with_warnings'
                : 'passed',
        });
      }

      setSelection((prev) =>
        prev?.type === 'line' && prev.id === lineItemId ? null : prev,
      );

      pendingDraftRef.current.lines.delete(lineItemId);
      markDraftDirty();

      return { prevExtraction, prevValidation };
    },
    onError: (_err, _lineItemId, ctx) => {
      if (ctx?.prevExtraction) {
        queryClient.setQueryData(['extraction', id], ctx.prevExtraction);
      }
      if (ctx?.prevValidation) {
        queryClient.setQueryData(['validation', id], ctx.prevValidation);
      }
    },
    onSuccess: (extraction) => {
      afterExtractionEdit(extraction);
    },
  });

  const bulkColumnMutation = useMutation({
    mutationFn: (payload: {
      column: LineReviewColumn;
      values: Array<{ lineItemId: string; value: string | null }>;
    }) =>
      apiFetch<ExtractionDto>(
        `/documents/${id}/extraction/line-items/bulk-column`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: (extraction) => {
      afterExtractionEdit(extraction);
      setMapPreview(null);
      setMapColumn(null);
    },
  });

  const canEdit =
    Boolean(data) &&
    REVIEW_EDIT_STATUSES.has(data!.status) &&
    hasPerm(user?.permissions, 'document.edit');

  const canProcess =
    data &&
    [
      'UPLOADED',
      'EXTRACTED',
      'READY_FOR_REVIEW',
      'IN_REVIEW',
      'EXTRACTION_FAILED',
      'PROCESSING_FAILED',
      'VALIDATION_FAILED',
      'REJECTED',
    ].includes(data.status);

  const canRevalidate =
    data &&
    extractionQuery.data?.status === 'completed' &&
    REVIEW_EDIT_STATUSES.has(data.status) &&
    hasPerm(user?.permissions, 'document.edit');

  const canStartReview =
    data?.status === 'READY_FOR_REVIEW' ||
    data?.status === 'VALIDATION_FAILED'
      ? hasPerm(user?.permissions, 'document.edit')
      : false;

  const canApprove =
    data &&
    REVIEW_EDIT_STATUSES.has(data.status) &&
    hasPerm(user?.permissions, 'document.approve');

  const canReject =
    data &&
    REVIEW_EDIT_STATUSES.has(data.status) &&
    hasPerm(user?.permissions, 'document.reject');

  const canReopen =
    Boolean(data) &&
    (data!.status === 'APPROVED' ||
      data!.status === 'REJECTED' ||
      data!.status === 'EXPORTED' ||
      data!.status === 'EXPORT_FAILED') &&
    hasPerm(user?.permissions, 'document.edit');

  const reviewBusy =
    startReviewMutation.isPending ||
    approveMutation.isPending ||
    rejectMutation.isPending ||
    reopenMutation.isPending;

  const highlight: PdfHighlight | null = useMemo(() => {
    if (!selection) return null;
    return {
      page: selection.page ?? pdfPage,
      boundingBox: selection.boundingBox,
      tone: selection.tone,
      label: selection.label,
      value: selection.value,
      anchorHints: selection.anchorHints,
      role:
        selection.type === 'line'
          ? highlightRoleForColumn(selection.column)
          : undefined,
    };
  }, [selection, pdfPage]);

  const handleSelect = (next: ReviewSelection) => {
    if (mapColumn) return; // ignore normal selection while mapping a column
    pdfPickSessionRef.current = { key: '', count: 0 };
    setSelection(next);
    if (next?.page) setPdfPage(next.page);
  };

  const handleStartMapColumn = (column: LineReviewColumn) => {
    setMapPreview(null);
    setMapColumn(column);
    setSelection(null);
  };

  const handleCancelMapColumn = () => {
    setMapColumn(null);
    setMapPreview(null);
  };

  const handleColumnMapSeedPick = (pick: ColumnMapSeedPick) => {
    if (!mapColumn || !extractionQuery.data) return;
    const mode = columnMapParseMode(mapColumn);
    const band = collectColumnBandValues(pick.pageItems, pick.seed, mode);
    const assignments = assignColumnValuesToLines(
      extractionQuery.data.lineItems ?? [],
      pick.page,
      band,
      (line) => getLineColumnValue(line, mapColumn),
      pick.pageItems,
    );
    setMapPreview({
      column: mapColumn,
      page: pick.page,
      assignments,
    });
  };

  const handleApplyColumnMap = async () => {
    if (!mapPreview) return;
    const values = mapPreview.assignments
      .map((a) => ({
        lineItemId: a.lineItemId,
        value: a.next?.trim() || null,
      }))
      .filter(
        (a): a is { lineItemId: string; value: string } =>
          a.value != null && a.value !== '',
      );
    if (!values.length) return;
    await bulkColumnMutation.mutateAsync({
      column: mapPreview.column,
      values,
    });
  };

  const handleMapPreviewValueChange = (
    lineItemId: string,
    nextValue: string,
  ) => {
    setMapPreview((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        assignments: prev.assignments.map((row) =>
          row.lineItemId === lineItemId
            ? { ...row, next: nextValue }
            : row,
        ),
      };
    });
  };

  const normalizeFieldValue = (
    selection: Exclude<ReviewSelection, null>,
    raw: string | null,
  ): string | null => {
    if (raw == null) return null;
    if (
      selection.type === 'field' &&
      isDateFieldKey(selection.fieldKey)
    ) {
      return normalizeDateInput(raw);
    }
    return raw;
  };

  const handlePdfValuePick = (
    value: string,
    box?: { x: number; y: number; width: number; height: number },
    opts?: { append?: boolean },
  ) => {
    if (!selection || !canEdit || !value.trim()) return;
    const picked = value.trim();

    if (selection.type === 'field') {
      const currentValue = normalizeFieldValue(selection, picked);
      queueFieldEdit(selection.id, currentValue);
      setSelection({
        ...selection,
        value: currentValue,
        tone: 'edited',
        page: pdfPage,
        boundingBox: box ?? selection.boundingBox,
      });
      return;
    }

    if (selection.type === 'line') {
      // Description: each click replaces with text at that click.
      // Shift+click appends (for rare extra fragments).
      const appendDescription =
        selection.column === 'description' && Boolean(opts?.append);
      let nextText = picked;
      if (appendDescription) {
        const prev = selection.value?.trim() ?? '';
        if (prev) {
          if (prev === picked || prev.includes(picked)) {
            nextText = prev;
          } else if (picked.includes(prev)) {
            nextText = picked;
          } else {
            nextText = `${prev} ${picked}`;
          }
        }
      }

      const nextBox =
        appendDescription && box
          ? mergePickBoxes(selection.boundingBox, box)
          : (box ?? selection.boundingBox);

      const patch = lineColumnToPatch(selection.column, nextText);
      queueLineEdit(selection.id, patch);
      if (selection.column !== 'description') {
        setLineConfirmSignal({
          lineId: selection.id,
          column: selection.column,
          at: Date.now(),
        });
      }
      setSelection({
        ...selection,
        value: nextText,
        tone: 'edited',
        page: pdfPage,
        boundingBox: nextBox,
      });
    }
  };

  /** Local draft only — API flush on Confirm / Re-validate. */
  const handleConfirmValue = (editedValue?: string) => {
    if (!selection || !canEdit) return;
    const next =
      editedValue !== undefined
        ? editedValue.trim() || null
        : selection.value?.trim() || null;

    const current = selection;

    if (current.type === 'field') {
      const currentValue = normalizeFieldValue(current, next);
      queueFieldEdit(current.id, currentValue);
    } else {
      const patch = lineColumnToPatch(current.column, next);
      queueLineEdit(current.id, patch);
      setLineConfirmSignal({
        lineId: current.id,
        column: current.column,
        at: Date.now(),
      });
    }

    const extraction = queryClient.getQueryData<ExtractionDto>([
      'extraction',
      id,
    ]);
    const queue = buildReviewQueue(
      extraction,
      fieldConfigQuery.data?.fields,
      validationQuery.data,
    );
    const following = nextReviewSelection(queue, {
      ...current,
      value: next,
      tone: 'edited',
    });

    if (following) {
      handleSelect(following);
    } else {
      setSelection({ ...current, value: next, tone: 'edited' });
    }
  };

  const handleClearValue = () => {
    if (!selection || !canEdit) return;
    pdfPickSessionRef.current = {
      key: selectionPickKey(selection),
      count: 0,
    };
    if (selection.type === 'field') {
      queueFieldEdit(selection.id, null);
      setSelection({ ...selection, value: null, tone: 'ai' });
      return;
    }
    const patch = lineColumnToPatch(selection.column, null);
    queueLineEdit(selection.id, patch);
    setSelection({ ...selection, value: null, tone: 'ai' });
  };

  const isLive = Boolean(data?.status && LIVE_STATUSES.has(data.status));
  const extractionReady = extractionQuery.data?.status === 'completed';
  const showFields =
    Boolean(data) &&
    extractionReady &&
    REVIEW_UI_STATUSES.has(data!.status);
  // Prefer extracted fields over the spinner when data already exists
  const showProcessingPanel =
    !showFields &&
    (isLive ||
      data?.status === 'EXTRACTION_FAILED' ||
      data?.status === 'PROCESSING_FAILED' ||
      (data?.status === 'UPLOADED' && !extractionQuery.data));

  const requiredIncomplete = useMemo(() => {
    const configs = fieldConfigQuery.data?.fields ?? [];
    const extractionFields = extractionQuery.data?.fields ?? [];
    const byKey = new Map(extractionFields.map((f) => [f.fieldKey, f]));
    const missingLabels: string[] = [];
    for (const cfg of configs) {
      if (cfg.mode !== 'REQUIRED') continue;
      const field = byKey.get(cfg.fieldKey);
      if (!field?.currentValue?.trim()) {
        missingLabels.push(cfg.label);
      }
    }
    if (
      fieldConfigQuery.data?.requiresLineItems &&
      !(extractionQuery.data?.lineItems ?? []).length
    ) {
      missingLabels.push('Line items');
    }
    return missingLabels;
  }, [fieldConfigQuery.data, extractionQuery.data]);

  const confirmationBlockers = useMemo(() => {
    if (data?.status === 'APPROVED' || data?.status === 'REJECTED') return [];
    return (validationQuery.data?.errors ?? []).filter(
      (e) => e.severity === 'error',
    );
  }, [data?.status, validationQuery.data]);

  if (isLoading) {
    return (
      <AppShell layout={shellLayout}>
        <DocumentPageSkeleton />
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell layout={shellLayout}>
        <div className="flex flex-1 items-center justify-center text-rose-300">
          Failed to load document.
        </div>
      </AppShell>
    );
  }

  const actionError = processMutation.error || revalidateMutation.error;

  const hasReviewActions =
    canStartReview || canApprove || canReject || canReopen;
  /** Permissions / extraction still resolving — show button skeletons instead of empty footer. */
  const reviewActionsPending =
    authLoading ||
    (Boolean(data) &&
      REVIEW_UI_STATUSES.has(data!.status) &&
      (extractionQuery.isLoading || extractionQuery.isFetching) &&
      !extractionQuery.data);

  const reviewFooter = reviewActionsPending ? (
    <ReviewFooterActionsSkeleton stacked />
  ) : hasReviewActions ? (
    <div className="space-y-0">
      <ReviewActions
        stacked
        canStartReview={Boolean(canStartReview)}
        canApprove={Boolean(canApprove)}
        canReject={Boolean(canReject)}
        canReopen={Boolean(canReopen)}
        approveDisabled={requiredIncomplete.length > 0}
        approveDisabledReason={
          requiredIncomplete.length
            ? `Required: ${requiredIncomplete.join(', ')}`
            : confirmationBlockers.length
              ? `Will re-check ${confirmationBlockers.length} blocker(s) on Confirm`
              : undefined
        }
        busy={reviewBusy}
        onStartReview={() => startReviewMutation.mutate()}
        onApprove={() => approveMutation.mutate()}
        onReject={(reason) => {
          if (hasUnsavedEdits) {
            const ok = window.confirm(
              'You have unsaved cell edits. Reject anyway and discard them?',
            );
            if (!ok) return;
            clearPendingDraft();
          }
          rejectMutation.mutate(reason);
        }}
        onReopen={() => reopenMutation.mutate()}
        error={
          startReviewMutation.error ||
          approveMutation.error ||
          rejectMutation.error ||
          reopenMutation.error
        }
      />
    </div>
  ) : null;

  return (
    <AppShell layout={shellLayout}>
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-[#121826] px-4 py-2">
        {!embedMode && (
          <>
            <Link
              href="/documents"
              className="shrink-0 text-sm font-medium text-slate-400 hover:text-white"
            >
              ← Documents
            </Link>
            <div className="h-4 w-px bg-white/10" />
          </>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-sm font-semibold text-white">
              {data.fileName}
            </h1>
            <StatusBadge status={data.status} variant="dark" />
            {hasUnsavedEdits && (
              <div
                className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-md bg-amber-500/15 px-2 py-1 text-[11px] font-medium text-amber-100 ring-1 ring-amber-400/30"
                title="Save before refresh, or continue editing then Confirm"
              >
                <span className="whitespace-nowrap">Unsaved edits</span>
                <button
                  type="button"
                  disabled={savingDraft}
                  onClick={() => void saveDraftNow()}
                  className="rounded bg-amber-400/25 px-2 py-0.5 font-semibold text-amber-50 hover:bg-amber-400/40 disabled:opacity-50"
                >
                  {savingDraft ? 'Saving…' : 'Save now'}
                </button>
                <button
                  type="button"
                  disabled={savingDraft}
                  onClick={discardDraftNow}
                  className="rounded px-2 py-0.5 text-amber-200/90 hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                  Discard
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!embedMode && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={editorLinkMutation.isPending}
              onClick={() => editorLinkMutation.mutate()}
              className="text-slate-300 hover:bg-white/5 hover:text-white"
              title="Copy secure link for other systems to open this review"
            >
              {editorLinkMutation.isPending ? 'Link…' : 'Copy editor link'}
            </Button>
          )}
          {canRevalidate && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={revalidateMutation.isPending}
              onClick={() => revalidateMutation.mutate()}
              className="text-slate-300 hover:bg-white/5 hover:text-white"
              title="Save draft and re-run validation"
            >
              {revalidateMutation.isPending ? 'Validating…' : 'Re-validate'}
            </Button>
          )}
          {!embedMode && canProcess && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={processMutation.isPending}
              onClick={() => {
                if (hasUnsavedEdits) {
                  const ok = window.confirm(
                    'You have unsaved cell edits. Reprocess will discard them. Continue?',
                  );
                  if (!ok) return;
                  clearPendingDraft();
                }
                processMutation.mutate();
              }}
              className="text-slate-300 hover:bg-white/5 hover:text-white"
            >
              {processMutation.isPending
                ? 'Starting…'
                : data.status === 'UPLOADED'
                  ? 'Extract'
                  : 'Reprocess'}
            </Button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="shrink-0 border-b border-rose-500/30 bg-rose-950/50 px-4 py-2 text-sm text-rose-200">
          {actionError instanceof ApiError
            ? actionError.message
            : 'Something went wrong'}
        </div>
      )}

      {/* Rossum layout: fields left | PDF top-right + line table bottom-right */}
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="min-h-0 min-w-0 overflow-hidden border-b border-white/10 lg:border-b-0 lg:border-r lg:border-white/10">
          {showFields && extractionQuery.data ? (
            <ReviewEditor
              extraction={extractionQuery.data}
              validation={validationQuery.data}
              fieldConfig={fieldConfigQuery.data?.fields}
              events={eventsQuery.data ?? []}
              editable={canEdit}
              selection={selection}
              onSelect={handleSelect}
              saving={false}
              footer={reviewFooter}
              onSaveField={async (fieldId, currentValue) => {
                const field = extractionQuery.data?.fields?.find(
                  (f) => f.id === fieldId,
                );
                const normalized =
                  field && isDateFieldKey(field.fieldKey)
                    ? normalizeDateInput(currentValue)
                    : currentValue;
                queueFieldEdit(fieldId, normalized);
              }}
            />
          ) : reviewActionsPending ||
            (Boolean(data) &&
              REVIEW_UI_STATUSES.has(data.status) &&
              extractionQuery.isLoading) ? (
            <ReviewSidebarSkeleton />
          ) : showProcessingPanel ? (
            <ProcessingSidebar
              events={eventsQuery.data ?? []}
              status={data.status}
              errorMessage={
                extractionQuery.data?.status === 'failed'
                  ? extractionQuery.data.errorMessage
                  : data.status === 'UPLOADED'
                    ? 'Click Extract with Gemini to start processing.'
                    : null
              }
              onRetry={
                canProcess ? () => processMutation.mutate() : undefined
              }
              retrying={processMutation.isPending}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-sm text-slate-500">
              Waiting for extraction…
            </div>
          )}
        </aside>

        <div ref={splitRef} className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <PdfViewer
            documentId={id}
            page={pdfPage}
            onPageChange={setPdfPage}
            highlight={mapColumn ? null : highlight}
            pickMode={Boolean(selection && canEdit && !mapColumn)}
            columnMapMode={Boolean(mapColumn && canEdit)}
            columnMapHint={
              mapColumn
                ? columnMapParseMode(mapColumn) === 'unit'
                  ? `Map column: click Enhet / unit cell for “${columnMapLabel(mapColumn)}” — only the unit (D from “1 D”) is taken`
                  : columnMapParseMode(mapColumn) === 'numeric' &&
                      (mapColumn === 'purchaseQuantity' ||
                        mapColumn === 'stockTakingQuantity')
                    ? `Map column: click Levert antall / delivered qty for “${columnMapLabel(mapColumn)}” (not Bestilt antall / ordered). Empty cells stay empty.`
                    : mapColumn === 'description'
                      ? `Map column: click a product name under “${columnMapLabel(mapColumn)}” — multi-line names are kept per row`
                      : `Map column: click the first table cell for “${columnMapLabel(mapColumn)}” (header text above the table is ignored)`
                : null
            }
            onColumnMapSeedPick={handleColumnMapSeedPick}
            onValuePick={(value, box, opts) => {
              void handlePdfValuePick(value, box, opts);
            }}
            onConfirmValue={(value) => {
              void handleConfirmValue(value);
            }}
            onClearValue={() => {
              void handleClearValue();
            }}
            confirming={false}
            appendPickHint={
              selection?.type === 'line' && selection.column === 'description'
            }
            className="min-h-0 min-w-0 flex-1"
          />

          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize line items panel"
            onMouseDown={() => {
              resizingSplit.current = true;
              document.body.style.cursor = 'row-resize';
              document.body.style.userSelect = 'none';
            }}
            className="group relative z-10 flex h-3 shrink-0 cursor-row-resize items-center justify-center border-y border-white/10 bg-[#151b22] hover:bg-[#1c2430]"
          >
            <span className="h-1 w-10 rounded-full bg-slate-500 group-hover:bg-[#3b82f6]" />
          </div>

          <div
            style={{ height: tableHeight }}
            className="min-h-0 min-w-0 w-full shrink-0 overflow-hidden"
          >
            {showFields && extractionQuery.data ? (
              <LineItemsTable
                lineItems={extractionQuery.data.lineItems ?? []}
                validation={validationQuery.data}
                editable={canEdit}
                selection={selection}
                onSelect={handleSelect}
                mapColumn={mapColumn}
                onStartMapColumn={handleStartMapColumn}
                onCancelMapColumn={handleCancelMapColumn}
                confirmSignal={lineConfirmSignal}
                saving={
                  addLineMutation.isPending || bulkColumnMutation.isPending
                }
                actionsLoading={authLoading}
                onSaveLine={async (lineItemId, patch) => {
                  queueLineEdit(lineItemId, patch);
                }}
                onAddLine={async () => {
                  await addLineMutation.mutateAsync();
                }}
                onDeleteLine={async (lineItemId) => {
                  deleteLineMutation.mutate(lineItemId);
                }}
              />
            ) : reviewActionsPending ||
              (Boolean(data) &&
                REVIEW_UI_STATUSES.has(data.status) &&
                extractionQuery.isLoading) ? (
              <LineItemsTableSkeleton rows={4} />
            ) : (
              <div className="flex h-full items-center justify-center bg-[#0f1419] text-sm text-slate-500">
                Line items will appear here after extraction
              </div>
            )}
          </div>
        </div>
      </div>

      {mapPreview ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onClick={() => {
            if (!bulkColumnMutation.isPending) setMapPreview(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="map-column-title"
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-white/10 bg-[#151b22] shadow-2xl shadow-black/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-white/10 px-5 py-4">
              <h2
                id="map-column-title"
                className="text-base font-semibold text-white"
              >
                Map “{columnMapLabel(mapPreview.column)}”
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Values matched to rows by PDF position (empty cells stay empty
                — no shifting). Edit any New value before applying.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-1.5 font-semibold">Line</th>
                    <th className="py-1.5 font-semibold">Current</th>
                    <th className="py-1.5 font-semibold">New</th>
                  </tr>
                </thead>
                <tbody>
                  {mapPreview.assignments.map((row) => (
                    <tr
                      key={row.lineItemId}
                      className="border-t border-white/5 text-slate-300"
                    >
                      <td className="py-1.5 pr-2 align-middle">
                        {row.lineLabel}
                      </td>
                      <td className="py-1.5 pr-2 align-middle text-slate-500">
                        {row.previous ?? '—'}
                      </td>
                      <td className="py-1.5 align-middle">
                        <input
                          type="text"
                          value={row.next ?? ''}
                          disabled={bulkColumnMutation.isPending}
                          placeholder="—"
                          aria-label={`New value for ${row.lineLabel}`}
                          onChange={(e) =>
                            handleMapPreviewValueChange(
                              row.lineItemId,
                              e.target.value,
                            )
                          }
                          className="w-full min-w-[6rem] rounded-md border border-white/10 bg-[#0f1419] px-2 py-1.5 text-sm font-medium text-emerald-300 outline-none placeholder:text-slate-600 focus:border-[#3b82f6]/60 focus:ring-1 focus:ring-[#3b82f6]/40 disabled:opacity-50"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
              <button
                type="button"
                disabled={bulkColumnMutation.isPending}
                onClick={() => setMapPreview(null)}
                className="rounded-md px-3.5 py-2 text-sm font-medium text-slate-300 ring-1 ring-white/15 hover:bg-white/5 disabled:opacity-50"
              >
                Reselect
              </button>
              <button
                type="button"
                disabled={bulkColumnMutation.isPending}
                onClick={handleCancelMapColumn}
                className="rounded-md px-3.5 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  bulkColumnMutation.isPending ||
                  !mapPreview.assignments.some((a) => a.next?.trim())
                }
                onClick={() => void handleApplyColumnMap()}
                className="rounded-md bg-[#3b82f6] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#2563eb] disabled:opacity-50"
              >
                {bulkColumnMutation.isPending
                  ? 'Applying…'
                  : `Apply to ${
                      mapPreview.assignments.filter((a) => a.next?.trim())
                        .length
                    } rows`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={reloadPromptOpen} onOpenChange={setReloadPromptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Unsaved edits</DialogTitle>
            <DialogDescription>
              You have unsaved cell edits. Save them before reloading, discard
              them, or stay on this page.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={savingDraft}
              onClick={() => setReloadPromptOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={savingDraft}
              onClick={reloadAfterDiscard}
            >
              Discard & reload
            </Button>
            <Button
              type="button"
              disabled={savingDraft}
              onClick={() => void reloadAfterSave()}
            >
              {savingDraft ? 'Saving…' : 'Save & reload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
