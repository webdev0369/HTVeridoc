# HTVeriDoc ↔ Other system — Finalize (FE / BE / HTVeriDoc)

**Status:** Architecture locked. TotalCtrl Nest Partner BE APIs implemented.  
**FE rewrite:** blocked until webhook Test = 2xx + create-job smoke pass.

---

## 1. Architecture (final)

```text
Other system FE  →  Other system BE only
Other system BE  →  HTVeriDoc API (server-to-server)
HTVeriDoc        →  Other system BE webhook
```

```text
Editor (PDF + review):
FE → BE editor-link → BE → HTVeriDoc editor-link → BE returns { url } → FE <iframe src={url} />
```

| Layer | Does | Does not |
|-------|------|----------|
| **Other FE** | Call Partner BE APIs; iframe embed `Data.url`; show job status | Call HTVeriDoc; use `admin/htveridoc-tester/*`; `window.open` for editor; invent editor URL |
| **Other BE** | Login/upload/process/approve on HTVeriDoc; return `{ url }` to FE; receive webhooks | Expose HTVeriDoc password/JWT to FE |
| **HTVeriDoc** | Parse PDF, review UI, editor links, webhooks | Create store-orders / create-order |

---

## 2. What HTVeriDoc provides

### A) APIs (called only by other system BE)

| Step | Method | Path |
|------|--------|------|
| Login | `POST` | `/auth/login` |
| Upload PDF | `POST` | `/documents` (multipart `file`) |
| Extract | `POST` | `/documents/:id/process` |
| Status | `GET` | `/documents/:id` |
| Extraction | `GET` | `/documents/:id/extraction` |
| Editor link | `POST` | `/integrations/handoff/editor-link` |
| Approve | `POST` | `/documents/:id/approve` |

Auth: `Authorization: Bearer <accessToken>`  
Base URL example: `http://localhost:3001` (no `/api/v1`)

Full headers/body/response: `docs/partner-api-reference.md`

### B) Editor URL response (HTVeriDoc → Partner BE)

```json
{
  "token": "eyJ...",
  "url": "https://<htveridoc-web>/editor/<token>",
  "documentId": "uuid",
  "expiresAt": "ISO-8601"
}
```

### C) Webhooks (HTVeriDoc → Partner BE)

Receiver (TotalCtrl):  
`POST /webhook/htveridoc/document-status-update`

Headers: `X-HTVeriDoc-Event`, `X-HTVeriDoc-Signature`, `X-HTVeriDoc-Delivery`  
Main event: `document.approved` (+ `extraction.fields`, `extraction.lineItems`)

### D) In-app for orgs

- **Configuration → API credentials** — org ID, API base URL, login example, generate/rotate webhook signing secret (shown once), copy `.env` template for partner BE (no web origin — editor URLs come from editor-link `{ url }`)  
- **Configuration → Webhooks** — receiver URL + Test  
- **Guides → Integration guide** — Backend integration + API reference

---

## 3. Other system BE — what to do

### Env (server only)

```text
HTVERIDOC_API_URL=http://localhost:3001
HTVERIDOC_EMAIL=<htveridoc-user>
HTVERIDOC_PASSWORD=<password>
HTVERIDOC_WEBHOOK_SECRET=<same as HTVeriDoc Webhooks settings>
```

### Public APIs for their FE (final TotalCtrl routes)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/integrations/htveridoc/jobs` | Upload PDF → BE calls HTVeriDoc |
| `GET` | `/integrations/htveridoc/jobs/:ourJobId` | Job status |
| `GET` | `/integrations/htveridoc/jobs/:ourJobId/extraction` | Extracted data |
| `GET` or `POST` | `/integrations/htveridoc/jobs/:ourJobId/editor-link` | Returns `{ url }` for iframe |
| `POST` | `/integrations/htveridoc/jobs/:ourJobId/approve` | Approve on HTVeriDoc |
| `GET` | `/integrations/htveridoc/webhooks/recent` | Debug webhook deliveries |
| `POST` | `/webhook/htveridoc/document-status-update` | Inbound from HTVeriDoc (public, HMAC) |

Auth for jobs APIs: `Authorization: Bearer <TotalCtrl JWT>`  
Webhook: no JWT; verify HMAC with `HTVERIDOC_WEBHOOK_SECRET`

### editor-link response to FE

```json
{
  "url": "https://…/editor/…",
  "expiresAt": "…",
  "documentId": "…"
}
```

(FE may read `Data.url` if TotalCtrl wraps responses.)

### BE sequence

1. Login HTVeriDoc → cache token  
2. Upload + process  
3. Poll status / store from webhooks  
4. On editor-link request → HTVeriDoc editor-link → return `url` to FE  
5. On approve → HTVeriDoc approve → receive `document.approved`

---

## 4. Other system FE — what to do

### Rules

- Call **only** Partner BE routes above  
- **No** `admin/htveridoc-tester/*`  
- **No** direct HTVeriDoc API calls  
- Editor = `<iframe src={url} />` only (`url` from BE)  
- **No** `window.open` for editor  
- **No** inventing `/editor/...` URLs

### FE flow

1. Upload → `POST /integrations/htveridoc/jobs`  
2. Poll → `GET /integrations/htveridoc/jobs/:ourJobId`  
3. Optional extraction table → `GET .../extraction`  
4. Open review → `GET|POST .../editor-link` → iframe `src={Data.url}`  
5. Approve → `POST .../approve`  
6. Debug → `GET .../webhooks/recent`

### FE API helpers (Partner BE only)

```ts
export const htveridocJobs = {
  create: () => `/integrations/htveridoc/jobs`,
  get: (id) => `/integrations/htveridoc/jobs/${id}`,
  extraction: (id) => `/integrations/htveridoc/jobs/${id}/extraction`,
  editorLink: (id) => `/integrations/htveridoc/jobs/${id}/editor-link`,
  approve: (id) => `/integrations/htveridoc/jobs/${id}/approve`,
  webhooksRecent: () => `/integrations/htveridoc/webhooks/recent`,
};
```

### Embed

```tsx
const res = await api.get(htveridocJobs.editorLink(ourJobId));
// url from Partner BE only
<iframe src={res.url /* or res.Data.url */} title="HTVeriDoc review" />
```

---

## 5. How we test (order)

| # | Who | Action | Pass |
|---|-----|--------|------|
| 1 | HTVeriDoc | Share API URL + email/password + webhook secret | BE has env |
| 2 | Other BE | Put env, restart Nest (:2053 local) | Ready |
| 3 | HTVeriDoc | Webhooks → `http://localhost:2053/webhook/htveridoc/document-status-update` → Test | HTTP **2xx** |
| 4 | Other BE | Smoke `POST /integrations/htveridoc/jobs` + poll + editor-link + approve | Full pass |
| 5 | HTVeriDoc | Unblock FE with option **1** + routes above | FE can rewrite |

**FE stays blocked until step 3 + 4 pass.**

---

## 6. Related docs

- API contract: `docs/partner-api-reference.md`  
- Architecture: `docs/partner-be-integration.md`  
- Copy-paste prompts: `docs/partner-tester-prompts.md`  
- In-app: Guides → Integration guide  
