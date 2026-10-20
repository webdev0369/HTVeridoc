'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  ExtractionDto,
  ExtractionFieldDto,
  FieldConfigItemDto,
  ValidationDto,
  ValidationErrorDto,
} from '@/lib/types';
import {
  dateFieldAnchorHints,
  type ReviewSelection,
} from '@/lib/review-types';
import type { HighlightTone } from '@/components/pdf-viewer';
import {
  ProcessingLog,
  type ProcessingEventDto,
} from '@/components/processing-log';

export type { ReviewSelection } from '@/lib/review-types';

function toneFor(isUserEdited: boolean, hasError: boolean): HighlightTone {
  if (hasError) return 'error';
  if (isUserEdited) return 'edited';
  return 'ai';
}

function confidenceTick(_confidence: number | null, isUserEdited: boolean) {
  // Only user-confirmed fields get a green ✓. AI confidence must not look validated.
  if (isUserEdited) {
    return (
      <span
        title="Validated by user"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white"
      >
        ✓
      </span>
    );
  }
  return (
    <span
      title="Not confirmed yet"
      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-500"
    />
  );
}

interface ReviewEditorProps {
  extraction: ExtractionDto;
  validation?: ValidationDto | null;
  fieldConfig?: FieldConfigItemDto[] | null;
  events?: ProcessingEventDto[];
  editable: boolean;
  selection: ReviewSelection;
  onSelect: (selection: ReviewSelection) => void;
  onSaveField: (
    fieldId: string,
    currentValue: string | null,
  ) => void | Promise<void>;
  saving?: boolean;
  footer?: React.ReactNode;
}

