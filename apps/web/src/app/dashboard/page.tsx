'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  Cable,
  FileUp,
  KeyRound,
  Inbox,
  ListOrdered,
  Settings2,
  Users,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { DocumentListResponse } from '@/lib/types';

export default function DashboardPage() {
  const { user } = useAuth();
  const canManageFields = Boolean(user?.permissions?.includes('field.manage'));
  const canReadIntegrations = Boolean(
    user?.permissions?.includes('integration.read') ||
      user?.permissions?.includes('integration.manage'),
  );
  const canReadQueue = Boolean(
    user?.permissions?.includes('queue.read') ||
      user?.permissions?.includes('queue.manage'),
  );

  const { data, isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: () => apiFetch<DocumentListResponse>('/documents'),
  });

  const items = data?.items ?? [];

  const stats = useMemo(() => {
    const total = items.length;
    const inReview = items.filter((d) =>
      ['IN_REVIEW', 'READY_FOR_REVIEW', 'VALIDATING'].includes(d.status),
    ).length;
    const approved = items.filter((d) => d.status === 'APPROVED').length;
    const failed = items.filter((d) => d.status.includes('FAILED')).length;
    return { total, inReview, approved, failed };
  }, [items]);

  const recent = useMemo(
    () =>
      [...items]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, 5),
    [items],
  );

  return (
    <AppShell>
      <div className="space-y-8">
        <PageHeader
          title="Dashboard"
          description={`Welcome back${user ? `, ${user.name}` : ''}. Track PO confirmations and jump into review.`}
          actions={
            <Button asChild>
              <Link href="/documents">
                <FileUp className="h-4 w-4" aria-hidden />
                Upload document
              </Link>
            </Button>
          }
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Documents"
            value={isLoading ? '—' : stats.total}
            hint="All uploaded files"
            href="/documents"
            tone="default"
          />
          <StatCard
            label="In review"
            value={isLoading ? '—' : stats.inReview}
            hint="Ready or in progress"
            href="/documents"
            tone="accent"
          />
          <StatCard
            label="Approved"
            value={isLoading ? '—' : stats.approved}
            hint="Confirmed documents"
            href="/documents"
            tone="success"
          />
          <StatCard
            label="Failed"
            value={isLoading ? '—' : stats.failed}
            hint="Needs attention"
            href="/documents"
            tone="danger"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 border-b pb-4">
              <div>
                <CardTitle className="text-base">Recent documents</CardTitle>
                <CardDescription>Latest uploads in your org</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/documents">
                  View all
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="space-y-3 p-5">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : recent.length === 0 ? (
                <EmptyState
                  title="No documents yet"
                  description="Upload a purchase order confirmation PDF to start extraction and review."
                  action={
                    <Button asChild>
                      <Link href="/documents">Go to Documents</Link>
                    </Button>
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">
                        Uploaded
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recent.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <Link
                            href={`/documents/${doc.id}`}
                            className="font-semibold text-foreground hover:text-primary"
                          >
                            {doc.fileName}
                          </Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <StatusBadge status={doc.status} />
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                          {new Date(doc.createdAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Link href="/documents" className="block">
              <Card className="transition hover:border-primary/40">
                <CardHeader>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileUp className="h-4 w-4" aria-hidden />
                  </div>
                  <CardDescription className="pt-2">Workspace</CardDescription>
                  <CardTitle className="text-base">Documents</CardTitle>
                  <CardDescription>
                    Upload PDFs, monitor status, and open the review viewer.
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
            <Link href="/users" className="block">
              <Card className="transition hover:border-primary/40">
                <CardHeader>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground">
                    <Users className="h-4 w-4" aria-hidden />
                  </div>
                  <CardDescription className="pt-2">
                    Administration
                  </CardDescription>
                  <CardTitle className="text-base">Users</CardTitle>
                  <CardDescription>
                    View organization members and roles.
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
            {canManageFields ? (
              <Link href="/settings/fields" className="block">
                <Card className="transition hover:border-primary/40">
                  <CardHeader>
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground">
                      <Settings2 className="h-4 w-4" aria-hidden />
                    </div>
                    <CardDescription className="pt-2">
                      Configuration
                    </CardDescription>
                    <CardTitle className="text-base">Field Manager</CardTitle>
                    <CardDescription>
                      Control required, optional, and ignored review fields.
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ) : null}
            {canReadIntegrations ? (
              <>
                <Link href="/settings/integrations/credentials" className="block">
                  <Card className="transition hover:border-primary/40">
                    <CardHeader>
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground">
                        <KeyRound className="h-4 w-4" aria-hidden />
                      </div>
                      <CardDescription className="pt-2">
                        Configuration
                      </CardDescription>
                      <CardTitle className="text-base">Credentials</CardTitle>
                      <CardDescription>
                        API URL, org ID, and webhook signing secret for partners.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
                <Link href="/settings/integrations/webhooks" className="block">
                  <Card className="transition hover:border-primary/40">
                    <CardHeader>
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground">
                        <Cable className="h-4 w-4" aria-hidden />
                      </div>
                      <CardDescription className="pt-2">
                        Configuration
                      </CardDescription>
                      <CardTitle className="text-base">Webhooks</CardTitle>
                      <CardDescription>
                        Notify partner systems after Approve (status + extraction).
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
                <Link href="/settings/integrations/guide" className="block">
                  <Card className="transition hover:border-primary/40">
                    <CardHeader>
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground">
                        <BookOpen className="h-4 w-4" aria-hidden />
                      </div>
                      <CardDescription className="pt-2">Guides</CardDescription>
                      <CardTitle className="text-base">
                        Integration guide
                      </CardTitle>
                      <CardDescription>
                        Partner BE/FE flow, webhooks, and API reference.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              </>
            ) : null}
            {canReadQueue ? (
              <>
                <Link href="/settings/queues" className="block">
                  <Card className="transition hover:border-primary/40">
                    <CardHeader>
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground">
                        <Inbox className="h-4 w-4" aria-hidden />
                      </div>
                      <CardDescription className="pt-2">
                        Configuration
                      </CardDescription>
                      <CardTitle className="text-base">Queue Manager</CardTitle>
                      <CardDescription>
                        Create document queues, types, and member access.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
                <Link href="/settings/jobs" className="block">
                  <Card className="transition hover:border-primary/40">
                    <CardHeader>
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-foreground">
                        <ListOrdered className="h-4 w-4" aria-hidden />
                      </div>
                      <CardDescription className="pt-2">
                        Administration
                      </CardDescription>
                      <CardTitle className="text-base">Background Jobs</CardTitle>
                      <CardDescription>
                        Inspect and retry failed extraction / export jobs.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
