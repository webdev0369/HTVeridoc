'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api';

interface ReviewActionsProps {
  canStartReview: boolean;
  canApprove: boolean;
  canReject: boolean;
  canReopen?: boolean;
  busy?: boolean;
  approveDisabled?: boolean;
  approveDisabledReason?: string;
  onStartReview: () => void;
  onApprove: () => void;
  onReject: (reason?: string) => void;
  onReopen?: () => void;
  error?: unknown;
  /** Rossum-style: primary Confirm fills the sidebar footer */
  stacked?: boolean;
}

export function ReviewActions({
  canStartReview,
  canApprove,
  canReject,
  canReopen = false,
  busy,
  approveDisabled,
  approveDisabledReason,
  onStartReview,
  onApprove,
  onReject,
  onReopen,
  error,
  stacked = false,
}: ReviewActionsProps) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');

  if (!canStartReview && !canApprove && !canReject && !canReopen) return null;

  if (stacked) {
    return (
      <div className="space-y-2">
        {canReopen && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onReopen?.()}
            className="h-10 w-full rounded-lg border border-amber-400/40 bg-amber-500/15 text-sm font-semibold text-amber-100 hover:bg-amber-500/25 disabled:opacity-50"
          >
            Reopen for review
          </button>
        )}
        {canStartReview && (
          <button
            type="button"
            disabled={busy}
            onClick={onStartReview}
            className="h-10 w-full rounded-lg border border-white/15 bg-white/5 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50"
          >
            Start review
          </button>
        )}
        <div className="flex gap-2">
          {canReject && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejectOpen((v) => !v)}
              className="h-11 flex-1 rounded-lg border border-white/15 bg-transparent text-sm font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-50"
            >
              Reject
            </button>
          )}
          {canApprove && (
            <button
              type="button"
              disabled={busy || approveDisabled}
              title={approveDisabledReason}
              onClick={onApprove}
              className="h-11 flex-[1.4] rounded-lg bg-[#3b82f6] text-sm font-semibold text-white hover:bg-[#2563eb] disabled:opacity-50"
            >
              Confirm
            </button>
          )}
        </div>

        {approveDisabled && approveDisabledReason && canApprove && (
          <p className="text-[11px] text-amber-300/90">{approveDisabledReason}</p>
        )}

        {rejectOpen && (
          <div className="rounded-lg border border-white/10 bg-[#121826] p-3">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-white/10 bg-[#0f1419] px-2 py-1.5 text-sm text-white outline-none focus:border-[#3b82f6]"
              placeholder="Optional reason…"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectOpen(false)}
                className="rounded-md px-2.5 py-1.5 text-sm text-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  onReject(reason.trim() || undefined);
                  setRejectOpen(false);
                  setReason('');
                }}
                className="rounded-md bg-rose-600 px-2.5 py-1.5 text-sm font-semibold text-white"
              >
                Reject
              </button>
            </div>
          </div>
        )}

        {error != null && (
          <p className="text-xs text-rose-300">
            {error instanceof ApiError
              ? error.message
              : error instanceof Error
                ? error.message
                : 'Action failed'}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex items-center gap-2">
      {canReopen && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onReopen?.()}
          className="h-9 rounded-md border border-amber-400/40 bg-amber-500/15 px-3 text-sm font-semibold text-amber-100 hover:bg-amber-500/25 disabled:opacity-50"
        >
          Reopen for review
        </button>
      )}
      {canStartReview && (
        <button
          type="button"
          disabled={busy}
          onClick={onStartReview}
          className="h-9 rounded-md border border-white/15 px-3 text-sm font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50"
        >
          Start review
        </button>
      )}
      {canReject && (
        <button
          type="button"
          disabled={busy}
          onClick={() => setRejectOpen((v) => !v)}
          className="h-9 rounded-md border border-white/15 px-3 text-sm font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50"
        >
          Reject
        </button>
      )}
      {canApprove && (
        <button
          type="button"
          disabled={busy || approveDisabled}
          title={approveDisabledReason}
          onClick={onApprove}
          className="h-9 rounded-md bg-[#3b82f6] px-4 text-sm font-semibold text-white hover:bg-[#2563eb] disabled:opacity-50"
        >
          Confirm
        </button>
      )}
      {error != null && (
        <span className="text-xs text-rose-300">
          {error instanceof ApiError ? error.message : 'Action failed'}
        </span>
      )}
    </div>
  );
}
