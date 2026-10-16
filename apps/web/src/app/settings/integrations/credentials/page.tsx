'use client';

import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  Server,
  Webhook,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { copyToClipboard } from '@/lib/clipboard';
import { cn } from '@/lib/utils';
import type {
  IntegrationCredentialsDto,
  RotateWebhookSecretDto,
} from '@/lib/types';

function CopyRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const ok = await copyToClipboard(value);
    if (!ok) {
      toast.error('Could not copy — select the text and copy manually');
      return;
    }
    setCopied(true);
    toast.success(`${label} copied`);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="flex items-stretch gap-2">
        <div className="flex min-w-0 flex-1 items-center rounded-lg border bg-background px-3 py-2 font-mono text-[13px] leading-snug text-foreground shadow-sm">
          <span className="truncate" title={value}>
            {value}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={copy}
          aria-label={`Copy ${label}`}
        >
          {copied ? (
            <Check className="h-4 w-4 text-emerald-600" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function StepItem({
  done,
  title,
  description,
  action,
}: {
  done: boolean;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 shrink-0">
        {done ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground/50" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p
          className={cn(
            'text-sm font-medium',
            done ? 'text-foreground' : 'text-foreground',
          )}
        >
          {title}
        </p>
        <p className="text-xs text-muted-foreground">{description}</p>
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
    </div>
  );
}

export default function IntegrationCredentialsPage() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const canManage = Boolean(user?.permissions?.includes('integration.manage'));
  const canRead = Boolean(
    user?.permissions?.includes('integration.read') || canManage,
  );

  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(true);

  const credQuery = useQuery({
    queryKey: ['integrations', 'handoff', 'credentials'],
    queryFn: () =>
      apiFetch<IntegrationCredentialsDto>('/integrations/handoff/credentials'),
    enabled: canRead,
  });

  const rotateMutation = useMutation({
    mutationFn: () =>
      apiFetch<RotateWebhookSecretDto>(
        '/integrations/handoff/webhook/rotate-secret',
        { method: 'POST' },
      ),
    onSuccess: async (data) => {
      setRevealedSecret(data.secret);
      setShowSecret(true);
      queryClient.setQueryData(
        ['integrations', 'handoff', 'webhook'],
        data.webhook,
      );
      void queryClient.invalidateQueries({
        queryKey: ['integrations', 'handoff', 'credentials'],
      });
      // Slight delay so focus returns after confirm dialog closes.
      await new Promise((r) => setTimeout(r, 50));
      const copied = await copyToClipboard(data.secret);
      if (copied) {
        toast.success('Signing secret generated and copied to clipboard');
      } else {
        toast.success('Signing secret generated — use Copy secret below');
      }
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not generate secret',
      );
    },
  });

  if (!canRead) {
    return (
      <AppShell>
        <PageHeader
          title="API credentials"
          description="You do not have permission to view integrations."
        />
      </AppShell>
    );
  }

  const data = credQuery.data;
  const hasSecret = Boolean(data?.webhook.hasSecret || revealedSecret);
  const hasWebhookUrl = Boolean(data?.webhook.configured && data?.webhook.url);

  const envBlock = data
    ? [
        `# HTVeriDoc — partner backend only (never commit / never put in FE)`,
        `# Editor URLs: use { url } from POST /integrations/handoff/editor-link (no web origin env)`,
        `HTVERIDOC_API_URL=${data.apiBaseUrl}`,
        `HTVERIDOC_EMAIL=${data.auth.currentUserEmail}`,
        `HTVERIDOC_PASSWORD=<password>`,
        `HTVERIDOC_ORGANIZATION_ID=${data.organizationId}`,
        `HTVERIDOC_WEBHOOK_SECRET=${revealedSecret ?? '<paste-generated-secret>'}`,
      ].join('\n')
    : '';

  return (
    <AppShell>
      <div className="space-y-4 pb-8">
        <PageHeader
          title="API credentials"
          description="Everything your partner backend needs to connect to HTVeriDoc."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/settings/integrations/webhooks">
                  <Webhook className="h-4 w-4" />
                  Webhooks
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/settings/integrations/guide">
                  <BookOpen className="h-4 w-4" />
                  Guide
                </Link>
              </Button>
            </div>
          }
        />

        {credQuery.isLoading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-36 w-full rounded-xl" />
            <Skeleton className="h-36 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl lg:col-span-2" />
          </div>
        ) : data ? (
          <>
            {/* Full-width checklist */}
            <Card>
              <CardHeader className="space-y-1 p-4 pb-2">
                <CardTitle className="text-base">Setup checklist</CardTitle>
                <CardDescription>
                  Complete these steps, then share the .env block with your
                  partner BE team.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <div className="grid gap-3 md:grid-cols-3 md:gap-4">
                  <StepItem
                    done
                    title="1. Copy API connection details"
                    description="Organization ID and API base URL below."
                  />
                  <StepItem
                    done={hasSecret}
                    title="2. Generate webhook signing secret"
                    description="Create a secret, copy it once into HTVERIDOC_WEBHOOK_SECRET."
                    action={
                      !hasSecret && canManage ? (
                        <Button
                          size="sm"
                          onClick={() => rotateMutation.mutate()}
                          disabled={rotateMutation.isPending}
                        >
                          {rotateMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <KeyRound className="h-4 w-4" />
                          )}
                          Generate secret
                        </Button>
                      ) : null
                    }
                  />
                  <StepItem
                    done={hasWebhookUrl && data.webhook.isActive}
                    title="3. Set receiver URL & Test"
                    description="Point HTVeriDoc at your partner webhook endpoint."
                    action={
                      <Button asChild size="sm" variant="outline">
                        <Link href="/settings/integrations/webhooks">
                          Open Webhooks
                        </Link>
                      </Button>
                    }
                  />
                </div>
              </CardContent>
            </Card>

            {/* Two-column main content */}
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <Card className="h-full">
                <CardHeader className="space-y-1 p-4 pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-muted-foreground" />
                        <CardTitle className="text-base">
                          Connection details
                        </CardTitle>
                      </div>
                      <CardDescription>
                        {data.organizationName}
                        {data.organizationSlug
                          ? ` · ${data.organizationSlug}`
                          : ''}
                      </CardDescription>
                    </div>
                    <Badge variant="secondary">Server-side only</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 p-4 pt-2">
                  <CopyRow
                    label="Organization ID"
                    value={data.organizationId}
                    hint="HTVERIDOC_ORGANIZATION_ID"
                  />
                  <CopyRow
                    label="API base URL"
                    value={data.apiBaseUrl}
                    hint="HTVERIDOC_API_URL — no /api/v1 prefix"
                  />
                </CardContent>
              </Card>

              <Card className="h-full">
                <CardHeader className="space-y-1 p-4 pb-2">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-base">Authentication</CardTitle>
                  </div>
                  <CardDescription>
                    Partner BE logs in with email/password and keeps the JWT on
                    the server. Prefer a dedicated integration user.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-4 pt-2">
                  <CopyRow
                    label="Login email (example)"
                    value={data.auth.currentUserEmail}
                    hint="HTVERIDOC_EMAIL — create a dedicated user if needed"
                  />
                  <CopyRow
                    label="Login endpoint"
                    value={`${data.apiBaseUrl}${data.auth.loginPath}`}
                    hint="POST JSON { email, password }"
                  />
                  <Button asChild variant="outline" size="sm">
                    <Link href="/users">Manage users</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-primary/20 shadow-sm lg:col-span-2">
                <CardHeader className="space-y-1 p-4 pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <KeyRound className="h-4 w-4 text-primary" />
                        <CardTitle className="text-base">
                          Webhook signing secret
                        </CardTitle>
                      </div>
                      <CardDescription>
                        Partner BE verifies{' '}
                        <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                          X-HTVeriDoc-Signature
                        </code>{' '}
                        with HMAC-SHA256 of the raw body.
                      </CardDescription>
                    </div>
                    <Badge variant={hasSecret ? 'default' : 'secondary'}>
                      {hasSecret ? 'Configured' : 'Not generated'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 p-4 pt-2">
                  {revealedSecret ? (
                    <div className="space-y-3 rounded-xl border border-amber-300/80 bg-amber-50 p-4">
                      <div className="flex items-start gap-2 text-amber-950">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold">
                            Copy this secret now
                          </p>
                          <p className="text-xs text-amber-900/80">
                            It will not be shown again. Rotating invalidates the
                            previous value.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 cursor-text items-center rounded-lg border border-amber-200 bg-white px-3 py-2.5 text-left font-mono text-[12px] text-foreground"
                          title="Click to select"
                          onClick={(e) => {
                            const el = e.currentTarget;
                            const range = document.createRange();
                            range.selectNodeContents(el);
                            const sel = window.getSelection();
                            sel?.removeAllRanges();
                            sel?.addRange(range);
                          }}
                        >
                          <span className="break-all">
                            {showSecret
                              ? revealedSecret
                              : '••••••••••••••••••••••••••••••••'}
                          </span>
                        </button>
                        <div className="flex shrink-0 gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-10 w-10"
                            onClick={() => setShowSecret((v) => !v)}
                          >
                            {showSecret ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            className="flex-1 sm:flex-none"
                            onClick={async () => {
                              const ok = await copyToClipboard(revealedSecret);
                              if (ok) {
                                toast.success('Secret copied');
                              } else {
                                toast.error(
                                  'Could not copy — select the secret and press Ctrl+C',
                                );
                              }
                            }}
                          >
                            <Copy className="h-4 w-4" />
                            Copy secret
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-5 text-center">
                      <p className="text-sm text-muted-foreground">
                        {data.webhook.hasSecret
                          ? 'A secret is already saved. Rotate only if you need a new value for the partner BE.'
                          : 'No signing secret yet. Generate one to finish partner setup.'}
                      </p>
                    </div>
                  )}

                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={async () => {
                          if (data.webhook.hasSecret) {
                            const ok = await confirm({
                              title: 'Rotate signing secret?',
                              description:
                                'Your partner must update HTVERIDOC_WEBHOOK_SECRET with the new value. The previous secret will stop working immediately.',
                              confirmLabel: 'Rotate secret',
                              cancelLabel: 'Cancel',
                              tone: 'warning',
                            });
                            if (!ok) return;
                          }
                          rotateMutation.mutate();
                        }}
                        disabled={rotateMutation.isPending}
                        variant={
                          data.webhook.hasSecret && !revealedSecret
                            ? 'outline'
                            : 'default'
                        }
                      >
                        {rotateMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        {data.webhook.hasSecret
                          ? 'Rotate secret'
                          : 'Generate signing secret'}
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <Link href="/settings/integrations/webhooks">
                          Configure receiver URL
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Ask an organization admin to generate the signing secret.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader className="space-y-1 p-4 pb-2">
                  <CardTitle className="text-base">
                    Partner BE environment
                  </CardTitle>
                  <CardDescription>
                    Paste into their server <code>.env</code>. Never commit or
                    expose in the frontend.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 p-4 pt-2">
                  <pre className="overflow-x-auto rounded-xl border bg-slate-950 p-3.5 font-mono text-[12px] leading-relaxed text-slate-100 md:text-[13px]">
                    {envBlock}
                  </pre>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      const ok = await copyToClipboard(envBlock);
                      if (ok) {
                        toast.success('.env template copied');
                      } else {
                        toast.error(
                          'Could not copy — select the .env block and press Ctrl+C',
                        );
                      }
                    }}
                  >
                    <Copy className="h-4 w-4" />
                    Copy .env template
                  </Button>
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Could not load credentials. Refresh and try again.
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
