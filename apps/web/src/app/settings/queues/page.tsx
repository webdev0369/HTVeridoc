'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  Inbox,
  Loader2,
  Pencil,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useAuth } from '@/lib/auth-context';
import type {
  DocumentQueueDto,
  DocumentTypeOptionDto,
} from '@/lib/types';

interface OrgUser {
  id: string;
  email: string;
  name: string;
  status: string;
  role: string;
}

type QueueForm = {
  name: string;
  description: string;
  documentType: string;
  isActive: boolean;
  memberUserIds: string[];
};

const emptyForm = (documentType = 'PURCHASE_ORDER_CONFIRMATION'): QueueForm => ({
  name: '',
  description: '',
  documentType,
  isActive: true,
  memberUserIds: [],
});

export default function QueueManagerSettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canRead = Boolean(
    user?.permissions?.includes('queue.read') ||
      user?.permissions?.includes('queue.manage'),
  );
  const canManage = Boolean(user?.permissions?.includes('queue.manage'));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<QueueForm>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<DocumentQueueDto | null>(
    null,
  );
  const [unarchiveTarget, setUnarchiveTarget] =
    useState<DocumentQueueDto | null>(null);

  const queuesQuery = useQuery({
    queryKey: ['document-queues', { includeInactive: canManage }],
    queryFn: () =>
      apiFetch<DocumentQueueDto[]>(
        `/document-queues?includeInactive=${canManage ? 'true' : 'false'}`,
      ),
    enabled: canRead,
  });

  const typesQuery = useQuery({
    queryKey: ['field-config-types'],
    queryFn: () =>
      apiFetch<DocumentTypeOptionDto[]>('/field-config/document-types'),
    enabled: canManage,
  });

  const usersQuery = useQuery({
    queryKey: ['org-users'],
    queryFn: () => apiFetch<OrgUser[]>('/users'),
    enabled: canManage,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        documentType: form.documentType,
        isActive: form.isActive,
        memberUserIds: form.memberUserIds,
      };
      if (editingId) {
        return apiFetch<DocumentQueueDto>(`/document-queues/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      }
      return apiFetch<DocumentQueueDto>('/document-queues', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast.success(editingId ? 'Queue updated' : 'Queue created');
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm());
      void queryClient.invalidateQueries({ queryKey: ['document-queues'] });
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : 'Save failed');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<DocumentQueueDto>(`/document-queues/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Queue archived');
      setArchiveTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['document-queues'] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Archive failed');
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<DocumentQueueDto>(`/document-queues/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: true }),
      }),
    onSuccess: () => {
      toast.success('Queue restored');
      setUnarchiveTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['document-queues'] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Unarchive failed');
    },
  });

  const activeUsers = useMemo(
    () => (usersQuery.data ?? []).filter((u) => u.status === 'ACTIVE'),
    [usersQuery.data],
  );

  function openCreate() {
    const preferred =
      typesQuery.data?.find(
        (t) => t.documentType === 'PURCHASE_ORDER_CONFIRMATION',
      )?.documentType ??
      typesQuery.data?.[0]?.documentType ??
      'PURCHASE_ORDER_CONFIRMATION';
    setEditingId(null);
    setForm(emptyForm(preferred));
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(q: DocumentQueueDto) {
    setEditingId(q.id);
    setForm({
      name: q.name,
      description: q.description ?? '',
      documentType: q.documentType,
      isActive: q.isActive,
      memberUserIds: q.members.map((m) => m.userId),
    });
    setFormError(null);
    setDialogOpen(true);
  }

  function toggleMember(userId: string) {
    setForm((prev) => ({
      ...prev,
      memberUserIds: prev.memberUserIds.includes(userId)
        ? prev.memberUserIds.filter((id) => id !== userId)
        : [...prev.memberUserIds, userId],
    }));
  }

  if (!canRead) {
    return (
      <AppShell>
        <EmptyState
          title="Queue Manager"
          description="You need queue.read permission to view document queues."
        />
      </AppShell>
    );
  }

  const queues = queuesQuery.data ?? [];

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Queue Manager"
          description="Create document queues by type, assign reviewers, and organize the review workflow — separate from Background Jobs."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/queues">
                  <Inbox className="h-4 w-4" aria-hidden />
                  Open queues
                </Link>
              </Button>
              {canManage ? (
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4" aria-hidden />
                  New queue
                </Button>
              ) : null}
            </div>
          }
        />

        {queuesQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : queues.length === 0 ? (
          <EmptyState
            title="No document queues yet"
            description="Create queues such as Purchase Orders, Invoices, or site-specific inboxes. Field requirements still come from Field Manager for each document type."
            action={
              canManage ? (
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Create queue
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Queue</TableHead>
                    <TableHead>Document type</TableHead>
                    <TableHead>Members</TableHead>
                    <TableHead>Documents</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[120px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queues.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell>
                        <Link
                          href={`/queues/${q.id}`}
                          className="font-semibold text-foreground hover:text-primary"
                        >
                          {q.name}
                        </Link>
                        {q.description ? (
                          <div className="mt-0.5 max-w-md truncate text-xs text-muted-foreground">
                            {q.description}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">
                        {q.documentTypeLabel}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {q.memberCount === 0 ? 'Open' : q.memberCount}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {q.documentCount}
                      </TableCell>
                      <TableCell>
                        <Badge variant={q.isActive ? 'secondary' : 'outline'}>
                          {q.isActive ? 'Active' : 'Archived'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {canManage ? (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(q)}
                            >
                              <Pencil className="h-4 w-4" aria-hidden />
                            </Button>
                            {q.isActive ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Archive queue"
                                onClick={() => setArchiveTarget(q)}
                              >
                                <Archive className="h-4 w-4" aria-hidden />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Unarchive queue"
                                onClick={() => setUnarchiveTarget(q)}
                              >
                                <ArchiveRestore className="h-4 w-4" aria-hidden />
                              </Button>
                            )}
                          </div>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit queue' : 'Create queue'}
            </DialogTitle>
            <DialogDescription>
              Bind a document type and optionally restrict access to selected
              users. Leave members empty for an open queue (all reviewers).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="queue-name">Name</Label>
              <Input
                id="queue-name"
                value={form.name}
                onChange={(e) =>
                  setForm((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="e.g. Purchase order confirmations"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="queue-desc">Description</Label>
              <Input
                id="queue-desc"
                value={form.description}
                onChange={(e) =>
                  setForm((p) => ({ ...p, description: e.target.value }))
                }
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label>Document type</Label>
              <Select
                value={form.documentType}
                onValueChange={(v) =>
                  setForm((p) => ({ ...p, documentType: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(typesQuery.data ?? []).map((t) => (
                    <SelectItem key={t.documentType} value={t.documentType}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editingId ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, isActive: e.target.checked }))
                  }
                />
                Active
              </label>
            ) : null}
            <div className="space-y-2">
              <Label>Members</Label>
              <p className="text-xs text-muted-foreground">
                Empty = open to anyone with document access in this org.
              </p>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                {activeUsers.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-muted-foreground">
                    No active users found.
                  </p>
                ) : (
                  activeUsers.map((u) => (
                    <label
                      key={u.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={form.memberUserIds.includes(u.id)}
                        onChange={() => toggleMember(u.id)}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium">{u.name}</span>
                        <Badge
                          variant="outline"
                          className="ml-2 align-middle text-[10px] font-normal"
                        >
                          {u.role}
                        </Badge>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {u.email}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
            {formError ? (
              <p className="text-sm text-destructive">{formError}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                saveMutation.isPending || form.name.trim().length === 0
              }
              onClick={() => {
                setFormError(null);
                saveMutation.mutate();
              }}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              {editingId ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => {
          if (!open && !archiveMutation.isPending) setArchiveTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Archive queue?</DialogTitle>
            <DialogDescription>
              {archiveTarget
                ? `“${archiveTarget.name}” will be archived and hidden from new uploads. Existing documents stay available.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={archiveMutation.isPending}
              onClick={() => setArchiveTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={archiveMutation.isPending || !archiveTarget}
              onClick={() => {
                if (archiveTarget) archiveMutation.mutate(archiveTarget.id);
              }}
            >
              {archiveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(unarchiveTarget)}
        onOpenChange={(open) => {
          if (!open && !unarchiveMutation.isPending) setUnarchiveTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Unarchive queue?</DialogTitle>
            <DialogDescription>
              {unarchiveTarget
                ? `“${unarchiveTarget.name}” will be restored and available for new uploads again.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={unarchiveMutation.isPending}
              onClick={() => setUnarchiveTarget(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={unarchiveMutation.isPending || !unarchiveTarget}
              onClick={() => {
                if (unarchiveTarget) {
                  unarchiveMutation.mutate(unarchiveTarget.id);
                }
              }}
            >
              {unarchiveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Unarchive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
