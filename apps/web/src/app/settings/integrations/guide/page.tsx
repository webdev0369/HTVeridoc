'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { BookOpen, Cable, ExternalLink } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/auth-context';

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="space-y-2 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

function Code({ children }: { children: string }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 text-xs text-foreground">
      {children}
    </code>
  );
}

function Endpoint({
  method,
  path,
  summary,
  headers,
  body,
  response,
}: {
  method: string;
  path: string;
  summary: string;
  headers?: string;
  body?: string;
  response: string;
}) {
  const methodColor =
    method === 'GET'
      ? 'bg-emerald-100 text-emerald-800'
      : method === 'POST'
        ? 'bg-blue-100 text-blue-800'
        : 'bg-amber-100 text-amber-900';

  return (
    <article className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-[11px] font-bold tracking-wide ${methodColor}`}
        >
          {method}
        </span>
        <code className="text-sm font-semibold text-foreground">{path}</code>
      </div>
      <p className="text-sm text-muted-foreground">{summary}</p>
      {headers ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
            Headers
          </p>
          <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-[11px] leading-relaxed text-foreground">
            {headers}
          </pre>
        </div>
      ) : null}
      {body ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
            Request body
          </p>
          <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-[11px] leading-relaxed text-foreground">
            {body}
          </pre>
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
          Response
        </p>
        <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-[11px] leading-relaxed text-foreground">
          {response}
        </pre>
      </div>
    </article>
  );
}

export default function IntegrationGuidePage() {
  const { user } = useAuth();
  const canRead = Boolean(
    user?.permissions?.includes('integration.read') ||
      user?.permissions?.includes('integration.manage') ||
      user?.permissions?.includes('document.read'),
  );

  if (!canRead) {
    return (
      <AppShell>
        <PageHeader
          title="Integration guide"
          description="You do not have permission to view this page."
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Integration guide"
        description="Everything your organization needs: parse PDFs, review data, configure fields, and connect other systems."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/integrations/webhooks">
              <Cable className="h-4 w-4" />
              Open Webhooks settings
            </Link>
          </Button>
        }
      />

      <div className="px-4 pb-12 md:px-6">
        <Tabs
          defaultValue="start"
          orientation="vertical"
          className="flex flex-col gap-6 lg:flex-row lg:items-start"
        >
          <TabsList className="h-auto w-full shrink-0 flex-col items-stretch justify-start gap-1 overflow-visible p-1.5 lg:sticky lg:top-4 lg:w-56">
            <TabsTrigger value="start" className="w-full justify-start px-3 py-2">
              Getting started
            </TabsTrigger>
            <TabsTrigger value="parse" className="w-full justify-start px-3 py-2">
              Parse documents
            </TabsTrigger>
            <TabsTrigger
              value="fields"
              className="w-full justify-start px-3 py-2"
            >
              Fields & columns
            </TabsTrigger>
            <TabsTrigger
              value="webhooks"
              className="w-full justify-start px-3 py-2"
            >
              Notify your system
            </TabsTrigger>
            <TabsTrigger value="api" className="w-full justify-start px-3 py-2">
              Backend integration
            </TabsTrigger>
            <TabsTrigger
              value="reference"
              className="w-full justify-start px-3 py-2"
            >
              API reference
            </TabsTrigger>
            <TabsTrigger value="test" className="w-full justify-start px-3 py-2">
              Test & FAQ
            </TabsTrigger>
          </TabsList>

          <div className="min-w-0 flex-1 lg:max-w-3xl">
          <TabsContent value="start" className="mt-0">
            <Card>
              <CardContent className="space-y-6 pt-6">
                <Section title="What HTVeriDoc is">
                  <p>
                    HTVeriDoc is a SaaS product for{' '}
                    <strong className="text-foreground">
                      PDF parsing and review
                    </strong>{' '}
                    (purchase order confirmations / invoices). Your organization
                    uploads documents; AI extracts data; people review; then you
                    approve.
                  </p>
                  <p>
                    After approve, HTVeriDoc{' '}
                    <strong className="text-foreground">
                      notifies your other systems
                    </strong>{' '}
                    with status and extracted data. Those systems continue their
                    own workflow.
                  </p>
                </Section>

                <Section title="End-to-end flow">
                  <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-4 text-xs text-foreground">
{`Upload PDF → Extract (AI) → Review → Approve
                                      ↓
                         Webhook to your system
                         (status + extraction + editor link)`}
                  </pre>
                  <p>
                    <strong className="text-foreground">Approve → webhooks only.</strong>{' '}
                    HTVeriDoc does not create store-orders. Legacy export
                    destination UI is deferred and not part of this product path.
                  </p>
                </Section>

                <Section title="Pick a section">
                  <ul className="list-disc space-y-1 pl-5">
                    <li>
                      <Link
                        href="/settings/integrations/credentials"
                        className="font-medium text-primary underline-offset-2 hover:underline"
                      >
                        API credentials
                      </Link>{' '}
                      — API URL, org ID, generate webhook signing secret for
                      partner BE
                    </li>
                    <li>
                      <strong className="text-foreground">Parse documents</strong>{' '}
                      — day-to-day upload, extract, review, approve
                    </li>
                    <li>
                      <strong className="text-foreground">
                        Fields & columns
                      </strong>{' '}
                      — what data your org shows and edits
                    </li>
                    <li>
                      <strong className="text-foreground">
                        Notify your system
                      </strong>{' '}
                      — webhooks when status changes
                    </li>
                    <li>
                      <strong className="text-foreground">
                        Backend integration
                      </strong>{' '}
                      — your system&apos;s BE talks to HTVeriDoc (not the FE)
                    </li>
                    <li>
                      <strong className="text-foreground">API reference</strong>{' '}
                      — methods, headers, bodies, and responses
                    </li>
                    <li>
                      <strong className="text-foreground">Test & FAQ</strong> —
                      verify connectivity and common issues
                    </li>
                  </ul>
                </Section>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="parse" className="mt-0">
            <Card>
              <CardContent className="space-y-6 pt-6">
                <Section title="Daily parsing workflow">
                  <ol className="list-decimal space-y-2 pl-5">
                    <li>
                      Go to <strong className="text-foreground">Documents</strong>{' '}
                      and upload a PDF
                    </li>
                    <li>
                      Open the document → click{' '}
                      <strong className="text-foreground">Extract</strong>
                    </li>
                    <li>
                      Review header fields and line items; fix anything wrong
                    </li>
                    <li>
                      Click <strong className="text-foreground">Approve</strong>{' '}
                      when the data matches the PDF
                    </li>
                  </ol>
                </Section>

                <Section title="Tips while reviewing">
                  <ul className="list-disc space-y-1 pl-5">
                    <li>
                      Use the PDF viewer on the left to confirm quantities,
                      units, and prices
                    </li>
                    <li>
                      Edit a cell directly in the line-items table if AI missed
                      something
                    </li>
                    <li>
                      <strong className="text-foreground">
                        Copy editor link
                      </strong>{' '}
                      shares a secure review screen (no full login required for
                      the recipient)
                    </li>
                    <li>
                      Approve only when you trust the data — that is the main
                      handoff signal to your other system
                    </li>
                  </ul>
                </Section>

                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link href="/documents">Go to Documents</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/settings/fields">Field Manager</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fields" className="mt-0">
            <Card>
              <CardContent className="space-y-6 pt-6">
                <Section title="Field Manager">
                  <p>
                    Each organization chooses which header fields and line-item
                    columns appear during review. That keeps the UI focused on
                    what your team (and downstream system) actually needs.
                  </p>
                  <ol className="list-decimal space-y-2 pl-5">
                    <li>
                      Open{' '}
                      <Link
                        href="/settings/fields"
                        className="font-medium text-primary underline-offset-2 hover:underline"
                      >
                        Settings → Field Manager
                      </Link>
                    </li>
                    <li>Enable or disable header fields</li>
                    <li>
                      Choose line-item columns (SKU, qty, units, prices, etc.)
                    </li>
                    <li>Save — new extractions and the review table follow this</li>
                  </ol>
                </Section>

                <Section title="Who can change this">
                  <p>
                    Users with field-management permission (typically admins).
                    Day-to-day reviewers only edit values on documents; they do
                    not change the column layout.
                  </p>
                </Section>

                <Section title="Users & roles">
                  <p>
                    Invite teammates under{' '}
                    <Link
                      href="/settings/users"
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Administration → Users & Roles
                    </Link>
                    . Give reviewers document access; give admins integration /
                    field permissions if they configure webhooks or Field Manager.
                  </p>
                </Section>

                <Button asChild size="sm">
                  <Link href="/settings/fields">Open Field Manager</Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="webhooks" className="mt-0">
            <Card>
              <CardContent className="space-y-6 pt-6">
                <Section title="What webhooks do">
                  <p>
                    When document status changes, HTVeriDoc{' '}
                    <Code>POST</Code>s JSON to your Receiver URL. Your ERP,
                    TotalCtrl, socket, or custom app updates its own status and
                    uses the extraction payload — same idea as Rossum-style
                    status webhooks.
                  </p>
                </Section>

                <Section title="Setup (once per organization)">
                  <ol className="list-decimal space-y-1 pl-5">
                    <li>Settings → Webhooks</li>
                    <li>
                      Receiver URL example:{' '}
                      <Code>
                        https://api.example.com/webhook/htveridoc/document-status-update
                      </Code>
                    </li>
                    <li>Optional signing secret → Save → Test</li>
                  </ol>
                </Section>

                <Section title="Events">
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 font-medium">Event</th>
                          <th className="px-3 py-2 font-medium">When</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t">
                          <td className="px-3 py-2 font-mono">
                            document.extracted
                          </td>
                          <td className="px-3 py-2">Parsing finished</td>
                        </tr>
                        <tr className="border-t">
                          <td className="px-3 py-2 font-mono">
                            document.ready_for_review
                          </td>
                          <td className="px-3 py-2">Ready for review</td>
                        </tr>
                        <tr className="border-t">
                          <td className="px-3 py-2 font-mono">
                            document.approved
                          </td>
                          <td className="px-3 py-2">
                            Main handoff (full extraction)
                          </td>
                        </tr>
                        <tr className="border-t">
                          <td className="px-3 py-2 font-mono">
                            document.rejected
                          </td>
                          <td className="px-3 py-2">Rejected</td>
                        </tr>
                        <tr className="border-t">
                          <td className="px-3 py-2 font-mono">webhook.test</td>
                          <td className="px-3 py-2">Manual Test button</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Section>

                <Section title="Headers">
                  <ul className="list-disc space-y-1 pl-5">
                    <li>
                      <Code>X-HTVeriDoc-Event</Code>
                    </li>
                    <li>
                      <Code>X-HTVeriDoc-Signature</Code> — HMAC-SHA256 of raw
                      body
                    </li>
                    <li>
                      <Code>X-HTVeriDoc-Delivery</Code>
                    </li>
                  </ul>
                </Section>

                <Button asChild size="sm">
                  <Link href="/settings/integrations/webhooks">
                    Configure Webhooks
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="api" className="mt-0">
            <Card>
              <CardContent className="space-y-6 pt-6">
                <Section title="Correct architecture (BE ↔ HTVeriDoc)">
                  <p>
                    Your product&apos;s{' '}
                    <strong className="text-foreground">backend</strong> must
                    call HTVeriDoc and receive webhooks. The partner frontend
                    should only talk to{' '}
                    <strong className="text-foreground">its own API</strong> —
                    never to HTVeriDoc login/upload/process URLs, and never via
                    FE-only paths like{' '}
                    <Code>admin/htveridoc-tester/...</Code>.
                  </p>
                  <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-4 text-xs text-foreground">
{`Partner FE  →  Partner BE  →  HTVeriDoc API
                     ↑
              HTVeriDoc webhooks (status + extraction)`}
                  </pre>
                </Section>

                <Section title="What your backend implements">
                  <ol className="list-decimal space-y-2 pl-5">
                    <li>
                      Store HTVeriDoc base URL + service credentials (server
                      env only)
                    </li>
                    <li>
                      Login — <Code>POST /auth/login</Code> → keep access token
                      on the server
                    </li>
                    <li>
                      Upload PDF — <Code>POST /documents</Code> (multipart{' '}
                      <Code>file</Code>)
                    </li>
                    <li>
                      Extract — <Code>POST /documents/:id/process</Code>
                    </li>
                    <li>
                      Poll — <Code>GET /documents/:id</Code> and{' '}
                      <Code>GET /documents/:id/extraction</Code>
                    </li>
                    <li>
                      Optional editor link —{' '}
                      <Code>POST /integrations/handoff/editor-link</Code> →
                      return URL to your FE if a human should review
                    </li>
                    <li>
                      Approve — <Code>POST /documents/:id/approve</Code> (or
                      approve in HTVeriDoc UI)
                    </li>
                    <li>
                      Expose a webhook receiver URL for HTVeriDoc to{' '}
                      <Code>POST</Code> status events
                    </li>
                  </ol>
                  <p>
                    Auth header from your BE:{' '}
                    <Code>Authorization: Bearer &lt;accessToken&gt;</Code>
                  </p>
                </Section>

                <Section title="What the partner FE should do">
                  <ul className="list-disc space-y-1 pl-5">
                    <li>
                      Call only your own backend (upload job, status, editor
                      link, approve)
                    </li>
                    <li>
                      Ask{' '}
                      <strong className="text-foreground">your BE</strong> for
                      the editor URL — BE gets it from HTVeriDoc{' '}
                      <Code>POST /integrations/handoff/editor-link</Code>
                    </li>
                    <li>
                      Embed that URL in an{' '}
                      <strong className="text-foreground">iframe</strong>{' '}
                      inside your product (PDF + review UI). Do not invent the
                      URL on the FE
                    </li>
                    <li>
                      Show status from{' '}
                      <strong className="text-foreground">your</strong>{' '}
                      database after your BE handles HTVeriDoc webhooks
                    </li>
                    <li>
                      Do <strong className="text-foreground">not</strong>{' '}
                      put HTVeriDoc passwords or service JWTs in the browser
                    </li>
                  </ul>
                  <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-4 text-xs text-foreground">
{`FE → Partner BE  GET/POST .../jobs/:id/editor-link
BE → HTVeriDoc   POST /integrations/handoff/editor-link
BE → FE          { url, expiresAt }
FE → iframe      src={url}   // PDF viewer + editor inside partner UI`}
                  </pre>
                </Section>

                <Section title="On document.approved (your BE)">
                  <p>
                    Use <Code>extraction.documentNumber</Code>,{' '}
                    <Code>supplierName</Code>, <Code>fields</Code>, and{' '}
                    <Code>lineItems</Code>. Optionally open{' '}
                    <Code>editorUrl</Code> for human review in the browser.
                  </p>
                </Section>

                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <BookOpen className="h-3.5 w-3.5" />
                  Full HTTP contract:{' '}
                  <Code>docs/partner-api-reference.md</Code> — also open the{' '}
                  <strong className="text-foreground">API reference</strong>{' '}
                  tab.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reference" className="mt-0">
            <Card>
              <CardContent className="space-y-6 pt-6">
                <Section title="Partner API contract">
                  <p>
                    Call these from your{' '}
                    <strong className="text-foreground">backend only</strong>.
                    Base URL example: <Code>https://&lt;htveridoc-api&gt;</Code>{' '}
                    (no <Code>/api/v1</Code> prefix). After login, send{' '}
                    <Code>Authorization: Bearer &lt;accessToken&gt;</Code> on
                    every request.
                  </p>
                </Section>

                <Endpoint
                  method="POST"
                  path="/auth/login"
                  summary="Exchange service-user credentials for JWT tokens."
                  headers={`Content-Type: application/json
Accept: application/json`}
                  body={`{
  "email": "integration@example.com",
  "password": "********",
  "organizationId": "optional-uuid"
}`}
                  response={`{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "tokenType": "Bearer",
  "expiresIn": "15m",
  "user": {
    "userId": "uuid",
    "organizationId": "uuid",
    "role": "ADMIN",
    "permissions": ["document.read", "document.create", "..."]
  }
}`}
                />

                <Endpoint
                  method="POST"
                  path="/documents"
                  summary="Upload a PDF (multipart). Default type is PURCHASE_ORDER_CONFIRMATION."
                  headers={`Authorization: Bearer <accessToken>
Content-Type: multipart/form-data`}
                  body={`file=<PDF binary>
documentType=PURCHASE_ORDER_CONFIRMATION   (optional)`}
                  response={`{
  "id": "uuid",
  "fileName": "po.pdf",
  "status": "UPLOADED",
  "documentType": "PURCHASE_ORDER_CONFIRMATION",
  "pageCount": 2,
  "fileSize": 184320,
  "createdAt": "2026-10-13T12:00:00.000Z"
}`}
                />

                <Endpoint
                  method="POST"
                  path="/documents/:id/process"
                  summary="Start AI extraction. Poll GET /documents/:id until status is READY_FOR_REVIEW (or failure)."
                  headers={`Authorization: Bearer <accessToken>`}
                  response={`{
  "documentId": "uuid",
  "status": "PROCESSING",
  "jobId": "123",
  "mode": "queue"
}`}
                />

                <Endpoint
                  method="GET"
                  path="/documents/:id"
                  summary="Document status and metadata."
                  headers={`Authorization: Bearer <accessToken>
Accept: application/json`}
                  response={`{
  "id": "uuid",
  "status": "READY_FOR_REVIEW",
  "fileName": "po.pdf",
  "documentType": "PURCHASE_ORDER_CONFIRMATION"
}`}
                />

                <Endpoint
                  method="GET"
                  path="/documents/:id/extraction"
                  summary="Structured header fields + line items after extraction."
                  headers={`Authorization: Bearer <accessToken>
Accept: application/json`}
                  response={`{
  "summary": {
    "documentNumber": "211851250",
    "supplier": "Seller AS",
    "currency": "NOK",
    "lineItemCount": 12
  },
  "fields": [{ "fieldKey": "documentNumber", "currentValue": "211851250" }],
  "lineItems": [{
    "articleNumber": "391119",
    "description": "Beger PP 750ml",
    "purchaseQuantity": 12,
    "purchaseUnit": "PK",
    "unitPrice": 75.49,
    "amount": 905.88,
    "lineType": "PRODUCT"
  }]
}`}
                />

                <Endpoint
                  method="POST"
                  path="/integrations/handoff/editor-link"
                  summary="Partner BE only: create editor URL, return { url } to FE, FE embeds url in iframe for PDF/review."
                  headers={`Authorization: Bearer <accessToken>
Content-Type: application/json`}
                  body={`{
  "documentId": "uuid",
  "expiresInSeconds": 604800
}`}
                  response={`{
  "token": "eyJ...",
  "url": "https://<web-host>/editor/<token>",
  "documentId": "uuid",
  "expiresAt": "2026-10-20T12:00:00.000Z"
}

// Partner FE:
// <iframe src={urlFromPartnerBE} title="HTVeriDoc review" />`}
                />

                <Endpoint
                  method="POST"
                  path="/documents/:id/approve"
                  summary="Confirm data. Fires webhook document.approved with extraction payload to your receiver."
                  headers={`Authorization: Bearer <accessToken>`}
                  response={`{
  "id": "uuid",
  "status": "APPROVED",
  "fileName": "po.pdf"
}`}
                />

                <Section title="Webhook your BE receives">
                  <p>
                    HTVeriDoc <Code>POST</Code>s JSON to your Receiver URL.
                  </p>
                  <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 text-[11px] leading-relaxed text-foreground">
{`Headers:
  Content-Type: application/json
  X-HTVeriDoc-Event: document.approved
  X-HTVeriDoc-Signature: <hmac-sha256-hex of raw body>
  X-HTVeriDoc-Delivery: <id>

Body (document.approved):
{
  "event": "document.approved",
  "documentId": "uuid",
  "status": "APPROVED",
  "editorUrl": "https://.../editor/<token>",
  "extraction": {
    "documentNumber": "...",
    "supplierName": "...",
    "fields": { "...": "..." },
    "lineItems": [ { "articleNumber": "...", "purchaseQuantity": "..." } ]
  }
}`}
                  </pre>
                </Section>

                <p className="text-xs text-muted-foreground">
                  Full tables, error codes, and signature verify example:{' '}
                  <Code>docs/partner-api-reference.md</Code>
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="test" className="mt-0">
            <Card>
              <CardContent className="space-y-6 pt-6">
                <Section title="Verification checklist">
                  <ol className="list-decimal space-y-3 pl-5">
                    <li>
                      <strong className="text-foreground">Webhook Test</strong>
                      <p>
                        Use a temporary catcher (e.g. webhook.site) as Receiver
                        URL → Save → Test → confirm <Code>webhook.test</Code>.
                      </p>
                    </li>
                    <li>
                      <strong className="text-foreground">
                        Full parse handoff
                      </strong>
                      <p>
                        Upload → Extract → Review → Approve → confirm{' '}
                        <Code>document.approved</Code> with line items.
                      </p>
                    </li>
                    <li>
                      <strong className="text-foreground">Editor link</strong>
                      <p>
                        On a document, Copy editor link → open in a private
                        window.
                      </p>
                    </li>
                    <li>
                      <strong className="text-foreground">
                        Your production receiver
                      </strong>
                      <p>
                        Point Webhooks to your real URL. Test must return HTTP
                        2xx (404 means the route is missing on your side).
                      </p>
                    </li>
                  </ol>
                </Section>

                <Section title="FAQ">
                  <ul className="list-disc space-y-3 pl-5">
                    <li>
                      <strong className="text-foreground">
                        Webhook Test returns 404
                      </strong>
                      <p>
                        HTVeriDoc is working. Your receiver path does not exist
                        yet — create the endpoint, then retry.
                      </p>
                    </li>
                    <li>
                      <strong className="text-foreground">
                        No event after Approve
                      </strong>
                      <p>
                        Confirm Webhooks are saved for this org and the Receiver
                        URL is reachable from the API host (not localhost unless
                        tunneling).
                      </p>
                    </li>
                    <li>
                      <strong className="text-foreground">
                        Missing columns on review
                      </strong>
                      <p>
                        Check Field Manager — disabled columns are hidden for
                        the whole organization.
                      </p>
                    </li>
                    <li>
                      <strong className="text-foreground">
                        Who uses which tab?
                      </strong>
                      <p>
                        Reviewers: Parse documents. Admins: Fields & Notify your
                        system. Partner BE team: Backend integration, API
                        reference, Test & FAQ.
                      </p>
                    </li>
                  </ul>
                </Section>

                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                  If Webhook Test fails with HTTP 404, create the receiver route
                  on your side first, then run Test again.
                </div>

                <Button asChild variant="outline" size="sm">
                  <Link href="/settings/integrations/webhooks">
                    <ExternalLink className="h-4 w-4" />
                    Open Webhooks
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
          </div>
        </Tabs>
      </div>
    </AppShell>
  );
}
