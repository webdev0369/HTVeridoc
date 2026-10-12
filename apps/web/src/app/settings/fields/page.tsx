'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type {
  DocumentTypeOptionDto,
  FieldConfigItemDto,
  FieldConfigResponse,
  FieldMode,
} from '@/lib/types';

const MODES: { value: FieldMode; label: string }[] = [
  { value: 'IGNORED', label: 'Ignored' },
  { value: 'OPTIONAL', label: 'Optional' },
  { value: 'REQUIRED', label: 'Required' },
];

export default function FieldSettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = Boolean(user?.permissions?.includes('field.manage'));

  const typesQuery = useQuery({
    queryKey: ['field-config-types'],
    queryFn: () =>
      apiFetch<DocumentTypeOptionDto[]>('/field-config/document-types'),
  });

  const [documentType, setDocumentType] = useState<string>('');
  const [draft, setDraft] = useState<FieldConfigItemDto[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!documentType && typesQuery.data?.length) {
      const preferred =
        typesQuery.data.find(
          (t) => t.documentType === 'PURCHASE_ORDER_CONFIRMATION',
        ) ?? typesQuery.data[0];
      setDocumentType(preferred.documentType);
    }
  }, [typesQuery.data, documentType]);

  const configQuery = useQuery({
    queryKey: ['field-config', documentType],
    queryFn: () =>
      apiFetch<FieldConfigResponse>(
        `/field-config?documentType=${encodeURIComponent(documentType)}`,
      ),
    enabled: Boolean(documentType),
  });

  useEffect(() => {
    if (configQuery.data?.fields) {
      setDraft(configQuery.data.fields);
    }
  }, [configQuery.data]);

  const dirty = useMemo(() => {
    if (!configQuery.data?.fields) return false;
    const original = new Map(
      configQuery.data.fields.map((f) => [f.fieldKey, f.mode]),
    );
    return draft.some((f) => original.get(f.fieldKey) !== f.mode);
  }, [draft, configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch<FieldConfigResponse>('/field-config', {
        method: 'PUT',
        body: JSON.stringify({
          documentType,
          fields: draft.map((f) => ({ fieldKey: f.fieldKey, mode: f.mode })),
        }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['field-config', documentType], data);
      setDraft(data.fields);
      toast.success('Field settings saved');
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
    },
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      apiFetch<FieldConfigResponse>(
        `/field-config/reset?documentType=${encodeURIComponent(documentType)}`,
        { method: 'POST' },
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(['field-config', documentType], data);
      setDraft(data.fields);
      toast.success('Reset to defaults');
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Reset failed');
    },
  });

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const order: string[] = [];
    const map = new Map<string, FieldConfigItemDto[]>();
    for (const field of draft) {
      if (
        q &&
        !field.label.toLowerCase().includes(q) &&
        !field.fieldKey.toLowerCase().includes(q)
      ) {
        continue;
      }
      if (!map.has(field.group)) {
        map.set(field.group, []);
        order.push(field.group);
      }
      map.get(field.group)!.push(field);
    }
    return order.map((title) => ({ title, fields: map.get(title)! }));
  }, [draft, search]);

  const selectedType = typesQuery.data?.find(
    (t) => t.documentType === documentType,
  );

  const setMode = (fieldKey: string, mode: FieldMode) => {
    setDraft((prev) =>
      prev.map((f) => (f.fieldKey === fieldKey ? { ...f, mode } : f)),
    );
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Field Manager"
          description="Choose which extracted fields appear in review for each document type. Ignored fields are still extracted and stored, but not shown in review. Required fields must be filled before Confirm."
          actions={
            canManage ? (
              <>
                <Button
                  variant="outline"
                  disabled={resetMutation.isPending}
                  onClick={() => resetMutation.mutate()}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  {resetMutation.isPending ? 'Resetting…' : 'Reset to defaults'}
                </Button>
                <Button
                  disabled={!dirty || saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                >
                  <Save className="h-4 w-4" aria-hidden />
                  {saveMutation.isPending ? 'Saving…' : 'Save changes'}
                </Button>
              </>
            ) : undefined
          }
        />

        {!canManage && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            You can view field settings, but only users with{' '}
            <code className="rounded bg-amber-100 px-1 text-xs">
              field.manage
            </code>{' '}
            can save changes.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(typesQuery.data ?? []).map((t) => (
            <Button
              key={t.documentType}
              type="button"
              size="sm"
              variant={documentType === t.documentType ? 'default' : 'outline'}
              onClick={() => setDocumentType(t.documentType)}
              className="rounded-full"
            >
              {t.label}
            </Button>
          ))}
        </div>

        {selectedType && !selectedType.extractionSupported && (
          <div className="rounded-lg border bg-muted px-4 py-3 text-sm text-muted-foreground">
            Extraction for this document type is not available yet. You can
            still configure fields for when it ships.
          </div>
        )}

        {configQuery.data?.requiresLineItems && (
          <p className="text-sm text-muted-foreground">
            Line items remain required for purchase order confirmations (not
            configurable in this version).
          </p>
        )}

        <div className="max-w-sm">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fields…"
            className="input-field"
          />
        </div>

        <Card>
          <CardContent className="p-0">
            {configQuery.isLoading && (
              <div className="space-y-3 p-5">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}
            {groups.map((group) => (
              <section
                key={group.title}
                className="border-b last:border-0"
              >
                <h2 className="bg-muted/60 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {group.title}
                </h2>
                <ul className="divide-y">
                  {group.fields.map((field) => (
                    <li
                      key={field.fieldKey}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
                    >
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {field.label}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                          {field.fieldKey}
                        </p>
                      </div>
                      <div className="inline-flex rounded-lg bg-muted p-0.5 ring-1 ring-border">
                        {MODES.map((mode) => (
                          <button
                            key={mode.value}
                            type="button"
                            disabled={!canManage}
                            onClick={() => setMode(field.fieldKey, mode.value)}
                            className={cn(
                              'rounded-md px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-60',
                              field.mode === mode.value
                                ? mode.value === 'REQUIRED'
                                  ? 'bg-rose-600 text-white shadow-sm'
                                  : mode.value === 'IGNORED'
                                    ? 'bg-slate-700 text-white shadow-sm'
                                    : 'bg-primary text-primary-foreground shadow-sm'
                                : 'text-muted-foreground hover:bg-card',
                            )}
                          >
                            {mode.label}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {!configQuery.isLoading && !groups.length && (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                No fields match your search.
              </p>
            )}
          </CardContent>
        </Card>

        {canManage && dirty && (
          <div className="sticky bottom-4 z-10 flex justify-end">
            <div className="flex gap-2 rounded-xl border bg-card/95 p-2 shadow-soft backdrop-blur">
              <Button
                variant="outline"
                size="sm"
                disabled={resetMutation.isPending}
                onClick={() => resetMutation.mutate()}
              >
                Reset
              </Button>
              <Button
                size="sm"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
