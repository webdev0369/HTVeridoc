'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Loader2,
} from 'lucide-react';
import type { DocumentExportMatchPreviewDto } from '@/lib/types';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'htveridoc.exportMatchExpanded';

export function ExportMatchPanel({
  preview,
  loading,
  compact = false,
}: {
  preview: DocumentExportMatchPreviewDto | undefined;
  loading?: boolean;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === '1') setExpanded(true);
      if (saved === '0') setExpanded(false);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = () => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  if (loading && !preview) {
    return (
      <div className="mx-3 mb-2 flex items-center gap-2 rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking export match…
      </div>
    );
  }

  if (!preview) return null;

  if (!preview.configured || !preview.match) {
    return (
      <div className="mx-3 mb-2 rounded-lg border border-amber-500/30 bg-amber-950/30 px-2.5 py-2 text-[11px] text-amber-100">
        <button
          type="button"
          onClick={toggle}
          className="flex w-full items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" />
          )}
          <CircleAlert className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate font-medium">
            Export destination not ready
          </span>
          <span className="shrink-0 text-[10px] opacity-70">
            {expanded ? 'Hide' : 'Details'}
          </span>
        </button>
        {expanded ? (
          <div className="mt-2 space-y-1 border-t border-amber-500/20 pt-2 pl-6">
            <p className="text-amber-100/80">
              {preview.message ||
                'Configure Sandbox or Live under Settings before approving.'}
            </p>
            <Link
              href="/settings/integrations/export"
              className="inline-block font-medium underline underline-offset-2 hover:text-white"
            >
              Open Export destination
            </Link>
          </div>
        ) : null}
      </div>
    );
  }

  const { match, connectionMode, message } = preview;
  const unmatched = match.products.filter((p) => !p.matched);
  const summary = match.readyForExport
    ? `Ready · ${match.products.length} product(s)`
    : unmatched.length
      ? `${unmatched.length} unmatched line(s)`
      : 'Needs attention';

  return (
    <div
      className={cn(
        'mx-3 mb-2 rounded-lg border text-[11px]',
        match.readyForExport
          ? 'border-emerald-500/25 bg-emerald-950/25 text-emerald-100'
          : 'border-amber-500/30 bg-amber-950/30 text-amber-100',
      )}
    >
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-white/5"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" />
        )}
        {match.readyForExport ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <CircleAlert className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">
          Export match
          {connectionMode === 'mock' ? ' · Sandbox' : ' · Live'}
          <span className="font-normal opacity-75"> — {summary}</span>
        </span>
        <span className="shrink-0 text-[10px] opacity-70">
          {expanded ? 'Hide' : 'Details'}
        </span>
      </button>

      {expanded ? (
        <div className="space-y-2 border-t border-white/10 px-2.5 py-2">
          {message ? <p className="opacity-80">{message}</p> : null}

          <div className="max-h-36 space-y-1.5 overflow-y-auto pr-0.5">
            <Row
              ok={match.supplier.matched}
              label="Supplier"
              detail={
                match.supplier.displayName ||
                match.supplier.externalKey ||
                'Missing supplier name'
              }
            />
            {!compact
              ? match.products.slice(0, 8).map((p) => (
                  <Row
                    key={p.lineItemId}
                    ok={p.matched}
                    label={p.articleNumber || 'No article'}
                    detail={p.description || p.matchMethod || '—'}
                  />
                ))
              : null}
            {match.products.length > 8 && !compact ? (
              <p className="opacity-70">
                +{match.products.length - 8} more product line(s)
              </p>
            ) : null}
            {compact && unmatched.length > 0 ? (
              <p className="opacity-80">
                {unmatched.length} unmatched product line(s)
              </p>
            ) : null}
            {match.products.length === 0 ? (
              <p className="opacity-70">No PRODUCT lines to match</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex gap-2 border-t border-white/5 pt-1.5 first:border-0 first:pt-0">
      <span
        className={cn(
          'mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full',
          ok ? 'bg-emerald-400' : 'bg-amber-400',
        )}
      />
      <div className="min-w-0">
        <p className="truncate font-medium">{label}</p>
        <p className="truncate opacity-70">{detail}</p>
      </div>
    </div>
  );
}
