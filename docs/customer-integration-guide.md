# HTVeriDoc — Customer & organization integration guide

How to use HTVeriDoc for PDF parsing and how to connect your own system (ERP, TotalCtrl, socket, custom app).

**In-app:** Settings → **Integration guide** (tabbed)

| Tab | Audience | Purpose |
|-----|----------|---------|
| Getting started | Everyone | What the product does |
| Parse documents | Org users | Upload → extract → review → approve |
| Fields & columns | Admins | Field Manager + roles |
| Notify your system | Admins / integrators | Webhooks |
| Backend integration | Partner BE team | Server-to-server pattern (not FE) |
| API reference | Partner BE team | Methods, headers, bodies, responses |
| Test & FAQ | Everyone | Checklist + common issues |

---

## What HTVeriDoc does

HTVeriDoc is a **SaaS document parsing** product:

1. Upload a purchase order confirmation / invoice PDF  
2. AI extracts header + line items  
3. Humans review and correct if needed  
4. Approve when data is correct  
5. Your system is notified via **webhook** (status + extraction payload)

HTVeriDoc focuses on **accurate parsing and review**. Your system continues the business workflow after approve.

---

## Parse documents (no code)

| Step | Where | Action |
|------|--------|--------|
| 1 | Documents | Upload PDF |
| 2 | Document page | Extract |
| 3 | Review | Check fields & line items; edit if needed |
| 4 | Approve | Confirm data is correct |
| 5 | Settings → Webhooks | (Admin) Configure receiver URL so your other system gets events |

Optional: **Copy editor link** to share the review screen with someone else.

---

## Fields & columns

- Settings → **Field Manager** — enable header fields and line-item columns for your org  
- **Users & Roles** — invite reviewers; give admins field / integration permissions  

---

## For integrators (other systems)

**Important:** Integration is **backend ↔ HTVeriDoc**. Do not call HTVeriDoc from the partner frontend (no FE `htveridoc-tester` routes). See `docs/partner-be-integration.md`.

### High-level flow

```text
Partner FE → Partner BE → HTVeriDoc API (upload / extract / approve)
                              ↓
Partner BE ← HTVeriDoc webhook (status + extraction)
Partner FE reads status from Partner BE only
```

### 1. Configure webhook (once per org)

Settings → Webhooks:

- Receiver URL = your endpoint  
- Signing secret (optional)  
- Save → Test  

### 2. Events you will receive

| Event | Meaning |
|-------|---------|
| `document.extracted` | Parsing finished |
| `document.ready_for_review` | Ready for human review |
| `document.in_review` | Review opened |
| `document.approved` | Data confirmed — use `extraction` payload |
| `document.rejected` | Rejected |
| `document.extraction_failed` | Parse failed |
| `webhook.test` | Manual test from settings |

### 3. Webhook delivery

- `POST` JSON to your URL  
- Headers: `X-HTVeriDoc-Event`, `X-HTVeriDoc-Signature` (HMAC-SHA256), `X-HTVeriDoc-Delivery`  
- On `document.approved`, read `extraction.fields` and `extraction.lineItems`

### 4. API sequence (JWT)

1. `POST /auth/login`  
2. `POST /documents` (multipart `file`)  
3. `POST /documents/:id/process`  
4. `GET /documents/:id` / `GET /documents/:id/extraction` (poll)  
5. `POST /integrations/handoff/editor-link` (optional)  
6. `POST /documents/:id/approve`  

Auth: `Authorization: Bearer <accessToken>`

---

## Testing checklist & FAQ

1. webhook.site as Receiver URL → Test → see `webhook.test`  
2. Upload → Extract → Approve → see `document.approved`  
3. Copy editor link → open in private window  
4. Point Receiver URL at your real system → Test returns 2xx  

**404 on Test:** HTVeriDoc is fine — create the receiver route first.  
**No event after Approve:** check saved webhook URL and that the API host can reach it.  
**Missing columns:** check Field Manager for this org.

---

## Related docs

- **API reference (headers / body / response):** `docs/partner-api-reference.md`  
- BE architecture: `docs/partner-be-integration.md`  
- Webhooks detail: `docs/handoff-webhooks-editor.md`  
- In-app: Guides → Integration guide → **API reference**  

