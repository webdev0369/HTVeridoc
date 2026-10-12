'use client';

export interface ProcessingEventDto {
  id: string;
  documentId: string;
  organizationId: string;
  step: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

function levelDot(level: ProcessingEventDto['level']) {
  switch (level) {
    case 'error':
      return 'bg-rose-500';
    case 'warn':
      return 'bg-amber-500';
    case 'success':
      return 'bg-emerald-500';
    default:
      return 'bg-slate-400';
  }
}

export function ProcessingLog({
  events,
  compact = false,
}: {
  events: ProcessingEventDto[];
  compact?: boolean;
}) {
  if (!events.length) {
    return (
      <p className="px-3 py-4 text-center text-sm text-slate-500">
        No processing logs yet.
      </p>
    );
  }

  return (
    <div className={compact ? 'space-y-0.5' : 'max-h-72 space-y-0.5 overflow-auto p-1'}>
      {events.map((event) => (
        <div
          key={event.id}
          className="flex gap-3 rounded-md px-2.5 py-1.5 hover:bg-white/5"
        >
          <span
            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${levelDot(event.level)}`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-xs font-semibold tracking-wide text-slate-300">
                {event.step}
              </span>
              <span className="text-[11px] text-slate-500">
                {new Date(event.createdAt).toLocaleTimeString()}
              </span>
            </div>
            <p className="mt-0.5 text-xs leading-snug text-slate-400">
              {event.message}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
