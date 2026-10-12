'use client';

import type { ValidationDto, ValidationErrorDto } from '@/lib/types';

const statusStyles: Record<string, string> = {
  passed: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  passed_with_warnings: 'border-amber-200 bg-amber-50 text-amber-950',
  failed: 'border-rose-200 bg-rose-50 text-rose-950',
  pending: 'border-mist bg-slate-50 text-slate-700',
};

interface ValidationPanelProps {
  validation: ValidationDto;
  compact?: boolean;
  onIssueClick?: (issue: ValidationErrorDto) => void;
}

export function ValidationPanel({
  validation,
  compact = false,
  onIssueClick,
}: ValidationPanelProps) {
  const errors = validation.errors ?? [];
  const hardErrors = errors.filter((e) => e.severity === 'error');
  const warnings = errors.filter((e) => e.severity === 'warning');

  return (
    <div className="space-y-3">
      <div
        className={`rounded-xl border px-4 py-3 ${
          statusStyles[validation.status] ?? statusStyles.pending
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider opacity-70">
              Validation
            </p>
            <p className="font-display text-lg font-semibold capitalize">
              {validation.status.replaceAll('_', ' ')}
            </p>
          </div>
          <div className="flex gap-2 text-xs font-semibold">
            <span className="rounded-full bg-white/70 px-2.5 py-1 text-rose-700">
              {validation.errorCount} errors
            </span>
            <span className="rounded-full bg-white/70 px-2.5 py-1 text-amber-800">
              {validation.warningCount} warnings
            </span>
          </div>
        </div>
        {!compact && (
          <p className="mt-1 text-xs opacity-70">
            Click an issue to jump to its source on the PDF
          </p>
        )}
      </div>

      {!compact && hardErrors.length > 0 && (
        <IssueList
          title="Errors"
          items={hardErrors}
          tone="error"
          onIssueClick={onIssueClick}
        />
      )}
      {!compact && warnings.length > 0 && (
        <IssueList
          title="Warnings"
          items={warnings}
          tone="warning"
          onIssueClick={onIssueClick}
        />
      )}
      {!compact && errors.length === 0 && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          All checks passed.
        </p>
      )}
    </div>
  );
}

function IssueList({
  title,
  items,
  tone,
  onIssueClick,
}: {
  title: string;
  items: ValidationErrorDto[];
  tone: 'error' | 'warning';
  onIssueClick?: (issue: ValidationErrorDto) => void;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </h3>
      <ul className="overflow-hidden rounded-xl border border-mist bg-white divide-y divide-mist/80">
        {items.map((issue) => (
          <li key={issue.id}>
            <button
              type="button"
              onClick={() => onIssueClick?.(issue)}
              className="flex w-full items-start gap-3 px-3.5 py-3 text-left transition hover:bg-slate-50"
            >
              <span
                className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                  tone === 'error' ? 'bg-rose-500' : 'bg-amber-500'
                }`}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium ${
                    tone === 'error' ? 'text-rose-900' : 'text-amber-950'
                  }`}
                >
                  {issue.message}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {issue.code}
                  {issue.fieldKey ? ` · ${issue.fieldKey}` : ''}
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