export function ReviewEditor({
  extraction,
  validation,
  fieldConfig,
  events = [],
  editable,
  selection,
  onSelect,
  onSaveField,
  saving,
  footer,
}: ReviewEditorProps) {
  const fields = extraction.fields ?? [];
  const [showLog, setShowLog] = useState(false);
  const lineCount = extraction.lineItems?.length ?? 0;

  const fieldMap = useMemo(
    () => new Map(fields.map((f) => [f.fieldKey, f])),
    [fields],
  );

  const visibleConfig = useMemo(() => {
    const configs = (fieldConfig ?? []).filter((f) => f.mode !== 'IGNORED');
    if (configs.length) {
      return [...configs].sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return fields.map((f, index) => ({
      fieldKey: f.fieldKey,
      label: f.fieldLabel,
      group: 'Fields',
      sortOrder: index,
      mode: 'OPTIONAL' as const,
      defaultMode: 'OPTIONAL' as const,
    }));
  }, [fieldConfig, fields]);

  const visibleKeys = useMemo(
    () => new Set(visibleConfig.map((c) => c.fieldKey)),
    [visibleConfig],
  );

  const issueByField = useMemo(() => {
    const map = new Map<string, ValidationErrorDto>();
    for (const err of validation?.errors ?? []) {
      if (
        err.fieldKey &&
        !map.has(err.fieldKey) &&
        visibleKeys.has(err.fieldKey)
      ) {
        map.set(err.fieldKey, err);
      }
    }
    return map;
  }, [validation, visibleKeys]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, FieldConfigItemDto[]>();
    for (const cfg of visibleConfig) {
      if (!byGroup.has(cfg.group)) {
        byGroup.set(cfg.group, []);
        order.push(cfg.group);
      }
      byGroup.get(cfg.group)!.push(cfg);
    }
    return order.map((title) => ({
      title,
      configs: byGroup.get(title)!,
    }));
  }, [visibleConfig]);

  const blockers = (validation?.errors ?? []).filter(
    (e) =>
      e.severity === 'error' &&
      (!e.fieldKey ||
        visibleKeys.has(e.fieldKey) ||
        e.code === 'REQUIRED_LINE_ITEMS'),
  );

  const selectField = (field: ExtractionFieldDto) => {
    onSelect({
      type: 'field',
      id: field.id,
      fieldKey: field.fieldKey,
      label: field.fieldLabel,
      value: field.currentValue,
      page: field.source?.page ?? null,
      boundingBox: field.source?.boundingBox,
      anchorHints: dateFieldAnchorHints(field.fieldKey),
      tone: toneFor(field.isUserEdited, issueByField.has(field.fieldKey)),
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#121826]">
      {blockers.length > 0 && (
        <div className="shrink-0 border-b border-rose-500/30 bg-rose-950/50 px-4 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-300">
            {blockers.length} confirmation blocker
            {blockers.length === 1 ? '' : 's'}
          </p>
          <p className="mt-0.5 text-sm text-rose-100">{blockers[0].message}</p>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.map((group) => {
          const groupFields = group.configs
            .map((cfg) => {
              const field = fieldMap.get(cfg.fieldKey);
              if (!field) return null;
              return { field, required: cfg.mode === 'REQUIRED' };
            })
            .filter(Boolean) as Array<{
            field: ExtractionFieldDto;
            required: boolean;
          }>;
          if (!groupFields.length) return null;
          return (
            <section key={group.title}>
              <h3 className="sticky top-0 z-10 bg-[#1a2230] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">
                {group.title}
              </h3>
              <div className="divide-y divide-white/5">
                {groupFields.map(({ field, required }) => (
                  <FieldRow
                    key={field.id}
                    field={field}
                    required={required}
                    editable={editable}
                    selected={
                      selection?.type === 'field' && selection.id === field.id
                    }
                    issue={issueByField.get(field.fieldKey)}
                    disabled={saving}
                    onSelect={() => selectField(field)}
                    onSave={async (value) => {
                      await onSaveField(field.id, value);
                    }}
                  />
                ))}
              </div>
            </section>
          );
        })}

        <section>
          <h3 className="sticky top-0 z-10 flex items-center justify-between bg-[#1a2230] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">
            <span>Line items</span>
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300">
              {lineCount}
            </span>
          </h3>
          <p className="px-4 py-3 text-xs text-slate-500">
            Edit line items in the table below the document.
          </p>
        </section>
      </div>

      <div className="shrink-0 border-t border-white/10 bg-[#0f1419] p-3">
        <button
          type="button"
          onClick={() => setShowLog((v) => !v)}
          className="mb-2 text-[11px] text-slate-500 hover:text-slate-300"
        >
          {showLog ? 'Hide activity' : 'Show activity'}
        </button>
        {showLog && (
          <div className="mb-3 max-h-28 overflow-auto rounded-md border border-white/10 bg-[#121826] p-1">
            <ProcessingLog events={events} compact />
          </div>
        )}
        {footer}
      </div>
    </div>
  );
}

export function ProcessingSidebar({
  events,
  status,
  errorMessage,
  onRetry,
  retrying,
}: {
  events: ProcessingEventDto[];
  status: string;
  errorMessage?: string | null;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const steps = [
    'ENQUEUE',
    'STARTED',
    'PDF_LOADED',
    'GEMINI_PREPARE',
    'GEMINI_RESPONSE',
    'SCHEMA_VALID',
    'NORMALIZED',
    'VALIDATION_DONE',
    'COMPLETED',
  ];
  const done = new Set(events.map((e) => e.step));
  const failed = events.some((e) => e.level === 'error');
  const latest = events[events.length - 1];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#121826] text-slate-200">
      <div className="border-b border-white/10 px-5 py-5">
        <div className="flex items-center gap-3">
          {!failed && status === 'PROCESSING' && (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#3b82f6] border-t-transparent" />
          )}
          <div>
            <p className="text-lg font-semibold text-white">
              {failed
                ? 'Extraction failed'
                : status === 'VALIDATING'
                  ? 'Validating…'
                  : 'Extracting with Gemini'}
            </p>
            <p className="mt-0.5 text-sm text-slate-400">
              {latest?.message ?? 'Preparing document…'}
            </p>
          </div>
        </div>
        {errorMessage && (
          <p className="mt-3 rounded-lg bg-rose-950/60 px-3 py-2 text-sm text-rose-200 ring-1 ring-rose-500/30">
            {errorMessage}
          </p>
        )}
        {onRetry &&
          (status === 'EXTRACTION_FAILED' ||
            status === 'PROCESSING_FAILED' ||
            status === 'UPLOADED') && (
            <button
              type="button"
              disabled={retrying}
              onClick={onRetry}
              className="mt-4 w-full rounded-lg bg-[#3b82f6] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#2563eb] disabled:opacity-60"
            >
              {retrying
                ? 'Starting…'
                : status === 'UPLOADED'
                  ? 'Extract with Gemini'
                  : 'Retry extraction'}
            </button>
          )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <ol className="space-y-3">
          {steps.map((step) => {
            const event = [...events].reverse().find((e) => e.step === step);
            const isDone = done.has(step);
            const isError = event?.level === 'error';
            const isCurrent = latest?.step === step && !failed;
            return (
              <li key={step} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    isError
                      ? 'bg-rose-500 text-white'
                      : isDone
                        ? 'bg-[#3b82f6] text-white'
                        : isCurrent
                          ? 'border-2 border-[#3b82f6] bg-transparent'
                          : 'border border-white/15 bg-transparent text-slate-600'
                  }`}
                >
                  {isError ? '!' : isDone ? '✓' : ''}
                </span>
                <div>
                  <p
                    className={`text-sm font-medium ${
                      isDone || isCurrent ? 'text-slate-100' : 'text-slate-500'
                    }`}
                  >
                    {step.replaceAll('_', ' ')}
                  </p>
                  {event && (
                    <p className="text-xs text-slate-500">{event.message}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function FieldRow({
  field,
  required,
  editable,
  selected,
  issue,
  disabled,
  onSelect,
  onSave,
}: {
  field: ExtractionFieldDto;
  required?: boolean;
  editable: boolean;
  selected: boolean;
  issue?: ValidationErrorDto;
  disabled?: boolean;
  onSelect: () => void;
  onSave: (value: string | null) => Promise<void>;
}) {
  const [value, setValue] = useState(field.currentValue ?? '');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setValue(field.currentValue ?? '');
    setDirty(false);
  }, [field.currentValue, field.id]);

  const commit = async () => {
    if (!editable || !dirty) return;
    const next = value.trim() === '' ? null : value;
    if (next === (field.currentValue ?? null)) {
      setDirty(false);
      return;
    }
    await onSave(next);
    setDirty(false);
  };

  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer px-4 py-3 transition ${
        selected
          ? 'bg-[#1a4d8c]/50 ring-1 ring-inset ring-[#3b82f6]'
          : issue
            ? 'bg-rose-950/30 hover:bg-rose-950/45'
            : 'hover:bg-white/[0.03]'
      }`}
    >
      <div className="mb-1 flex items-center gap-2">
        {confidenceTick(field.confidence, field.isUserEdited)}
        <span className="text-[12px] font-medium text-slate-300">
          {field.fieldLabel}
          {required && (
            <span className="ml-1 text-rose-400" title="Required">
              *
            </span>
          )}
        </span>
        {field.source?.page != null && (
          <span className="ml-auto text-[10px] text-slate-500">
            p.{field.source.page}
          </span>
        )}
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        {editable ? (
          <input
            value={value}
            disabled={disabled}
            onFocus={onSelect}
            onChange={(e) => {
              setValue(e.target.value);
              setDirty(true);
            }}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            className="w-full border-0 bg-transparent px-0 py-0.5 text-[15px] font-medium text-white outline-none placeholder:text-slate-600"
            placeholder="—"
          />
        ) : (
          <p className="text-[15px] font-medium text-white">
            {field.currentValue ?? (
              <span className="font-normal text-slate-600">—</span>
            )}
          </p>
        )}
      </div>
      {field.isUserEdited &&
        (field.originalValue ?? '') !== (field.currentValue ?? '') && (
          <p className="mt-1 text-[11px] text-slate-500">
            <span className="font-medium text-slate-400">Original </span>
            <span className="line-through decoration-slate-600">
              {field.originalValue?.trim() ? field.originalValue : '—'}
            </span>
          </p>
        )}
      {issue && (
        <p className="mt-1 text-xs text-rose-300">{issue.message}</p>
      )}
    </div>
  );
}
