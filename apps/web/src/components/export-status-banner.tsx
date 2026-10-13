'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DocumentExportStatusDto } from '@/lib/types';
import { cn } from '@/lib/utils';

export function ExportStatusBanner({
  status,
  onRetry,
  retrying,
  canRetry,
}: {
  status: DocumentExportStatusDto | undefined;
  onRetry?: () => void;
  retrying?: boolean;
  canRetry?: boolean;
}) {
  if (!status) return null;

  const failed =
    status.documentStatus === 'EXPORT_FAILED' ||
    status.exportStatus === 'failed';
  const exporting =
    status.documentStatus === 'EXPORTING' ||
    status.exportStatus === 'exporting';
  const exported =
    status.documentStatus === 'EXPORTED' ||
    status.exportStatus === 'exported';

  if (!failed && !exporting && !exported) return null;

  if (exporting) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-b border-teal-500/30 bg-teal-950/40 px-4 py-2 text-sm text-teal-100">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        <span>
          Exporting to your organization&apos;s destination
          {status.connectionMode === 'mock' ? ' (Sandbox)' : ''}…
        </span>
      </div>
    );
  }

  if (exported) {
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-emerald-500/30 bg-emerald-950/40 px-4 py-2 text-sm text-emerald-100">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>
          Exported successfully
          {status.destinationPoId
            ? ` · destination ID ${status.destinationPoId}`
            : ''}
          {status.connectionMode === 'mock' ? ' · Sandbox' : ''}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex shrink-0 flex-col gap-2 border-b border-rose-500/30 bg-rose-950/50 px-4 py-3 text-sm text-rose-100 sm:flex-row sm:items-start sm:justify-between',
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2 font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Export failed
        </div>
        <p className="text-rose-200/90">
          {status.lastError ||
            (!status.connectionActive
              ? 'Export destination is not configured or not active for this organization.'
              : 'Export did not complete. Review the details and try again.')}
        </p>
        {!status.connectionActive ? (
          <Link
            href="/settings/integrations/export"
            className="inline-block text-xs font-medium text-rose-100 underline underline-offset-2 hover:text-white"
          >
            Open Export destination settings
          </Link>
        ) : null}
      </div>
      {canRetry && onRetry ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={retrying}
          onClick={onRetry}
          className="shrink-0 border-rose-400/40 bg-transparent text-rose-50 hover:bg-rose-900/60 hover:text-white"
        >
          {retrying ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Retry export
        </Button>
      ) : null}
    </div>
  );
}
