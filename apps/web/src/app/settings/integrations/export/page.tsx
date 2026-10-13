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
  const [inventoryId, setInventoryId] = useState('');
  const [usePartnerSchedule, setUsePartnerSchedule] = useState(false);
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
      setInventoryId('');
      setUsePartnerSchedule(false);
      setIsActive(true);
      return;
    }
    setMode(data.mode ?? 'mock');
    setBaseUrl(data.baseUrl ?? '');
    setUsername(data.username ?? '');
    setApiKey('');
    setPassword('');
    setInventoryId(data.inventoryId ?? '');
    setUsePartnerSchedule(Boolean(data.usePartnerSchedule));
    setIsActive(data.isActive);
  }, [connectionQuery.data]);

  const testMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; message: string }>(
        '/integrations/export/connection/test',
        { method: 'POST' },
      ),
    onSuccess: (data) => toast.success(data.message),
    onError: (err) => {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Connection test failed. Check your settings and try again.';
      toast.error(message, { duration: 8_000 });
    },
  });

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
          inventoryId: mode === 'live' ? inventoryId : undefined,
          usePartnerSchedule: mode === 'live' ? usePartnerSchedule : false,
          isActive,
        }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['integrations', 'export', 'connection'], data);
      setApiKey('');
      setPassword('');
      testMutation.reset();
      toast.success('Export destination saved for this organization');
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
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
  const canTest = Boolean(data?.configured && data.isActive);
  const testBlockedReason = !data?.configured
    ? 'Save a Sandbox or Live connection first, then you can test it.'
    : !data.isActive
      ? 'Turn on “Connection active” and save, then test again.'
      : null;

  return (
    <AppShell>
      <PageHeader
        title="Export destination"
        description="Per-organization connection for sending approved documents. Use Sandbox for safe testing; switch to Live when destination credentials are ready."
        actions={
          data?.configured ? (
            <Badge variant={data.isActive ? 'default' : 'secondary'}>
              {data.isActive
                ? data.mode === 'mock'
                  ? 'Sandbox connected'
                  : 'Live connected'
                : 'Disabled'}
            </Badge>
          ) : (
            <Badge variant="secondary">Not configured</Badge>
          )
        }
      />

      <div className="mx-auto max-w-2xl space-y-6 px-4 pb-10 md:px-6">
        {!connectionQuery.isLoading && !data?.configured ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-medium">Not configured yet</p>
            <p className="mt-1 text-amber-900/80">
              Choose Sandbox (recommended) or Live, then click{' '}
              <strong>Save connection</strong>. Until this is saved and active,
              approve/export and “Test connection” will not work.
            </p>
          </div>
        ) : null}

        {!connectionQuery.isLoading && data?.configured && !data.isActive ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-medium">Connection is disabled</p>
            <p className="mt-1 text-amber-900/80">
              This organization has export settings, but they are inactive.
              Check <strong>Connection active</strong> and save before testing
              or exporting documents.
            </p>
          </div>
        ) : null}

        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <p className="font-medium">Recommended for now</p>
          <p className="mt-1 text-sky-900/80">
            Keep <strong>Sandbox</strong> active while the live destination API
            contract is confirmed. Approve still exports safely with stable mock
            IDs — retries stay idempotent and no real customer data is written
            to the live system.
          </p>
          <p className="mt-2 text-xs text-sky-900/70">
            Live create uses TotalCtrl{' '}
            <code className="rounded bg-sky-100 px-1">
              POST /orders/store-orders
            </code>{' '}
            (or Partner schedule) with the Rossum parse-order field names — not
            Rossum upload/webhooks. See{' '}
            <code className="rounded bg-sky-100 px-1">
              docs/export-destination-contract.md
            </code>
            .
          </p>
        </div>

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
                        placeholder="https://api.example.com (no /api/v1 suffix)"
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
                    <div className="space-y-2">
                      <Label htmlFor="export-inventory-id">
                        Inventory ID
                        {!usePartnerSchedule ? (
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            (required for store-orders)
                          </span>
                        ) : (
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            (optional with Partner schedule)
                          </span>
                        )}
                      </Label>
                      <Input
                        id="export-inventory-id"
                        value={inventoryId}
                        onChange={(e) => setInventoryId(e.target.value)}
                        placeholder="TotalCtrl inventory UUID"
                        disabled={!canManage}
                      />
                    </div>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border"
                        checked={usePartnerSchedule}
                        disabled={!canManage}
                        onChange={(e) =>
                          setUsePartnerSchedule(e.target.checked)
                        }
                      />
                      <span>
                        Use Partner schedule (
                        <code className="text-xs">
                          POST /partner/v1/orders/schedule
                        </code>
                        ) instead of{' '}
                        <code className="text-xs">/orders/store-orders</code>
                      </span>
                    </label>
                  </>
                ) : (
                  <div className="space-y-2 rounded-lg border border-dashed bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
                    <p>
                      <strong className="text-foreground">Sandbox</strong> is
                      the professional test mode for this organization. After
                      approve, HTVeriDoc still runs matching and export, using
                      stable mock destination IDs — retries stay idempotent and
                      no live system is called.
                    </p>
                    <p>
                      Switch to Live only when you have the correct API base
                      URL and authentication details from the destination team.
                    </p>
                  </div>
                )}

                {mode === 'live' ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
                    Live mode needs the TotalCtrl API root (no trailing slash)
                    and a Bearer JWT/API key. Create goes to{' '}
                    <code>POST /orders/store-orders</code> (requires inventory
                    ID) or Partner schedule. Health check:{' '}
                    <code>GET /health</code>.
                  </p>
                ) : null}

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
                  <div className="space-y-2 pt-2">
                    <div className="flex flex-wrap gap-2">
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
                        disabled={testMutation.isPending || !canTest}
                        title={testBlockedReason ?? 'Verify this connection'}
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
                    {testBlockedReason ? (
                      <p className="text-xs text-muted-foreground">
                        {testBlockedReason}
                      </p>
                    ) : null}
                    {testMutation.isError ? (
                      <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                        {testMutation.error instanceof ApiError
                          ? testMutation.error.message
                          : 'Connection test failed. Check your settings and try again.'}
                      </p>
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
            SaaS isolation: each organization stores its own export connection
            and product mappings. Credentials are encrypted at rest and never
            shared across tenants. HTVeriDoc remains the review layer; the
            destination system remains the business system of record.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
