'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
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
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  assignColumnValuesToLines,
  collectColumnBandValues,
  columnMapLabel,
  isNumericLineColumn,
  type ColumnMapAssignment,
} from '@/lib/column-map';
import {
  buildReviewQueue,
  nextReviewSelection,
} from '@/lib/review-queue';
import {
  getLineColumnValue,
  lineColumnToPatch,
  type LineReviewColumn,
  type ReviewSelection,
} from '@/lib/review-types';
import type {
  DocumentDto,
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

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [selection, setSelection] = useState<ReviewSelection>(null);
  const [mapColumn, setMapColumn] = useState<LineReviewColumn | null>(null);
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

  const revalidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    return () => {
      if (revalidateTimerRef.current) clearTimeout(revalidateTimerRef.current);
    };
  }, []);

  const invalidateDoc = () => {
    queryClient.invalidateQueries({ queryKey: ['documents', id] });
    queryClient.invalidateQueries({ queryKey: ['extraction', id] });
    queryClient.invalidateQueries({ queryKey: ['validation', id] });
    queryClient.invalidateQueries({ queryKey: ['events', id] });
    queryClient.invalidateQueries({ queryKey: ['documents'] });
  };

  const scheduleRevalidate = () => {
    if (revalidateTimerRef.current) clearTimeout(revalidateTimerRef.current);
    // Debounce so rapid deletes/edits don't each run a full validate.
    revalidateTimerRef.current = setTimeout(() => {
      void apiFetch<ValidationDto>(`/documents/${id}/validate`, {
        method: 'POST',
      })
        .then((validation) => {
          queryClient.setQueryData(['validation', id], validation);
          queryClient.invalidateQueries({ queryKey: ['documents', id] });
          queryClient.invalidateQueries({ queryKey: ['events', id] });
        })
        .catch(() => {
          queryClient.invalidateQueries({ queryKey: ['validation', id] });
        });
    }, 600);
  };

  const afterExtractionEdit = (extraction: ExtractionDto) => {
    queryClient.setQueryData<ExtractionDto>(['extraction', id], (prev) => {
      if (!prev) return extraction;
      // Keep heavy blobs from cache so edit responses stay light/fast.
      return {
        ...extraction,
        rawResponse: prev.rawResponse ?? extraction.rawResponse,
        structuredData: prev.structuredData ?? extraction.structuredData,
      };
    });
    queryClient.invalidateQueries({ queryKey: ['documents', id] });
    queryClient.invalidateQueries({ queryKey: ['events', id] });
    scheduleRevalidate();
  };

  const processMutation = useMutation({
    mutationFn: () =>
      apiFetch<ProcessResponse>(`/documents/${id}/process`, { method: 'POST' }),
    onSuccess: invalidateDoc,
  });

  const revalidateMutation = useMutation({
    mutationFn: () =>
      apiFetch<ValidationDto>(`/documents/${id}/validate`, { method: 'POST' }),
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
    onSuccess: invalidateDoc,
  });

  const approveMutation = useMutation({
    mutationFn: () =>
      apiFetch<DocumentDto>(`/documents/${id}/approve`, { method: 'POST' }),
    onSuccess: (doc) => {
      invalidateDoc();
      toast.success(
        doc.status === 'EXPORTING' || doc.status === 'EXPORTED'
          ? 'Approved — exporting…'
          : 'Document approved',
      );
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Approve failed');
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

  const saveFieldMutation = useMutation({
    mutationFn: ({
      fieldId,
      currentValue,
    }: {
      fieldId: string;
      currentValue: string | null;
    }) =>
      apiFetch<ExtractionDto>(
        `/documents/${id}/extraction/fields/${fieldId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ currentValue }),
        },
      ),
    onSuccess: afterExtractionEdit,
  });

  const saveLineMutation = useMutation({
    mutationFn: ({
      lineItemId,
      patch,
    }: {
      lineItemId: string;
      patch: Partial<ExtractionLineItemDto>;
    }) => {
      // Only send keys present on the patch — never null out other columns.
      const body: Record<string, unknown> = {};
      if ('articleNumber' in patch) body.articleNumber = patch.articleNumber;
      if ('description' in patch) body.description = patch.description;
      if ('unit' in patch) body.unit = patch.unit;
      if ('purchaseUnit' in patch) body.purchaseUnit = patch.purchaseUnit;
      if ('stocktakingUnit' in patch) {
        body.stocktakingUnit = patch.stocktakingUnit;
      }
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
      if ('amount' in patch) body.amount = toApiScalar(patch.amount);
      if ('lineType' in patch) body.lineType = patch.lineType;

      return apiFetch<ExtractionDto>(
        `/documents/${id}/extraction/line-items/${lineItemId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(body),
        },
      );
    },
    onSuccess: afterExtractionEdit,
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
    };
  }, [selection, pdfPage]);

  const handleSelect = (next: ReviewSelection) => {
    if (mapColumn) return; // ignore normal selection while mapping a column
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
    const numeric = isNumericLineColumn(mapColumn);
    const band = collectColumnBandValues(pick.pageItems, pick.seed, numeric);
    const assignments = assignColumnValuesToLines(
      extractionQuery.data.lineItems ?? [],
      pick.page,
      band,
      (line) => getLineColumnValue(line, mapColumn),
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
      .filter((a) => a.next != null && a.next !== '')
      .map((a) => ({ lineItemId: a.lineItemId, value: a.next }));
    if (!values.length) return;
    await bulkColumnMutation.mutateAsync({
      column: mapPreview.column,
      values,
    });
  };

  const handlePdfValuePick = async (
    value: string,
    box?: { x: number; y: number; width: number; height: number },
  ) => {
    if (!selection || !canEdit || !value.trim()) return;
    if (selection.type === 'field') {
      await saveFieldMutation.mutateAsync({
        fieldId: selection.id,
        currentValue: value.trim(),
      });
      setSelection({
        ...selection,
        value: value.trim(),
        tone: 'edited',
        page: pdfPage,
        boundingBox: box ?? selection.boundingBox,
      });
      return;
    }
    if (selection.type === 'line') {
      const patch = lineColumnToPatch(selection.column, value.trim());
      await saveLineMutation.mutateAsync({
        lineItemId: selection.id,
        patch,
      });
      setSelection({
        ...selection,
        value: value.trim(),
        tone: 'edited',
        page: pdfPage,
        boundingBox: box ?? selection.boundingBox,
      });
    }
  };

  /** Rossum green check — save value, then next cell in same row (then next row). */
  const handleConfirmValue = async (editedValue?: string) => {
    if (!selection || !canEdit) return;
    const next =
      editedValue !== undefined
        ? editedValue.trim() || null
        : selection.value?.trim() || null;

    const current = selection;

    if (current.type === 'field') {
      await saveFieldMutation.mutateAsync({
        fieldId: current.id,
        currentValue: next,
      });
    } else {
      await saveLineMutation.mutateAsync({
        lineItemId: current.id,
        patch: lineColumnToPatch(current.column, next),
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

  /** Rossum trash — clear selected field / line cell */
  const handleClearValue = async () => {
    if (!selection || !canEdit) return;
    if (selection.type === 'field') {
      await saveFieldMutation.mutateAsync({
        fieldId: selection.id,
        currentValue: null,
      });
      setSelection({ ...selection, value: null, tone: 'ai' });
      return;
    }
    await saveLineMutation.mutateAsync({
      lineItemId: selection.id,
      patch: lineColumnToPatch(selection.column, null),
    });
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
      <AppShell layout="workspace">
        <div className="flex flex-1 items-center justify-center text-slate-400">
          Loading document…
        </div>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell layout="workspace">
        <div className="flex flex-1 items-center justify-center text-rose-300">
          Failed to load document.
        </div>
      </AppShell>
    );
  }

  const actionError =
    processMutation.error ||
    revalidateMutation.error ||
    saveFieldMutation.error ||
    saveLineMutation.error;

  const reviewFooter =
    (canStartReview || canApprove || canReject || canReopen) && (
    <ReviewActions
      stacked
      canStartReview={Boolean(canStartReview)}
      canApprove={Boolean(canApprove)}
      canReject={Boolean(canReject)}
      canReopen={Boolean(canReopen)}
      approveDisabled={
        requiredIncomplete.length > 0 || confirmationBlockers.length > 0
      }
      approveDisabledReason={
        confirmationBlockers.length
          ? `Fix ${confirmationBlockers.length} confirmation blocker(s) first`
          : requiredIncomplete.length
            ? `Required: ${requiredIncomplete.join(', ')}`
            : undefined
      }
      busy={reviewBusy}
      onStartReview={() => startReviewMutation.mutate()}
      onApprove={() => approveMutation.mutate()}
      onReject={(reason) => rejectMutation.mutate(reason)}
      onReopen={() => reopenMutation.mutate()}
      error={
        startReviewMutation.error ||
        approveMutation.error ||
        rejectMutation.error ||
        reopenMutation.error
      }
    />
  );

  return (
    <AppShell layout="workspace">
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-[#121826] px-4 py-2">
        <Link
          href="/documents"
          className="shrink-0 text-sm font-medium text-slate-400 hover:text-white"
        >
          ← Documents
        </Link>
        <div className="h-4 w-px bg-white/10" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-sm font-semibold text-white">
              {data.fileName}
            </h1>
            <StatusBadge status={data.status} variant="dark" />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canRevalidate && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={revalidateMutation.isPending}
              onClick={() => revalidateMutation.mutate()}
              className="text-slate-300 hover:bg-white/5 hover:text-white"
            >
              {revalidateMutation.isPending ? 'Validating…' : 'Re-validate'}
            </Button>
          )}
          {canProcess && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={processMutation.isPending}
              onClick={() => processMutation.mutate()}
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
              saving={saveFieldMutation.isPending}
              footer={reviewFooter}
              onSaveField={async (fieldId, currentValue) => {
                await saveFieldMutation.mutateAsync({ fieldId, currentValue });
              }}
            />
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
                ? `Map column: click the first table cell for “${columnMapLabel(mapColumn)}” (header text above the table is ignored)`
                : null
            }
            onColumnMapSeedPick={handleColumnMapSeedPick}
            onValuePick={(value, box) => {
              void handlePdfValuePick(value, box);
            }}
            onConfirmValue={(value) => {
              void handleConfirmValue(value);
            }}
            onClearValue={() => {
              void handleClearValue();
            }}
            confirming={
              saveFieldMutation.isPending ||
              saveLineMutation.isPending ||
              bulkColumnMutation.isPending
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
                saving={
                  saveLineMutation.isPending ||
                  addLineMutation.isPending ||
                  bulkColumnMutation.isPending
                }
                onSaveLine={async (lineItemId, patch) => {
                  await saveLineMutation.mutateAsync({ lineItemId, patch });
                }}
                onAddLine={async () => {
                  await addLineMutation.mutateAsync();
                }}
                onDeleteLine={async (lineItemId) => {
                  // Optimistic: row disappears immediately; network finishes in background.
                  deleteLineMutation.mutate(lineItemId);
                }}
              />
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
                Values detected on page {mapPreview.page}, top → bottom. Apply
                to fill all matching line items in one step.
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
                      <td className="py-1.5 pr-2">{row.lineLabel}</td>
                      <td className="py-1.5 pr-2 text-slate-500">
                        {row.previous ?? '—'}
                      </td>
                      <td
                        className={`py-1.5 font-medium ${
                          row.next ? 'text-emerald-300' : 'text-slate-600'
                        }`}
                      >
                        {row.next ?? '—'}
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
                  !mapPreview.assignments.some((a) => a.next)
                }
                onClick={() => void handleApplyColumnMap()}
                className="rounded-md bg-[#3b82f6] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#2563eb] disabled:opacity-50"
              >
                {bulkColumnMutation.isPending
                  ? 'Applying…'
                  : `Apply to ${
                      mapPreview.assignments.filter((a) => a.next).length
                    } rows`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
