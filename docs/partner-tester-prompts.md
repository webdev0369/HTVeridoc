# Partner FE / BE tester prompts (copy-paste)

Use these with TotalCtrl / socket / any partner team to test HTVeriDoc integration correctly.

**Architecture (mandatory)**

```text
Partner FE  →  Partner BE only
Partner BE  →  HTVeriDoc API
HTVeriDoc   →  Partner BE webhook
```

**PDF / review editor embed**

```text
Partner FE  →  GET editor URL from Partner BE only
Partner BE  →  POST HTVeriDoc /integrations/handoff/editor-link
Partner FE  →  embed returned url in iframe (or open in panel) inside partner UI
```

- FE must **not** call HTVeriDoc or use `admin/htveridoc-tester/*` from the browser.
- FE must **not** build editor URLs itself — only use `{ url }` from **their BE**.
- Full HTTP contract: `docs/partner-api-reference.md`

---

## 1) Backend prompt (give to partner BE / Cursor)

```text
Build HTVeriDoc integration on our BACKEND only (server-to-server).

## Goal
Our backend talks to HTVeriDoc for PDF parse/review handoff.
Our frontend must NEVER call HTVeriDoc directly and must NEVER use browser routes like admin/htveridoc-tester/*.

HTVeriDoc does NOT create store-orders / create-order. It parses + reviews + notifies us via webhook. We continue our own workflow after document.approved.

## Architecture
Partner FE → Our BE only
Our BE → HTVeriDoc API (login, upload, process, status, extraction, editor-link, approve)
HTVeriDoc → Our BE webhook receiver (status + extraction)

## PDF viewer / editor embed (important)
The review UI (PDF + fields) lives on HTVeriDoc at an editor URL.
Flow:
1) Our FE asks OUR BE for an editor link (never HTVeriDoc).
2) Our BE calls HTVeriDoc POST /integrations/handoff/editor-link with documentId.
3) Our BE returns { url, expiresAt } to FE (and may cache url on our Job row).
4) Our FE embeds that url in an iframe / side panel inside OUR product UI
   (or opens it in a drawer). Do not invent the URL on FE.

Optional: webhook payloads may include editorUrl — our BE may store it, but preferred
path is always: FE → our BE → HTVeriDoc editor-link → return url to FE.

## Env (server only — never expose to FE)
HTVERIDOC_API_URL=https://<htveridoc-api-host>   # e.g. http://localhost:3001 (no /api/v1 prefix)
HTVERIDOC_EMAIL=<org service user email>
HTVERIDOC_PASSWORD=<password>
HTVERIDOC_WEBHOOK_SECRET=<signing secret from HTVeriDoc Settings → Webhooks>
# Optional if multi-org login needed:
# HTVERIDOC_ORGANIZATION_ID=<uuid>
# Do NOT set a HTVeriDoc "web origin" — editor iframe URLs come from editor-link as { url }.

## A) HTVeriDoc HTTP client (internal service)

Implement a server client that:

1) POST {HTVERIDOC_API_URL}/auth/login
   Headers: Content-Type: application/json
   Body: { "email", "password", "organizationId?" }
   Response: { accessToken, refreshToken, tokenType, expiresIn, user }
   Cache accessToken in memory/redis; refresh via POST /auth/refresh when expired.

2) POST {HTVERIDOC_API_URL}/documents
   Headers: Authorization: Bearer <accessToken>
   Body: multipart/form-data
     - file: PDF
     - documentType?: PURCHASE_ORDER_CONFIRMATION (default)
   Response: { id, status: "UPLOADED", fileName, ... }

3) POST {HTVERIDOC_API_URL}/documents/:id/process
   Headers: Authorization: Bearer <accessToken>
   Body: none
   Response: { documentId, status: "PROCESSING", jobId, mode }

4) GET {HTVERIDOC_API_URL}/documents/:id
   Poll until status is READY_FOR_REVIEW / EXTRACTED / EXTRACTION_FAILED / VALIDATION_FAILED
   Response: { id, status, fileName, documentType, ... }

5) GET {HTVERIDOC_API_URL}/documents/:id/extraction
   Response: { summary, fields[], lineItems[] }

6) POST {HTVERIDOC_API_URL}/integrations/handoff/editor-link
   Headers: Authorization: Bearer <accessToken>
   Content-Type: application/json
   Body: { "documentId": "<uuid>", "expiresInSeconds": 604800 }
   Response: {
     "token": "eyJ...",
     "url": "https://<htveridoc-web>/editor/<token>",
     "documentId": "uuid",
     "expiresAt": "ISO-8601"
   }
   This url is what FE will embed. Never return HTVeriDoc accessToken — only this url.

7) POST {HTVERIDOC_API_URL}/documents/:id/approve
   Body: none
   Response: document with status APPROVED
   Side effect: HTVeriDoc POSTs webhook document.approved to our receiver

Errors are Nest-style: { statusCode, message, error }. Handle 401 (re-login), 400 (bad state), 404.

## B) Our public APIs for OUR frontend only

Do NOT proxy HTVeriDoc paths to the browser. Expose OUR domain APIs, for example:

POST   /integrations/htveridoc/jobs
       — accept PDF from FE; BE uploads+processes on HTVeriDoc;
         store Job (ourJobId, htveridocDocumentId, status)

GET    /integrations/htveridoc/jobs/:ourJobId
       — status from OUR DB (webhooks + optional poll)

GET    /integrations/htveridoc/jobs/:ourJobId/extraction
       — extraction snapshot we stored or fetched server-side

GET or POST /integrations/htveridoc/jobs/:ourJobId/editor-link
       — BE calls HTVeriDoc editor-link; return to FE:
         {
           "url": "https://<htveridoc-web>/editor/<token>",
           "expiresAt": "...",
           "documentId": "htveridoc-uuid"
         }
       — Optionally persist url on Job for reuse until near expiry, then refresh from HTVeriDoc
       — FE will iframe this url for PDF viewer / review inside our UI

POST   /integrations/htveridoc/jobs/:ourJobId/approve
       — BE calls HTVeriDoc approve

GET    /integrations/htveridoc/webhooks/recent
       — admin/tester: last N webhook deliveries

Auth these with our normal admin/internal auth.
Never return HTVeriDoc service JWT / password to FE.
Only return the short-lived editor url for embedding.

## C) Webhook receiver (inbound from HTVeriDoc)

POST /webhook/htveridoc/document-status-update   (or path we agree)

Headers from HTVeriDoc:
  Content-Type: application/json
  X-HTVeriDoc-Event: document.approved | document.extracted | ... | webhook.test
  X-HTVeriDoc-Signature: <hmac-sha256 hex of raw body using HTVERIDOC_WEBHOOK_SECRET>
  X-HTVeriDoc-Delivery: <id>

Verify signature on raw body. Respond HTTP 2xx quickly.
Idempotent on X-HTVeriDoc-Delivery.

Payload example (document.approved):
{
  "event": "document.approved",
  "occurredAt": "...",
  "organizationId": "uuid",
  "documentId": "uuid",
  "status": "APPROVED",
  "documentType": "PURCHASE_ORDER_CONFIRMATION",
  "fileName": "po.pdf",
  "editorUrl": "https://<htveridoc-web>/editor/<token>",
  "extraction": {
    "documentNumber": "...",
    "supplierName": "...",
    "currency": "...",
    "fields": { "...": "..." },
    "lineItems": [ { "articleNumber", "description", "purchaseQuantity", "purchaseUnit", "unitPrice", "amount", "lineType", ... } ]
  }
}

On each event: store raw payload + update our Job status keyed by documentId.
If payload.editorUrl present, we MAY store it, but FE should still prefer our editor-link endpoint.
On document.approved: mark ready and keep extraction for our workflow (NOT auto create-order unless product asks later).

## D) Register webhook in HTVeriDoc UI
Ask HTVeriDoc admin to set Settings → Webhooks:
  Receiver URL = https://<our-api-host>/webhook/htveridoc/document-status-update
  Signing secret = same as HTVERIDOC_WEBHOOK_SECRET
  Save → Test must return HTTP 2xx (404 means our route is missing)

## E) Acceptance tests (BE)
1) webhook.site or our receiver: HTVeriDoc Test → webhook.test received + signature ok
2) Create job via our API with a PO PDF → HTVeriDoc document created + process started
3) Poll our job until READY_FOR_REVIEW; extraction readable
4) editor-link endpoint returns https url from HTVeriDoc (not invented)
5) That url loads HTVeriDoc review (PDF + fields) — FE will embed it
6) approve → receive document.approved with lineItems
7) Confirm FE never needs HTVeriDoc credentials; FE never calls HTVeriDoc host for editor-link

Reference: HTVeriDoc docs/partner-api-reference.md and docs/partner-be-integration.md
```

