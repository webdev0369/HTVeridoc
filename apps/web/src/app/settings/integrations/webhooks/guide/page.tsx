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
        description="How other systems receive HTVeriDoc status events and open the review editor."
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
            HTVeriDoc parses and reviews purchase documents. When status changes
            (for example after approve), we{' '}
            <strong className="text-foreground">POST a webhook</strong> to your
            receiver URL — same idea as Rossum → TotalCtrl/socket status update.
            Your system listens and updates its own status / continues the
            workflow.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">1. Configure in HTVeriDoc</h2>
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
              Set <strong className="text-foreground">Receiver URL</strong> to
              your endpoint (example:{' '}
              <code className="rounded bg-muted px-1 text-xs">
                https://api.example.com/webhook/htveridoc/document-status-update
              </code>
              )
            </li>
            <li>
              Optional: set a <strong className="text-foreground">signing secret</strong>{' '}
              (auto-generated if blank)
            </li>
            <li>Save → Test</li>
          </ol>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">2. What we send</h2>
          <p className="text-muted-foreground">HTTP <code className="rounded bg-muted px-1">POST</code> with JSON body.</p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 font-medium">Header</th>
                  <th className="px-3 py-2 font-medium">Meaning</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-t">
                  <td className="px-3 py-2 font-mono">Content-Type</td>
                  <td className="px-3 py-2">application/json</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-mono">X-HTVeriDoc-Event</td>
                  <td className="px-3 py-2">Event name, e.g. document.approved</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-mono">X-HTVeriDoc-Signature</td>
                  <td className="px-3 py-2">
                    HMAC-SHA256 hex of raw body (when secret is set)
                  </td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-mono">X-HTVeriDoc-Delivery</td>
                  <td className="px-3 py-2">Unique delivery id</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">3. Events</h2>
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
                  <td className="px-3 py-2 font-mono">document.ready_for_review</td>
                  <td className="px-3 py-2">Ready for human review</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-mono">document.in_review</td>
                  <td className="px-3 py-2">Review started / reopened</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-mono">document.approved</td>
                  <td className="px-3 py-2">User confirmed extracted data</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-mono">document.rejected</td>
                  <td className="px-3 py-2">Document rejected</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-mono">document.extraction_failed</td>
                  <td className="px-3 py-2">Extraction failed</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-mono">document.validation_failed</td>
                  <td className="px-3 py-2">Validation failed</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">4. Example payload</h2>
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
    "fields": { "documentNumber": "211851250", "supplier.name": "Seller AS" },
    "lineItems": [
      {
        "id": "uuid",
        "lineType": "PRODUCT",
        "articleNumber": "391119",
        "description": "Beger PP 750ml",
        "purchaseQuantity": "12",
        "purchaseUnit": "PK",
        "stockTakingQuantity": "2400",
        "stocktakingUnit": "STK",
        "stockTakingQuantityPerPurchaseUnit": "200",
        "unitPrice": "75.49",
        "amount": "905.88"
      }
    ]
  }
}`}
          </pre>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">5. Editor link</h2>
          <p className="text-muted-foreground">
            Webhooks include <code className="rounded bg-muted px-1">editorUrl</code>{' '}
            when possible. Your app can open that URL so users review the document
            in HTVeriDoc.
          </p>
          <p className="text-muted-foreground">
            Or create a link via API:{' '}
            <code className="rounded bg-muted px-1">
              POST /integrations/handoff/editor-link
            </code>{' '}
            with{' '}
            <code className="rounded bg-muted px-1">
              {`{ "documentId": "uuid" }`}
            </code>
            .
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold">6. Admin API (authenticated)</h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 font-medium">Method</th>
                  <th className="px-3 py-2 font-medium">Path</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-t">
                  <td className="px-3 py-2 font-mono">GET</td>
                  <td className="px-3 py-2 font-mono">/integrations/handoff/webhook</td>
                  <td className="px-3 py-2">Current config</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-mono">PUT</td>
                  <td className="px-3 py-2 font-mono">/integrations/handoff/webhook</td>
                  <td className="px-3 py-2">Save URL / secret / active</td>
                </tr>
                <tr className="border-t">
                  <td className="px-3 py-2 font-mono">POST</td>
                  <td className="px-3 py-2 font-mono">/integrations/handoff/webhook/test</td>
                  <td className="px-3 py-2">Send test event</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-muted-foreground">
          <BookOpen className="h-4 w-4 shrink-0" />
          <p>
            Tip: start with webhook.site as Receiver URL to inspect the payload,
            then point it at your socket/TotalCtrl endpoint.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
