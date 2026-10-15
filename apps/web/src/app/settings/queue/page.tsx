'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListRestart, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { QueueJobDto, QueueName, QueueStatusDto } from '@/lib/types';

function stateBadge(state: string) {
  const tone =
    state === 'failed'
      ? 'destructive'
      : state === 'completed'
        ? 'secondary'
        : state === 'active'
          ? 'default'
          : 'outline';
  return (
    <Badge variant={tone as 'default' | 'secondary' | 'destructive' | 'outline'}>
      {state}
    </Badge>
  );
}

function formatTs(ms: number | null) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}

export default function QueueManagerPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canRead = Boolean(
    user?.permissions?.includes('queue.read') ||
      user?.permissions?.includes('queue.manage'),
  );
  const canManage = Boolean(user?.permissions?.includes('queue.manage'));

  const jobsQuery = useQuery({
    queryKey: ['queue', 'jobs'],
    queryFn: () => apiFetch<QueueStatusDto>('/queue/jobs?limit=50'),
    enabled: canRead,
    refetchInterval: 8_000,
  });

  const retryMutation = useMutation({
    mutationFn: ({ queue, jobId }: { queue: QueueName; jobId: string }) =>
      apiFetch<{ ok: boolean; jobId: string; state: string }>(
        `/queue/jobs/${queue}/${encodeURIComponent(jobId)}/retry`,
        { method: 'POST' },
      ),
    onSuccess: () => {
      toast.success('Job retry queued');
      void queryClient.invalidateQueries({ queryKey: ['queue', 'jobs'] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Retry failed');
    },
  });

  if (!canRead) {
    return (
      <AppShell>
        <EmptyState
          title="Queue Manager"
          description="You need queue.read permission to view background jobs."
        />
      </AppShell>
    );
  }

  const data = jobsQuery.data;
  const jobs: QueueJobDto[] = data?.jobs ?? [];

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Queue Manager"
          description="Recent BullMQ jobs for AI extraction and document export."
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void queryClient.invalidateQueries({ queryKey: ['queue', 'jobs'] })
              }
              disabled={jobsQuery.isFetching}
            >
              {jobsQuery.isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden />
              )}
              Refresh
            </Button>
          }
        />

        {jobsQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : data && !data.enabled ? (
          <Card>
            <CardContent className="py-10">
              <EmptyState
                title="Inline mode — queue UI unavailable"
                description={
                  data.reason ??
                  'BullMQ is disabled because Redis is unavailable or incompatible. Extraction still runs inline on the API process.'
                }
              />
            </CardContent>
          </Card>
        ) : jobs.length === 0 ? (
          <EmptyState
            title="No recent jobs"
            description="Process a document to enqueue an ai-extraction job. Failed jobs can be retried here."
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Queue</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead className="hidden lg:table-cell">Failed reason</TableHead>
                    <TableHead className="hidden md:table-cell">Created</TableHead>
                    <TableHead className="w-[100px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={`${job.queue}-${job.id}`}>
                      <TableCell className="font-mono text-xs">
                        <div className="font-semibold text-foreground">{job.name}</div>
                        <div className="text-muted-foreground">{job.id}</div>
                      </TableCell>
                      <TableCell className="text-xs">{job.queue}</TableCell>
                      <TableCell>
                        {job.documentId ? (
                          <Link
                            href={`/documents/${job.documentId}`}
                            className="font-mono text-xs text-primary hover:underline"
                          >
                            {job.documentId.slice(0, 8)}…
                          </Link>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>{stateBadge(job.state)}</TableCell>
                      <TableCell className="hidden max-w-[240px] truncate text-xs text-muted-foreground lg:table-cell">
                        {job.failedReason ?? '—'}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                        {formatTs(job.timestamp)}
                      </TableCell>
                      <TableCell>
                        {canManage && job.state === 'failed' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={retryMutation.isPending}
                            onClick={() =>
                              retryMutation.mutate({
                                queue: job.queue,
                                jobId: job.id,
                              })
                            }
                          >
                            <ListRestart className="h-4 w-4" aria-hidden />
                            Retry
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
