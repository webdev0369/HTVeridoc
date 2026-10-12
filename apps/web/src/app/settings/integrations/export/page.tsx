'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cable, Loader2, PlugZap, Save, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { ExportConnectionDto } from '@/lib/types';
import { cn } from '@/lib/utils';

type Mode = 'mock' | 'live';

export default function ExportIntegrationPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = Boolean(user?.permissions?.includes('integration.manage'));
  const canRead = Boolean(
    user?.permissions?.includes('integration.read') || canManage,
  );

  const [mode, setMode] = useState<Mode>('mock');
  const [baseUrl, setBaseUrl] = useState('');
  const [username, setUsername] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);

  const connectionQuery = useQuery({
    queryKey: ['integrations', 'export', 'connection'],
    queryFn: () =>
      apiFetch<ExportConnectionDto>('/integrations/export/connection'),
    enabled: canRead,
  });

  useEffect(() => {
    const data = connectionQuery.data;
    if (!data?.configured) {
      setMode('mock');
      setBaseUrl('');
      setUsername('');
      setApiKey('');
      setPassword('');
      setIsActive(true);
      return;
    }
    setMode(data.mode ?? 'mock');
    setBaseUrl(data.baseUrl ?? '');
    setUsername(data.username ?? '');
    setApiKey('');
    setPassword('');
    setIsActive(data.isActive);
  }, [connectionQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch<ExportConnectionDto>('/integrations/export/connection', {
        method: 'PUT',
        body: JSON.stringify({
          mode,
          baseUrl: mode === 'live' ? baseUrl : undefined,
          username: username || undefined,
          apiKey: apiKey || undefined,
          password: password || undefined,
          isActive,
        }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['integrations', 'export', 'connection'], data);
      setApiKey('');
      setPassword('');
      toast.success('Export destination saved for this organization');
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
    },
  });

  const testMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; message: string }>(
        '/integrations/export/connection/test',
        { method: 'POST' },
      ),
    onSuccess: (data) => toast.success(data.message),
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Connection test failed');
    },
  });

  const disableMutation = useMutation({
    mutationFn: () =>
      apiFetch<ExportConnectionDto>('/integrations/export/connection', {
        method: 'DELETE',
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['integrations', 'export', 'connection'], data);
      toast.success('Export destination disabled for this organization');
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Disable failed');
    },
  });

  if (!canRead) {
    return (
      <AppShell>
        <PageHeader
          title="Export destination"
          description="You do not have permission to view integrations."
        />
      </AppShell>
    );
  }

  const data = connectionQuery.data;

  return (
    <AppShell>
      <PageHeader
        title="Export destination"
        description="Connect where this organization sends approved documents. Credentials stay private to this organization."
        actions={
          data?.configured ? (
            <Badge variant={data.isActive ? 'default' : 'secondary'}>
              {data.isActive ? 'Connected' : 'Disabled'}
            </Badge>
          ) : (
            <Badge variant="secondary">Not configured</Badge>
          )
        }
      />

      <div className="mx-auto max-w-2xl space-y-6 px-4 pb-10 md:px-6">
        <Card>
          <CardContent className="space-y-6 pt-6">
            {connectionQuery.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-2/3" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Connection mode</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        {
                          value: 'mock' as const,
                          title: 'Sandbox',
                          blurb: 'Safe testing without a live destination API',
                        },
                        {
                          value: 'live' as const,
                          title: 'Live',
                          blurb: 'Use this organization’s real destination API',
                        },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        disabled={!canManage}
                        onClick={() => setMode(option.value)}
                        className={cn(
                          'rounded-lg border px-3 py-3 text-left transition',
                          mode === option.value
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:bg-muted/50',
                          !canManage && 'opacity-70',
                        )}
                      >
                        <div className="text-sm font-medium">{option.title}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {option.blurb}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {mode === 'live' ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="export-base-url">Base URL</Label>
                      <Input
                        id="export-base-url"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        placeholder="https://api.example.com"
                        disabled={!canManage}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="export-api-key">
                        API key
                        {data?.hasApiKey ? (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            (saved — leave blank to keep)
                          </span>
                        ) : null}
                      </Label>
                      <Input
                        id="export-api-key"
                        type="password"
                        autoComplete="new-password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={
                          data?.hasApiKey ? '••••••••' : 'Enter API key'
                        }
                        disabled={!canManage}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="export-username">
                          Username (optional)
                        </Label>
                        <Input
                          id="export-username"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          disabled={!canManage}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="export-password">
                          Password
                          {data?.hasPassword ? (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              (saved — leave blank to keep)
                            </span>
                          ) : null}
                        </Label>
                        <Input
                          id="export-password"
                          type="password"
                          autoComplete="new-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={
                            data?.hasPassword ? '••••••••' : 'Enter password'
                          }
                          disabled={!canManage}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                    Sandbox mode creates deterministic mock destination IDs for
                    this organization only. Use it while developing; switch to
                    Live when you have real destination credentials for this
                    tenant.
                  </p>
                )}

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border"
                    checked={isActive}
                    disabled={!canManage}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  Connection active (required for export after approve)
                </label>

                {canManage ? (
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      onClick={() => saveMutation.mutate()}
                      disabled={saveMutation.isPending}
                    >
                      {saveMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save connection
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => testMutation.mutate()}
                      disabled={
                        testMutation.isPending ||
                        !connectionQuery.data?.configured
                      }
                    >
                      {testMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <PlugZap className="h-4 w-4" />
                      )}
                      Test connection
                    </Button>
                    {data?.configured && data.isActive ? (
                      <Button
                        variant="ghost"
                        onClick={() => disableMutation.mutate()}
                        disabled={disableMutation.isPending}
                      >
                        <Unplug className="h-4 w-4" />
                        Disable
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    You can view this connection. Ask an admin to change it.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-3 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
          <Cable className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
          <p>
            HTVeriDoc reviews and validates documents. After approve, data is
            sent to the export destination configured for this organization —
            each tenant keeps its own credentials and mappings.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
