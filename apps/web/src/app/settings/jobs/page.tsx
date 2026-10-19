'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, ListRestart, Loader2, RefreshCw } from 'lucide-react';
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
import type {
  QueueJobAttemptDto,
  QueueJobDto,
  QueueName,
  QueueStatusDto,
} from '@/lib/types';
import { cn } from '@/lib/utils';

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

function attemptBadge(status: QueueJobAttemptDto['status']) {
  if (status === 'succeeded') {
    return <Badge variant="secondary">succeeded</Badge>;
  }
  if (status === 'failed') {
    return <Badge variant="destructive">failed</Badge>;
  }
  if (status === 'running') {
    return <Badge>running</Badge>;
  }
  return <Badge variant="outline">pending</Badge>;
}

function formatTs(ms: number | null) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}

function JobAttemptsCell({ job }: { job: QueueJobDto }) {
  const [open, setOpen] = useState(false);
  const attempts = job.attempts ?? [];
  const summary =
    job.attemptsSummary ||
    `${job.attemptsMade || 0} of ${job.attemptsMax || 1} attempts`;

  if (attempts.length === 0) {
    return <span className="text-xs text-muted-foreground">{summary}</span>;
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        className="flex items-center gap-1 text-left text-xs text-foreground hover:underline"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span>{summary}</span>
      </button>
      {open ? (
        <ol className="space-y-1.5 border-l border-border pl-3">
          {attempts.map((a) => (
            <li key={a.attempt} className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium text-foreground">
                  Attempt {a.attempt}
                  {job.attemptsMax ? ` / ${job.attemptsMax}` : ''}
                </span>
                {attemptBadge(a.status)}
              </div>
              {a.error ? (
                <p
                  className={cn(
                    'max-w-[320px] truncate text-[11px] text-muted-foreground',
                    a.status === 'failed' && 'text-destructive/90',
                  )}
                  title={a.error}
                >
                  {a.error}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

export default function BackgroundJobsPage() {
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
          title="Background Jobs"
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
          title="Background Jobs"
          description="BullMQ jobs for AI extraction and document export. Expand Attempts to see each retry (e.g. 2 failed, then succeeded)."
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
                title="Inline mode — jobs UI unavailable"
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
                    <TableHead>Job queue</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Attempts</TableHead>
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
                      <TableCell>
                        <JobAttemptsCell job={job} />
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
