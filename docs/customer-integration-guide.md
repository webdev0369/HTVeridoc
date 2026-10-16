# HTVeriDoc — Customer integration guide

How to connect **your product** to HTVeriDoc for PDF parse / review.

**One path (mandatory):**

```text
Your FE  →  Your BE only
Your BE  →  HTVeriDoc API   (login, upload, process, editor-link, approve)
HTVeriDoc →  Your BE webhook (status + extraction)
Your FE  ←  Your BE only    (status, iframe url — never call HTVeriDoc from the browser)
```

| Layer | Does | Does **not** |
|-------|------|----------------|
| **Your FE** | Upload/status via your API; embed editor `url` from your BE in an iframe | Call HTVeriDoc; invent `/editor/...` URLs; store HTVeriDoc passwords |
| **Your BE** | JWT login to HTVeriDoc; upload/process/approve; return `{ url, expiresAt }` to FE; verify webhooks | Expose HTVeriDoc credentials or JWT to the browser |
| **HTVeriDoc** | Parse PDF, review UI, issue editor links, POST webhooks | Create store-orders / “create-order” in your ERP |

**Approve → webhooks only.** HTVeriDoc does not push store-orders. Your system continues its own workflow after `document.approved`.

---

## What you copy from HTVeriDoc (partner BE `.env`)

In-app: **Configuration → API credentials**

| Variable | Purpose |
|----------|---------|
| `HTVERIDOC_API_URL` | Public API base (no `/api/v1`) |
| `HTVERIDOC_EMAIL` / `HTVERIDOC_PASSWORD` | Integration user (JWT login) |
| `HTVERIDOC_ORGANIZATION_ID` | Org context (optional if user has one org) |
| `HTVERIDOC_WEBHOOK_SECRET` | Verify `X-HTVeriDoc-Signature` |

**Do not** put HTVeriDoc “web origin” in partner env. Editor iframe URLs are returned ready-made by `POST /integrations/handoff/editor-link` as `{ url }`.

Also configure **Settings → Webhooks**: your receiver URL → Save → Test (HTTP 2xx).

---

## Happy path (BE)

1. `POST {HTVERIDOC_API_URL}/auth/login` → cache `accessToken` server-side  
2. `POST /documents` (multipart `file`)  
3. `POST /documents/:id/process`  
4. Poll `GET /documents/:id` (and extraction if needed)  
5. When ready for review: `POST /integrations/handoff/editor-link` → return `{ url, expiresAt }` to FE  
6. FE: `<iframe src={url} />` (refresh link ~5–15 min before `expiresAt`)  
7. `POST /documents/:id/approve` (from your BE or HTVeriDoc UI)  
8. Receive webhook `document.approved` with `extraction.fields` / `extraction.lineItems`

Auth on outbound calls: `Authorization: Bearer <accessToken>`

---

## Happy path (FE)

Call **only your** APIs, for example:

- Create job / upload  
- Poll job status  
- Get editor link → set iframe `src`  
- Approve (optional) → your BE calls HTVeriDoc  

No browser routes like `admin/htveridoc-tester/*`. No HTVeriDoc host in FE env.

---

## Webhook events (inbound to your BE)

| Event | Meaning |
|-------|---------|
| `document.extracted` | Parsing finished |
| `document.validating` | Validation running (in validate) |
| `document.ready_for_review` | Ready for human review |
| `document.in_review` | Review started / reopened (in review) |
| `document.approved` | Use `extraction` payload |
| `document.rejected` | Rejected |
| `document.extraction_failed` | Parse failed |
| `document.validation_failed` | Hard validation failure |
| `webhook.test` | Manual test from settings |

Headers: `X-HTVeriDoc-Event`, `X-HTVeriDoc-Signature` (HMAC-SHA256 of raw body), `X-HTVeriDoc-Delivery`.

---

## Org users (no code)

| Step | Where |
|------|--------|
| Upload / extract / review / approve | Documents |
| Field modes & columns | Settings → Field Manager |
| Invite reviewers / roles | Users & Roles |
| Partner connection | API credentials + Webhooks |

---

## Test checklist

1. Webhooks → Test → `webhook.test` HTTP 2xx  
2. BE: login → upload → process → status → READY_FOR_REVIEW  
3. FE: editor iframe loads from **your BE** `url` only  
4. Approve → `document.approved` with line items  
5. Browser network: no HTVeriDoc API host for control-plane calls  

---

## Related docs

| Doc | Use when |
|-----|----------|
| [`partner-be-integration.md`](./partner-be-integration.md) | Architecture + BE checklist |
| [`partner-api-reference.md`](./partner-api-reference.md) | Exact HTTP headers / bodies |
| [`partner-tester-prompts.md`](./partner-tester-prompts.md) | Copy-paste FE/BE Cursor prompts |
| [`handoff-webhooks-editor.md`](./handoff-webhooks-editor.md) | Webhook + editor link detail |
| In-app **Integration guide** | Same content for org admins |
