import { Skeleton } from '@/components/ui/skeleton';

/** Footer actions: Show activity + Confirm / Reject while auth or review data loads. */
export function ReviewFooterActionsSkeleton({ stacked = true }: { stacked?: boolean }) {
  if (stacked) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading review actions">
        <Skeleton className="mb-2 h-3 w-24 bg-white/10" />
        <div className="flex gap-2">
          <Skeleton className="h-11 flex-1 bg-white/10" />
          <Skeleton className="h-11 flex-[1.4] bg-[#3b82f6]/30" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2" aria-busy="true">
      <Skeleton className="h-9 w-20 bg-white/10" />
      <Skeleton className="h-9 w-24 bg-[#3b82f6]/30" />
    </div>
  );
}

/** Map column / Add row / total chip while line items are loading. */
export function LineItemsToolbarSkeleton() {
  return (
    <div
      className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4 py-2"
      aria-busy="true"
      aria-label="Loading line item actions"
    >
      <div className="flex items-center gap-2">
        <Skeleton className="h-3 w-20 bg-white/10" />
        <Skeleton className="h-5 w-8 rounded bg-white/10" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-[88px] rounded-md bg-white/10" />
        <Skeleton className="h-7 w-[76px] rounded-md bg-[#3b82f6]/30" />
        <Skeleton className="h-7 w-36 rounded-full bg-white/10" />
      </div>
    </div>
  );
}

/** Table body placeholder including delete-column affordance. */
export function LineItemsTableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#0f1419]">
      <LineItemsToolbarSkeleton />
      <div className="min-h-0 flex-1 space-y-0 overflow-hidden p-0">
        <div className="flex border-b border-white/10 px-3 py-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={i}
              className="mr-3 h-3 bg-white/10"
              style={{ width: i === 1 ? 140 : 72 }}
            />
          ))}
          <Skeleton className="ml-auto h-3 w-6 bg-white/10" />
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="flex items-center border-b border-white/5 px-3 py-2.5"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton
                key={i}
                className="mr-3 h-4 bg-white/10"
                style={{ width: i === 1 ? 160 : 64 }}
              />
            ))}
            <Skeleton className="ml-auto h-7 w-7 rounded-md bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Left review sidebar while extraction / auth loads. */
export function ReviewSidebarSkeleton() {
  return (
    <div
      className="flex h-full flex-col bg-[#1a2230]"
      aria-busy="true"
      aria-label="Loading review fields"
    >
      <div className="space-y-3 border-b border-white/10 p-4">
        <Skeleton className="h-3 w-28 bg-white/10" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-2.5 w-20 bg-white/10" />
            <Skeleton className="h-8 w-full bg-white/10" />
          </div>
        ))}
      </div>
      <div className="mt-auto border-t border-white/10 bg-[#0f1419] p-3">
        <ReviewFooterActionsSkeleton stacked />
      </div>
    </div>
  );
}

/** Full document page shell while GET /documents/:id is in flight. */
export function DocumentPageSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true" aria-label="Loading document">
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-[#121826] px-4 py-2">
        <Skeleton className="h-4 w-16 bg-white/10" />
        <Skeleton className="h-4 w-48 bg-white/10" />
        <Skeleton className="h-5 w-20 rounded-full bg-violet-500/20" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-8 w-28 bg-white/10" />
          <Skeleton className="h-8 w-24 bg-white/10" />
        </div>
      </div>
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-hidden border-b border-white/10 lg:border-b-0 lg:border-r lg:border-white/10">
          <ReviewSidebarSkeleton />
        </aside>
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="min-h-0 flex-1 bg-[#0b0f14] p-4">
            <Skeleton className="h-full w-full rounded-lg bg-white/5" />
          </div>
          <div className="h-[220px] shrink-0 border-t border-white/10">
            <LineItemsTableSkeleton rows={3} />
          </div>
        </div>
      </div>
    </div>
  );
}