---

## 2) Frontend prompt (give to partner FE / Cursor)

```text
Build a small INTERNAL HTVeriDoc integration tester UI in our frontend.

## Critical rule
FE talks ONLY to OUR backend.
Do NOT call HTVeriDoc APIs from the browser.
Do NOT create API helpers like:
  admin/htveridoc-tester/login
  admin/htveridoc-tester/documents/upload
  admin/htveridoc-tester/documents/:id/process
  admin/htveridoc-tester/documents/:id/editor-link
  ...
Those are wrong. Credentials/JWT must stay on the server.

## Architecture
FE → Our BE (/integrations/htveridoc/...)
Our BE → HTVeriDoc
HTVeriDoc webhooks → Our BE → our DB
FE reads status/extraction/editor url from our BE only

## PDF viewer / editor embed (required)
Do NOT download PDF yourself for the HTVeriDoc review experience.
Do NOT construct HTVeriDoc /editor/... URLs on the FE.

Embed flow:
1) When job is READY_FOR_REVIEW (or user clicks "Open review"),
   call OUR BE: GET or POST /integrations/htveridoc/jobs/:ourJobId/editor-link
2) Response: { url, expiresAt }
3) Inside OUR page, show an embedded viewer:
   - Preferred: <iframe src={url} title="HTVeriDoc review" className="w-full h-[80vh] border" />
   - Or a split layout: left = iframe (PDF+editor), right = our job status / actions
4) url comes ONLY from our BE (BE fetched it from HTVeriDoc).
5) If iframe fails / user prefers, secondary button "Open in new tab" with same url.

Never put HTVeriDoc API base URL or service password in FE env.
The iframe will load HTVeriDoc web origin — that is expected for embed —
but all control-plane calls (upload, status, editor-link, approve) stay on OUR API.

## Page
Route e.g. /admin/htveridoc-integration (admin/internal only)

UI steps:
1) Upload PDF → POST /integrations/htveridoc/jobs
   Show ourJobId + initial status
2) Auto-poll GET /integrations/htveridoc/jobs/:ourJobId every 2–3s
   until READY_FOR_REVIEW / APPROVED / FAILED
3) When READY_FOR_REVIEW:
   - Fetch editor link from OUR BE
   - Embed iframe with returned url (PDF viewer + HTVeriDoc editor inside our UI)
4) Optional: "Show extraction JSON" → GET .../extraction (read-only table)
5) "Approve" → POST /integrations/htveridoc/jobs/:ourJobId/approve
   (approve goes to OUR BE → HTVeriDoc; after that webhook updates status)
6) Panel "Recent webhooks" → GET /integrations/htveridoc/webhooks/recent

## API client (FE) — OUR paths only
export const htveridocJobs = {
  create: () => `/integrations/htveridoc/jobs`,
  get: (ourJobId) => `/integrations/htveridoc/jobs/${ourJobId}`,
  extraction: (ourJobId) => `/integrations/htveridoc/jobs/${ourJobId}/extraction`,
  editorLink: (ourJobId) => `/integrations/htveridoc/jobs/${ourJobId}/editor-link`,
  approve: (ourJobId) => `/integrations/htveridoc/jobs/${ourJobId}/approve`,
  webhooksRecent: () => `/integrations/htveridoc/webhooks/recent`,
};

## Example embed snippet
async function openEmbeddedEditor(ourJobId) {
  const res = await api.get(htveridocJobs.editorLink(ourJobId));
  // res.url from OUR BE only
  setEditorUrl(res.url);
}
// render:
// {editorUrl && (
//   <iframe src={editorUrl} title="HTVeriDoc PDF review" className="h-[80vh] w-full rounded border" />
// )}

## UX notes
- Loading / error states while fetching editor link from our BE
- Disable Approve until READY_FOR_REVIEW / IN_REVIEW
- Label: integration sandbox — not production create-order
- Sandbox layout suggestion: top actions + bottom full-width iframe

## Editor link expiry (required — prevent "Session expired" in iframe)
Editor URLs expire (JWT). Partner FE must refresh before expiry:

1) Store `expiresAt` from OUR BE editor-link response.
2) ~5–15 minutes before `expiresAt`, call OUR BE again for a fresh editor-link
   (OUR BE → HTVeriDoc `POST /integrations/handoff/editor-link`).
3) Set iframe `src` to the new `url` (seamless re-fetch; do not wait for 401).
4) If the iframe already shows HTVeriDoc "Session expired", prompt the user to
   reopen review (or auto re-fetch once and reload the iframe).

```text
// Partner FE (talks ONLY to partner BE)
async function refreshEditorBeforeExpiry(ourJobId, expiresAt, setIframeSrc) {
  const msLeft = new Date(expiresAt).getTime() - Date.now();
  const refreshIn = Math.max(msLeft - 10 * 60_000, 30_000); // ~10 min early
  setTimeout(async () => {
    const res = await api.get(`/integrations/htveridoc/jobs/${ourJobId}/editor-link`);
    setIframeSrc(res.url); // new url + new expiresAt — schedule again
    refreshEditorBeforeExpiry(ourJobId, res.expiresAt, setIframeSrc);
  }, refreshIn);
}
```

## Acceptance (FE + BE together)
1) Upload PDF from tester → job created
2) Status progresses without FE calling HTVeriDoc API
3) Editor iframe loads inside OUR UI using url from OUR BE only
4) PDF is visible in the embedded HTVeriDoc editor
5) Approve → webhooks panel shows document.approved with line items
6) Network tab for XHR/fetch: only OUR API host for job/editor-link/approve
   (iframe navigation to HTVeriDoc web is OK for embed)
```

---

## Quick checklist for both teams

| Step | Who | Pass criteria |
|------|-----|----------------|
| Webhook Test from HTVeriDoc UI | BE + HTVeriDoc admin | HTTP 2xx, `webhook.test` stored |
| Upload via FE tester | FE → BE → HTVeriDoc | Job + HTVeriDoc document id |
| Extract | BE | Status → READY_FOR_REVIEW |
| Editor embed | FE asks BE for url → iframe | PDF/review visible **inside partner UI** |
| Editor url source | FE | url only from partner BE (BE got it from HTVeriDoc) |
| Approve | FE → BE → HTVeriDoc | `document.approved` webhook with `lineItems` |
| Network (XHR) | FE | No HTVeriDoc API / no `htveridoc-tester` |
