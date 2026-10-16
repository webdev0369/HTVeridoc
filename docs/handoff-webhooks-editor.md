# Handoff: webhooks & editor links (integrate other systems)

HTVeriDoc = **parse + review + notify**.  
Other systems (TotalCtrl / socket / partners) listen to events and continue their own workflow.

**Architecture:** Partner **backend** calls HTVeriDoc and receives webhooks. Partner **frontend** must not call HTVeriDoc directly (no browser `htveridoc-tester` paths). See `docs/partner-be-integration.md`.

Similar to Rossum: Rossum sends **document status changed** to your URL; HTVeriDoc does the same.

---

## Events (how we define them)

| HTVeriDoc event | Document status | When it fires |
|-----------------|-----------------|---------------|
| `document.extracted` | `EXTRACTED` | Gemini extraction finished |
| `document.validating` | `VALIDATING` | Validation running (in validate) |
| `document.ready_for_review` | `READY_FOR_REVIEW` | Validation done; ready for human review |
| `document.in_review` | `IN_REVIEW` | Review started or reopened (in review) |
| `document.approved` | `APPROVED` | User confirmed data is correct (**main handoff**) |
| `document.rejected` | `REJECTED` | User rejected |
| `document.extraction_failed` | `EXTRACTION_FAILED` | Extraction error |
| `document.validation_failed` | `VALIDATION_FAILED` | Hard validation failure |
| `webhook.test` | — | Manual **Test** from Settings → Webhooks |

Events are mapped from document status in `handoff-dispatch.service.ts`.  
Each delivery is `POST` JSON to your **Receiver URL**.

### Rossum vs HTVeriDoc

| Rossum | HTVeriDoc |
|--------|-----------|
| Extension: Document status – Changed | Webhooks settings (per org) |
| URL e.g. `…/rossum/document-status-update` | Your URL e.g. `…/webhook/htveridoc/document-status-update` |
| Shared secret | Signing secret → `X-HTVeriDoc-Signature` |
| Status update only (often) | Status **+ extraction payload + editorUrl** |

---

## Configure (HTVeriDoc UI)

1. **Settings → Webhooks**
2. Receiver URL = your socket/TotalCtrl endpoint  
3. Signing secret (optional; auto-created if blank)  
4. Webhook active → **Save** → **Test**

In-app guide: `/settings/integrations/webhooks/guide`

---

## Delivery contract

- Method: `POST`
- Headers:
  - `Content-Type: application/json`
  - `X-HTVeriDoc-Event: document.approved` (etc.)
  - `X-HTVeriDoc-Signature: <hmac-sha256 hex of raw body>` (if secret set)
  - `X-HTVeriDoc-Delivery: <id>`

### Payload example (`document.approved`)

```json
{
  "event": "document.approved",
  "occurredAt": "2026-10-13T06:00:00.000Z",
  "organizationId": "uuid",
  "documentId": "uuid",
  "status": "APPROVED",
  "documentType": "PURCHASE_ORDER_CONFIRMATION",
  "fileName": "po.pdf",
  "editorUrl": "https://your-htveridoc-host/editor/<token>",
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
}
```

On `document.approved`, your system should:
1. Update your document/order status  
2. Use `extraction` (header + lines) for the next step in **your** app  
3. Optionally open `editorUrl` if a human still needs HTVeriDoc review  

---

## How other systems integrate (end-to-end)

```text
Other system / user
    → Upload PDF to HTVeriDoc (UI or API)
    → HTVeriDoc extracts (Gemini)
    → optional: open editorUrl to review
    → Approve in HTVeriDoc
    → Webhook POST to your receiver
    → Your system updates status / continues workflow
```

### APIs other systems use (JWT auth)

| Step | Method | Path |
|------|--------|------|
| Login | `POST` | `/auth/login` → access token |
| Upload PDF | `POST` | `/documents` multipart `file` |
| Start extract | `POST` | `/documents/:id/process` |
| Get extraction | `GET` | `/documents/:id/extraction` |
| Create editor link | `POST` | `/integrations/handoff/editor-link` `{ "documentId" }` |
| Approve | `POST` | `/documents/:id/approve` |

Auth: `Authorization: Bearer <accessToken>`  
Org context comes from the logged-in user token.

---

## Test plan (step by step)

### A. Test webhook connectivity only
1. Open [https://webhook.site](https://webhook.site) → copy unique URL  
2. HTVeriDoc → Settings → Webhooks → paste URL → Save → **Test**  
3. On webhook.site you should see `webhook.test`  
4. If Test fails with **404**, your TotalCtrl/socket path does not exist yet — fix URL on their side first  

### B. Test full parse → notify flow
1. Keep webhook.site (or your real receiver) as Receiver URL  
2. Documents → Upload a PO PDF  
3. Extract → wait until ready for review  
4. Review if needed → **Approve**  
5. Receiver should get events such as:
   - `document.extracted`
   - `document.ready_for_review`
   - `document.approved` (with full `extraction`)  
6. Confirm `extraction.lineItems` and header fields look correct  

### C. Test editor link
1. On a document → **Copy editor link**  
2. Open in private window → review UI loads  
3. Or use `editorUrl` from the webhook payload  

### D. Plug into TotalCtrl/socket
1. Socket team adds (or confirms) endpoint, e.g.  
   `https://<their-host>/webhook/htveridoc/document-status-update`  
2. They accept HTVeriDoc JSON (or map our payload → their status model)  
3. Put that URL in Settings → Webhooks → Save → Test (must be **2xx**, not 404)  
4. Repeat flow **B** against the real endpoint  
5. Confirm status updates in their UI / socket  

---

## Admin webhook API

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/integrations/handoff/webhook` | Current config |
| `PUT` | `/integrations/handoff/webhook` | Save URL / secret / active |
| `POST` | `/integrations/handoff/webhook/test` | Send `webhook.test` |
| `DELETE` | `/integrations/handoff/webhook` | Disable |

## Editor link API

`POST /integrations/handoff/editor-link`  
Body: `{ "documentId": "uuid", "expiresInSeconds": 604800 }`  
Response: `{ token, url, documentId, expiresAt }`

**Partner FE expiry:** store `expiresAt`, re-fetch editor-link via partner BE ~5–15 minutes before expiry, and set iframe `src` to the new `url`. See `docs/partner-tester-prompts.md` (Editor link expiry snippet).
