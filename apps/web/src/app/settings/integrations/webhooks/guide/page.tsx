'use client';

import Link from 'next/link';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';

export default function WebhookIntegrationGuidePage() {
  return (
    <AppShell>
      <PageHeader
        title="Webhook integration guide"
        description="Rossum-style status events: how other systems connect, listen, and test."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/integrations/webhooks">
              <ArrowLeft className="h-4 w-4" />
              Back to Webhooks
            </Link>
          </Button>
        }
      />

      <div className="mx-auto max-w-3xl space-y-8 px-4 pb-12 text-sm leading-relaxed md:px-6">
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Overview</h2>
          <p className="text-muted-foreground">
            HTVeriDoc parses and reviews documents, then{' '}
            <strong className="text-foreground">POSTs status events</strong> to
            your receiver URL — same idea as Rossum → TotalCtrl/socket. Your
            system updates its own status and continues the workflow.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">Events we send</h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 font-medium">Event</th>
                  <th className="px-3 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-t">
                  <td className="px-3 py-2 font-mono">document.extracted</td>
                  <td className="px-3 py-2">Extraction completed</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-mono">document.validating</td>
                  <td className="px-3 py-2">
                    Validation running (in validate)
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-mono">document.ready_for_review</td>
                  <td className="px-3 py-2">Ready for human review</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-mono">document.in_review</td>
                  <td className="px-3 py-2">
                    Review started / reopened (in review)
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-mono">document.approved</td>
                  <td className="px-3 py-2">
                    Data confirmed — main handoff (includes extraction)
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-mono">document.rejected</td>
                  <td className="px-3 py-2">Rejected</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-mono">document.extraction_failed</td>
                  <td className="px-3 py-2">Extraction failed</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-mono">webhook.test</td>
                  <td className="px-3 py-2">Manual Test button</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">1. Configure receiver</h2>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>
              Open{' '}
              <Link
                href="/settings/integrations/webhooks"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Settings → Webhooks
              </Link>
            </li>
            <li>
              Set Receiver URL to your endpoint (example:{' '}
              <code className="rounded bg-muted px-1 text-xs">
                https://api.example.com/webhook/htveridoc/document-status-update
              </code>
              )
            </li>
            <li>Save → Test (must return HTTP 2xx, not 404)</li>
          </ol>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">2. What we send</h2>
          <p className="text-muted-foreground">
            HTTP <code className="rounded bg-muted px-1">POST</code> JSON with
            headers <code className="rounded bg-muted px-1">X-HTVeriDoc-Event</code>
            , optional{' '}
            <code className="rounded bg-muted px-1">X-HTVeriDoc-Signature</code>{' '}
            (HMAC-SHA256 of body).
          </p>
          <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed">
{`{
  "event": "document.approved",
  "occurredAt": "2026-10-13T06:00:00.000Z",
  "organizationId": "uuid",
  "documentId": "uuid",
  "status": "APPROVED",
  "documentType": "PURCHASE_ORDER_CONFIRMATION",
  "fileName": "po.pdf",
  "editorUrl": "https://your-htveridoc/editor/<token>",
  "extraction": {
    "documentNumber": "211851250",
    "supplierName": "Seller AS",
    "currency": "NOK",
    "fields": { "...": "..." },
    "lineItems": [ { "sku fields, qty, units, prices": "..." } ]
  }
}`}
          </pre>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">
            3. Integrate from another system
          </h2>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>
              Login: <code className="rounded bg-muted px-1">POST /auth/login</code>
            </li>
            <li>
              Upload PDF:{' '}
              <code className="rounded bg-muted px-1">POST /documents</code>{' '}
              (multipart <code className="rounded bg-muted px-1">file</code>)
            </li>
            <li>
              Extract:{' '}
              <code className="rounded bg-muted px-1">
                POST /documents/:id/process
              </code>
            </li>
            <li>
              Optional review via{' '}
              <code className="rounded bg-muted px-1">editorUrl</code> /{' '}
              <code className="rounded bg-muted px-1">
                POST /integrations/handoff/editor-link
              </code>
            </li>
            <li>
              Approve:{' '}
              <code className="rounded bg-muted px-1">
                POST /documents/:id/approve
              </code>
            </li>
            <li>Your webhook receives status + extraction</li>
          </ol>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">4. How to test today</h2>
          <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
            <li>
              <strong className="text-foreground">Connectivity:</strong> use{' '}
              <a
                href="https://webhook.site"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                webhook.site
              </a>{' '}
              as Receiver URL → Save → Test → confirm <code>webhook.test</code>
            </li>
            <li>
              <strong className="text-foreground">Full parse flow:</strong>{' '}
              Upload PDF → Extract → Review → Approve → check receiver for{' '}
              <code>document.approved</code> with line items
            </li>
            <li>
              <strong className="text-foreground">Editor link:</strong> Copy
              editor link on a document → open in private window
            </li>
            <li>
              <strong className="text-foreground">Real socket URL:</strong>{' '}
              only after their route exists (404 means path not ready). Then
              repeat Test + Approve
            </li>
          </ol>
        </section>

        <div className="flex items-start gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-muted-foreground">
          <BookOpen className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            If Test returns HTTP 404, HTVeriDoc is fine — the receiver URL/path
            is missing on TotalCtrl/socket. Ask them for the exact HTVeriDoc
            webhook path first.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
