'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  AlertTriangle,
  BookOpen,
  Copy,
  KeyRound,
  Loader2,
  PlugZap,
  Save,
  Unplug,
  Webhook,
} from 'lucide-react';
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
import { copyToClipboard } from '@/lib/clipboard';
import type { WebhookEndpointDto } from '@/lib/types';

export default function WebhooksSettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = Boolean(user?.permissions?.includes('integration.manage'));
  const canRead = Boolean(
    user?.permissions?.includes('integration.read') || canManage,
  );

  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [replaceSecret, setReplaceSecret] = useState(false);
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);

  const webhookQuery = useQuery({
    queryKey: ['integrations', 'handoff', 'webhook'],
    queryFn: () =>
      apiFetch<WebhookEndpointDto>('/integrations/handoff/webhook'),
    enabled: canRead,
  });

  useEffect(() => {
    const data = webhookQuery.data;
    if (!data?.configured) {
      setUrl('');
      setSecret('');
      setReplaceSecret(false);
      setIsActive(true);
      return;
    }
    setUrl(data.url ?? '');
    setSecret('');
    setReplaceSecret(false);
    setIsActive(data.isActive);
  }, [webhookQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch<WebhookEndpointDto>('/integrations/handoff/webhook', {
        method: 'PUT',
        body: JSON.stringify({
          url,
          secret: replaceSecret && secret.trim() ? secret.trim() : undefined,
          isActive,
        }),
      }),
    onSuccess: async (data) => {
      queryClient.setQueryData(['integrations', 'handoff', 'webhook'], data);
      setSecret('');
      setReplaceSecret(false);
      if (data.generatedSecret) {
        setOneTimeSecret(data.generatedSecret);
        const copied = await copyToClipboard(data.generatedSecret);
        toast.success(
          copied
            ? 'Webhook saved — new signing secret copied (shown once below)'
            : 'Webhook saved — copy the new signing secret below (shown once)',
          { duration: 10_000 },
        );
      } else {
        setOneTimeSecret(null);
        toast.success(
          'Webhook saved — receiver URL updated. Existing signing secret unchanged.',
        );
      }
      void queryClient.invalidateQueries({
        queryKey: ['integrations', 'handoff', 'credentials'],
      });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
    },
  });

  const testMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; message: string }>(
        '/integrations/handoff/webhook/test',
        { method: 'POST' },
      ),
    onSuccess: (data) => toast.success(data.message),
    onError: (err) => {
      toast.error(
        err instanceof ApiError ? err.message : 'Webhook test failed',
        { duration: 8_000 },
      );
    },
  });

  const disableMutation = useMutation({
    mutationFn: () =>
      apiFetch<WebhookEndpointDto>('/integrations/handoff/webhook', {
        method: 'DELETE',
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['integrations', 'handoff', 'webhook'], data);
      toast.success('Webhook disabled');
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Disable failed');
    },
  });

  if (!canRead) {
    return (
      <AppShell>
        <PageHeader
          title="Webhooks"
          description="You do not have permission to view integrations."
        />
      </AppShell>
    );
  }

  const data = webhookQuery.data;
  const canTest = Boolean(data?.configured && data.isActive);

  return (
    <AppShell>
      <PageHeader
        title="Webhooks"
        description="Notify other projects when parsing/review status changes. HTVeriDoc sends status + extraction payload (and editor link)."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/integrations/credentials">
                API credentials
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/integrations/guide">
                <BookOpen className="h-4 w-4" />
                Integration guide
              </Link>
            </Button>
            {data?.configured ? (
              <Badge variant={data.isActive ? 'default' : 'secondary'}>
                {data.isActive ? 'Active' : 'Disabled'}
              </Badge>
            ) : (
              <Badge variant="secondary">Not configured</Badge>
            )}
          </div>
        }
      />

      <div className="mx-auto max-w-2xl space-y-6 px-4 pb-10 md:px-6">
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <p className="font-medium">How it works</p>
          <p className="mt-1 text-sky-900/80">
            On approve (and other status changes), we POST to your receiver URL
            with document status and extraction fields/lines — same pattern as
            Rossum status webhooks into TotalCtrl/socket.
          </p>
          <p className="mt-2">
            <Link
              href="/settings/integrations/guide"
              className="inline-flex items-center gap-1.5 font-medium text-sky-900 underline-offset-2 hover:underline"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Read the integration guide
            </Link>
          </p>
        </div>

        <Card>
          <CardContent className="space-y-6 pt-6">
            {webhookQuery.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-2/3" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="webhook-url">Receiver URL</Label>
                  <Input
                    id="webhook-url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://api.example.com/webhook/htveridoc/document-status-update"
                    disabled={!canManage}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label>Signing secret</Label>
                    <Badge variant={data?.hasSecret ? 'default' : 'secondary'}>
                      {data?.hasSecret
                        ? 'Saved on server'
                        : 'Not set yet'}
                    </Badge>
                  </div>

                  {data?.hasSecret ? (
                    <div className="rounded-lg border bg-muted/40 px-3 py-3 text-sm">
                      <p className="font-medium text-foreground">
                        A signing secret is already stored
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        For security we never show the saved value again here.
                        The dots you may have seen before were only a
                        placeholder — not your real secret. Partner BE should
                        already have it in{' '}
                        <code className="rounded bg-muted px-1">
                          HTVERIDOC_WEBHOOK_SECRET
                        </code>
                        .
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href="/settings/integrations/credentials">
                            <KeyRound className="h-3.5 w-3.5" />
                            Rotate / copy on API credentials
                          </Link>
                        </Button>
                        {canManage ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setReplaceSecret((v) => !v);
                              setSecret('');
                            }}
                          >
                            {replaceSecret
                              ? 'Cancel replace'
                              : 'Replace with a new secret'}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                      No signing secret yet. Save the webhook to auto-create
                      one, or generate it on{' '}
                      <Link
                        href="/settings/integrations/credentials"
                        className="font-medium text-primary underline-offset-2 hover:underline"
                      >
                        API credentials
                      </Link>
                      .
                    </div>
                  )}

                  {oneTimeSecret ? (
                    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                      <div className="flex items-start gap-2 text-amber-950">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold">
                            New secret — copy now
                          </p>
                          <p className="text-xs text-amber-900/80">
                            This is the only time HTVeriDoc shows this value.
                          </p>
                        </div>
                      </div>
                      <code className="block break-all rounded border border-amber-200 bg-white px-3 py-2 font-mono text-xs">
                        {oneTimeSecret}
                      </code>
                      <Button
                        type="button"
                        size="sm"
                        onClick={async () => {
                          const ok = await copyToClipboard(oneTimeSecret);
                          toast[ok ? 'success' : 'error'](
                            ok
                              ? 'Secret copied'
                              : 'Could not copy — select the text manually',
                          );
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy secret
                      </Button>
                    </div>
                  ) : null}

                  {replaceSecret && canManage ? (
                    <div className="space-y-2">
                      <Label htmlFor="webhook-secret">
                        Paste replacement secret
                      </Label>
                      <Input
                        id="webhook-secret"
                        type="text"
                        autoComplete="off"
                        value={secret}
                        onChange={(e) => setSecret(e.target.value)}
                        placeholder="Paste new secret, then Save webhook"
                      />
                      <p className="text-xs text-muted-foreground">
                        Leave this empty and turn off “Replace” to keep the
                        current saved secret unchanged.
                      </p>
                    </div>
                  ) : null}

                  <p className="text-xs text-muted-foreground">
                    Partner verifies{' '}
                    <code className="rounded bg-muted px-1">
                      X-HTVeriDoc-Signature
                    </code>{' '}
                    (HMAC-SHA256 of raw body).
                  </p>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border"
                    checked={isActive}
                    disabled={!canManage}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  Webhook active
                </label>

                {canManage ? (
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      onClick={() => saveMutation.mutate()}
                      disabled={saveMutation.isPending || !url.trim()}
                    >
                      {saveMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save webhook
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => testMutation.mutate()}
                      disabled={!canTest || testMutation.isPending}
                    >
                      {testMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <PlugZap className="h-4 w-4" />
                      )}
                      Test
                    </Button>
                    {data?.configured ? (
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
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <Webhook className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Key events: <code>document.extracted</code>,{' '}
            <code>document.validating</code>,{' '}
            <code>document.ready_for_review</code>,{' '}
            <code>document.in_review</code>, <code>document.approved</code>,{' '}
            <code>document.rejected</code>. Payload includes{' '}
            <code>extraction</code> and <code>editorUrl</code>.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
