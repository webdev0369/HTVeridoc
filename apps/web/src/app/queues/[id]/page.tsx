'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileUp, Search, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import type {
  DocumentDto,
  DocumentListResponse,
  DocumentQueueDto,
  DocumentStatus,
} from '@/lib/types';

export default function QueueDetailPage() {
  const params = useParams<{ id: string }>();
  const queueId = params.id;
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const queueQuery = useQuery({
    queryKey: ['document-queues', queueId],
    queryFn: () => apiFetch<DocumentQueueDto>(`/document-queues/${queueId}`),
    enabled: Boolean(queueId),
  });

  const docsQuery = useQuery({
    queryKey: ['documents', { queueId }],
    queryFn: () =>
      apiFetch<DocumentListResponse>(
        `/documents?queueId=${encodeURIComponent(queueId)}&limit=100`,
      ),
    enabled: Boolean(queueId),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      form.append('queueId', queueId);
      if (queueQuery.data?.documentType) {
        form.append('documentType', queueQuery.data.documentType);
      }
      return apiFetch<DocumentDto>('/documents', {
        method: 'POST',
        body: form,
      });
    },
    onSuccess: (doc) => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
      void queryClient.invalidateQueries({ queryKey: ['document-queues'] });
      toast.success(`Uploaded ${doc.fileName}`);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Upload failed');
    },
  });

  const filtered = useMemo(() => {
    const items = docsQuery.data?.items ?? [];
    const q = search.trim().toLowerCase();
    return items.filter((doc) => {
      if (statusFilter !== 'all' && doc.status !== statusFilter) return false;
      if (!q) return true;
      return (
        doc.fileName.toLowerCase().includes(q) ||
        doc.status.toLowerCase().includes(q)
      );
    });
  }, [docsQuery.data?.items, search, statusFilter]);

  const statuses = useMemo(() => {
    const set = new Set((docsQuery.data?.items ?? []).map((d) => d.status));
    return Array.from(set).sort();
  }, [docsQuery.data?.items]);

  const queue = queueQuery.data;

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
            <Link href="/queues">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              All queues
            </Link>
          </Button>
          <PageHeader
            title={queue?.name ?? 'Queue'}
            description={
              queue
                ? `${queue.documentTypeLabel}${queue.description ? ` — ${queue.description}` : ''}`
                : 'Loading…'
            }
            actions={
              <>
                <input
                  ref={inputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) upload.mutate(file);
                    e.target.value = '';
                  }}
                />
                <Button
                  disabled={upload.isPending || !queue?.isActive}
                  onClick={() => inputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" aria-hidden />
                  {upload.isPending ? 'Uploading…' : 'Upload PDF'}
                </Button>
              </>
            }
          />
        </div>

        {queueQuery.isError ? (
          <EmptyState
            title="Queue not found"
            description="This queue may be archived or you may not have access."
            action={
              <Button asChild>
                <Link href="/queues">Back to queues</Link>
              </Button>
            }
          />
        ) : (
          <Card>
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap gap-3">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by file name or status…"
                    className="pl-9"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {statuses.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.replaceAll('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {docsQuery.isLoading || queueQuery.isLoading ? (
                <div className="space-y-3 py-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : !filtered.length ? (
                <EmptyState
                  title={
                    docsQuery.data?.items?.length
                      ? 'No matching documents'
                      : 'No documents in this queue'
                  }
                  description={
                    docsQuery.data?.items?.length
                      ? 'Try a different search or status filter.'
                      : 'Upload a PDF to start extraction for this queue’s document type.'
                  }
                  action={
                    !docsQuery.data?.items?.length ? (
                      <Button
                        disabled={upload.isPending || !queue?.isActive}
                        onClick={() => inputRef.current?.click()}
                      >
                        <FileUp className="h-4 w-4" aria-hidden />
                        Upload PDF
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Pages</TableHead>
                      <TableHead>Uploaded</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <Link
                            href={`/documents/${doc.id}`}
                            className="group flex items-center gap-3"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-[10px] font-bold uppercase text-rose-600 ring-1 ring-rose-100">
                              PDF
                            </span>
                            <span className="font-semibold text-foreground group-hover:text-primary">
                              {doc.fileName}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <StatusBadge status={doc.status as DocumentStatus} />
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {doc.pageCount}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {new Date(doc.createdAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
