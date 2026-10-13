'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { BookOpen, Loader2, PlugZap, Save, Unplug, Webhook } from 'lucide-react';
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
      setIsActive(true);
      return;
    }
    setUrl(data.url ?? '');
    setSecret('');
    setIsActive(data.isActive);
  }, [webhookQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch<WebhookEndpointDto>('/integrations/handoff/webhook', {
        method: 'PUT',
        body: JSON.stringify({
          url,
          secret: secret || undefined,
          isActive,
        }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['integrations', 'handoff', 'webhook'], data);
      setSecret('');
      toast.success('Webhook saved — other projects will receive status events');
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
              <Link href="/settings/integrations/webhooks/guide">
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
              href="/settings/integrations/webhooks/guide"
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

                <div className="space-y-2">
                  <Label htmlFor="webhook-secret">
                    Signing secret
                    {data?.hasSecret ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        (saved — leave blank to keep; auto-created on first save)
                      </span>
                    ) : (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        (optional — auto-generated if blank)
                      </span>
                    )}
                  </Label>
                  <Input
                    id="webhook-secret"
                    type="password"
                    autoComplete="new-password"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder={data?.hasSecret ? '••••••••' : 'Optional'}
                    disabled={!canManage}
                  />
                  <p className="text-xs text-muted-foreground">
                    Verify with header{' '}
                    <code>X-HTVeriDoc-Signature</code> (HMAC-SHA256 of body).
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
            <code>document.ready_for_review</code>,{' '}
            <code>document.approved</code>, <code>document.rejected</code>.
            Payload includes <code>extraction</code> and <code>editorUrl</code>.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
