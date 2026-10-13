# Handoff: webhooks & editor links

HTVeriDoc is a **SaaS parsing** product. Other systems (TotalCtrl, socket, partners) **create orders themselves**.  
We notify them when parsing/review status changes and can give them a secure **editor link**.

## Webhooks

### Configure (UI)
**Settings → Webhooks** — save receiver URL + optional signing secret (auto-generated if blank).

### API
| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/integrations/handoff/webhook` | Public config (no secret value) |
| `PUT` | `/integrations/handoff/webhook` | `{ url, secret?, isActive?, clearSecret? }` |
| `POST` | `/integrations/handoff/webhook/test` | Sends `webhook.test` |
| `DELETE` | `/integrations/handoff/webhook` | Disables |

### Delivery
- Method: `POST` to your URL  
- Headers:
  - `Content-Type: application/json`
  - `X-HTVeriDoc-Event: document.approved` (etc.)
  - `X-HTVeriDoc-Signature: <hmac-sha256 hex of raw body>` (when secret set)
  - `X-HTVeriDoc-Delivery: <id>`

### Events
| Event | When |
|-------|------|
| `document.extracted` | Extraction completed |
| `document.ready_for_review` | Validation done, ready for human review |
| `document.in_review` | Review started / reopened |
| `document.approved` | User confirmed PDF data is correct |
| `document.rejected` | Rejected |
| `document.extraction_failed` | Extraction failed |
| `document.validation_failed` | Validation failed hard |

### Payload (example)

```json
{
  "event": "document.approved",
  "occurredAt": "2026-10-13T06:00:00.000Z",
  "organizationId": "uuid",
  "documentId": "uuid",
  "status": "APPROVED",
  "documentType": "PURCHASE_ORDER_CONFIRMATION",
  "fileName": "po.pdf",
  "editorUrl": "http://localhost:3000/editor/<token>",
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

On `document.approved`, use `extraction` to create the store order in **your** system.

## Editor links

### API
`POST /integrations/handoff/editor-link`  
Body: `{ "documentId": "uuid", "expiresInSeconds": 604800 }`  

Response: `{ token, url, documentId, expiresAt }`

### Usage
1. Open `url` in a browser (or iframe).  
2. The `/editor/<token>` page stores the token and loads `/documents/<id>` with that Bearer token.  
3. Token permissions: read / edit / approve / field.read (time-limited JWT).

Webhook payloads already include `editorUrl` when possible.
