'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp, Search, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  DocumentTypeOptionDto,
} from '@/lib/types';

export default function DocumentsPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [documentType, setDocumentType] = useState(
    'PURCHASE_ORDER_CONFIRMATION',
  );
  const [queueId, setQueueId] = useState<string>('none');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ['documents'],
    queryFn: () => apiFetch<DocumentListResponse>('/documents'),
  });

  const typesQuery = useQuery({
    queryKey: ['field-config-types'],
    queryFn: () =>
      apiFetch<DocumentTypeOptionDto[]>('/field-config/document-types'),
  });

  const queuesQuery = useQuery({
    queryKey: ['document-queues'],
    queryFn: () => apiFetch<DocumentQueueDto[]>('/document-queues'),
  });

  const activeQueues = useMemo(
    () => (queuesQuery.data ?? []).filter((q) => q.isActive),
    [queuesQuery.data],
  );

  const selectedQueue = activeQueues.find((q) => q.id === queueId);

  useEffect(() => {
    if (selectedQueue) {
      setDocumentType(selectedQueue.documentType);
    }
  }, [selectedQueue]);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      form.append('documentType', documentType);
      if (queueId !== 'none') {
        form.append('queueId', queueId);
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

  const selectedType = (typesQuery.data ?? []).find(
    (t) => t.documentType === documentType,
  );

  const queueNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const q of queuesQuery.data ?? []) {
      map.set(q.id, q.name);
    }
    return map;
  }, [queuesQuery.data]);

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    const q = search.trim().toLowerCase();
    return items.filter((doc) => {
      if (statusFilter !== 'all' && doc.status !== statusFilter) return false;
      if (!q) return true;
      const queueName = doc.queueId
        ? (queueNameById.get(doc.queueId) ?? '')
        : '';
      return (
        doc.fileName.toLowerCase().includes(q) ||
        doc.documentType.toLowerCase().includes(q) ||
        doc.status.toLowerCase().includes(q) ||
        queueName.toLowerCase().includes(q)
      );
    });
  }, [data?.items, search, statusFilter, queueNameById]);

  const statuses = useMemo(() => {
    const set = new Set((data?.items ?? []).map((d) => d.status));
    return Array.from(set).sort();
  }, [data?.items]);

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Documents"
          description="Upload PDFs into a queue (recommended) or with a document type only."
          actions={
            <>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Queue
                </Label>
                <Select value={queueId} onValueChange={setQueueId}>
                  <SelectTrigger className="min-w-[220px]">
                    <SelectValue placeholder="Optional queue" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No queue</SelectItem>
                    {activeQueues.map((q) => (
                      <SelectItem key={q.id} value={q.id}>
                        {q.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Document type
                </Label>
                <Select
                  value={documentType}
                  onValueChange={setDocumentType}
                  disabled={Boolean(selectedQueue)}
                >
                  <SelectTrigger className="min-w-[240px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(typesQuery.data ?? [
                      {
                        documentType: 'PURCHASE_ORDER_CONFIRMATION',
                        label: 'Purchase order',
                        extractionSupported: true,
                      },
                    ]).map((t) => (
                      <SelectItem key={t.documentType} value={t.documentType}>
                        {t.label}
                        {!t.extractionSupported ? ' (coming soon)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                disabled={upload.isPending}
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="h-4 w-4" aria-hidden />
                {upload.isPending ? 'Uploading…' : 'Upload PDF'}
              </Button>
            </>
          }
        />

        {selectedType && !selectedType.extractionSupported && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Extraction for {selectedType.label} is not available yet. You can
            still upload and configure fields in Settings.
          </div>
        )}

        {loadError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Failed to load documents
          </div>
        )}

        <Card>
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-wrap gap-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by file name, queue, or status…"
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

            {isLoading ? (
              <div className="space-y-3 py-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !filtered.length ? (
              <EmptyState
                title={
                  data?.items?.length
                    ? 'No matching documents'
                    : 'No documents yet'
                }
                description={
                  data?.items?.length
                    ? 'Try a different search or status filter.'
                    : 'Upload a PDF, or open Queues to work in a dedicated inbox.'
                }
                action={
                  !data?.items?.length ? (
                    <Button
                      disabled={upload.isPending}
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
                    <TableHead>Queue</TableHead>
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
                      <TableCell className="text-sm text-muted-foreground">
                        {doc.queueId ? (
                          <Link
                            href={`/queues/${doc.queueId}`}
                            className="hover:text-primary hover:underline"
                          >
                            {queueNameById.get(doc.queueId) ?? 'Queue'}
                          </Link>
                        ) : (
                          '—'
                        )}
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
      </div>
    </AppShell>
  );
}
