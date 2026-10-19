'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Inbox, Settings2 } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { DocumentQueueDto } from '@/lib/types';

export default function QueuesInboxPage() {
  const { user } = useAuth();
  const canRead = Boolean(
    user?.permissions?.includes('queue.read') ||
      user?.permissions?.includes('queue.manage'),
  );
  const canManage = Boolean(user?.permissions?.includes('queue.manage'));

  const queuesQuery = useQuery({
    queryKey: ['document-queues'],
    queryFn: () => apiFetch<DocumentQueueDto[]>('/document-queues'),
    enabled: canRead,
  });

  if (!canRead) {
    return (
      <AppShell>
        <EmptyState
          title="Queues"
          description="You need permission to view document queues."
        />
      </AppShell>
    );
  }

  const queues = (queuesQuery.data ?? []).filter((q) => q.isActive);

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Queues"
          description="Work inboxes by document type — upload and review inside a queue."
          actions={
            canManage ? (
              <Button variant="outline" size="sm" asChild>
                <Link href="/settings/queues">
                  <Settings2 className="h-4 w-4" aria-hidden />
                  Queue Manager
                </Link>
              </Button>
            ) : null
          }
        />

        {queuesQuery.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : queues.length === 0 ? (
          <EmptyState
            title="No queues available"
            description={
              canManage
                ? 'Create document queues in Queue Manager to organize Purchase Orders, Invoices, and more.'
                : 'Ask an admin to create queues and assign you as a member.'
            }
            action={
              canManage ? (
                <Button asChild>
                  <Link href="/settings/queues">Open Queue Manager</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {queues.map((q) => (
              <Link key={q.id} href={`/queues/${q.id}`} className="block">
                <Card className="h-full transition hover:border-primary/40">
                  <CardContent className="flex h-full flex-col gap-3 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                        <Inbox className="h-4 w-4" aria-hidden />
                      </div>
                      <Badge variant="secondary">{q.documentCount}</Badge>
                    </div>
                    <div>
                      <h2 className="font-semibold text-foreground">{q.name}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {q.documentTypeLabel}
                      </p>
                      {q.description ? (
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                          {q.description}
                        </p>
                      ) : null}
                    </div>
                    <p className="mt-auto text-xs text-muted-foreground">
                      {q.memberCount === 0
                        ? 'Open access'
                        : `${q.memberCount} member${q.memberCount === 1 ? '' : 's'}`}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
