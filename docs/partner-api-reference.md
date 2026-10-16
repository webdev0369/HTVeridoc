# HTVeriDoc Partner API Reference

Professional HTTP contract for **partner backends** integrating with HTVeriDoc.

> **Audience:** Partner BE / TotalCtrl / socket / ERP teams  
> **Not for browsers:** Do not call these APIs from the partner frontend.  
> **Architecture:** FE → partner BE → HTVeriDoc API; HTVeriDoc → partner BE webhooks.  
> Overview: [`customer-integration-guide.md`](./customer-integration-guide.md) · BE checklist: [`partner-be-integration.md`](./partner-be-integration.md)

---

## Base URL

| Environment | Example |
|-------------|---------|
| Local | `http://localhost:3001` |
| Production | `https://<your-htveridoc-api-host>` |

There is **no** `/api/v1` prefix. Paths below are absolute from the API root.

---

## Authentication

Most endpoints require a JWT from login.

### Headers (authenticated requests)

| Header | Required | Value |
|--------|----------|--------|
| `Authorization` | Yes | `Bearer <accessToken>` |
| `Content-Type` | Yes for JSON bodies | `application/json` |
| `Accept` | Recommended | `application/json` |

Org context comes from the JWT (`organizationId` claim). Do not send a separate org header.

### Token lifetime

| Token | Typical TTL | Use |
|-------|-------------|-----|
| `accessToken` | `15m` (configurable) | All API calls |
| `refreshToken` | `7d` | `POST /auth/refresh` only |

---

## Error responses

Standard NestJS HTTP errors:

```json
{
  "statusCode": 400,
  "message": "Cannot approve document in status UPLOADED",
  "error": "Bad Request"
}
```

| Code | Meaning |
|------|---------|
| `400` | Validation / bad state (e.g. approve too early) |
| `401` | Missing or invalid JWT |
| `403` | Missing permission or wrong organization |
| `404` | Document / extraction / route not found |
| `413` / `400` | File too large or not a PDF |

---

## 1. Login

Obtain tokens for a service / org user.

### `POST /auth/login`

**Headers**

```http
Content-Type: application/json
Accept: application/json
```

**Body**

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `email` | string | Yes | Valid email |
| `password` | string | Yes | Min 8 characters |
| `organizationId` | uuid | No | If user belongs to multiple orgs |

```json
{
  "email": "integration@example.com",
  "password": "********",
  "organizationId": "optional-uuid"
}
```

**Response `200`**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenType": "Bearer",
  "expiresIn": "15m",
  "user": {
    "userId": "uuid",
    "email": "integration@example.com",
    "name": "Integration User",
    "organizationId": "uuid",
    "role": "ADMIN",
    "permissions": ["document.read", "document.create", "document.edit", "document.approve"]
  }
}
```

---

## 2. Refresh token

### `POST /auth/refresh`

**Body**

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response `200`** — same shape as login (`accessToken`, `refreshToken`, `tokenType`, `expiresIn`, `user`).

---

## 3. Upload PDF

### `POST /documents`

**Headers**

```http
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data
```

**Body (multipart)**

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `file` | file | Yes | PDF only; max ~25–50 MB |
| `documentType` | string | No | Default `PURCHASE_ORDER_CONFIRMATION` |

Allowed `documentType` values:

- `PURCHASE_ORDER`
- `PURCHASE_ORDER_CONFIRMATION`
- `INVOICE`
- `CREDIT_NOTE`
- `DELIVERY_NOTE`

**cURL**

```bash
curl -X POST "$BASE/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./po.pdf;type=application/pdf" \
  -F "documentType=PURCHASE_ORDER_CONFIRMATION"
```

**Response `201` / `200`**

```json
{
  "id": "uuid",
  "organizationId": "uuid",
  "fileName": "po.pdf",
  "mimeType": "application/pdf",
  "fileSize": 184320,
  "sha256": "hex...",
  "pageCount": 2,
  "documentType": "PURCHASE_ORDER_CONFIRMATION",
  "status": "UPLOADED",
  "uploadedBy": "uuid",
  "createdAt": "2026-10-13T12:00:00.000Z",
  "updatedAt": "2026-10-13T12:00:00.000Z"
}
```

---

## 4. Get document (poll status)

### `GET /documents/:id`

**Headers**

```http
Authorization: Bearer <accessToken>
Accept: application/json
```

**Response `200`** — same document DTO as upload.

### Document status values

| Status | Meaning |
|--------|---------|
| `UPLOADED` | File stored |
| `PROCESSING` | Extraction running |
| `EXTRACTED` | AI finished |
| `READY_FOR_REVIEW` | Ready for humans |
| `IN_REVIEW` | Review opened |
| `APPROVED` | Confirmed — main handoff |
| `REJECTED` | Rejected |
| `EXTRACTION_FAILED` | Parse failed |
| `VALIDATION_FAILED` | Hard validation failure |

Poll until status is `READY_FOR_REVIEW` / `EXTRACTED` (or a failure status) before reading extraction.

---

## 5. Start extraction

### `POST /documents/:id/process`

**Headers**

```http
Authorization: Bearer <accessToken>
```

**Body** — none

**Response `200`**

```json
{
  "documentId": "uuid",
  "status": "PROCESSING",
  "jobId": "123",
  "mode": "queue"
}
```

or (inline fallback):

```json
{
  "documentId": "uuid",
  "status": "PROCESSING",
  "jobId": null,
  "mode": "inline"
}
```

Then poll `GET /documents/:id` until status leaves `PROCESSING`.

---

## 6. Get extraction result

### `GET /documents/:id/extraction`

**Headers**

```http
Authorization: Bearer <accessToken>
Accept: application/json
```

**Response `200`** (abbreviated)

```json
{
  "id": "uuid",
  "documentId": "uuid",
  "organizationId": "uuid",
  "status": "COMPLETED",
  "model": "gemini-...",
  "promptVersion": "1.1.0",
  "schemaVersion": "1.1.0",
  "summary": {
    "documentNumber": "211851250",
    "documentDate": "2026-01-15",
    "currency": "NOK",
    "supplier": "Seller AS",
    "customer": "Buyer AS",
    "lineItemCount": 12,
    "cancelledLineCount": 0,
    "feeLineCount": 1
  },
  "fields": [
    {
      "id": "uuid",
      "fieldKey": "documentNumber",
      "fieldLabel": "Document number",
      "originalValue": "211851250",
      "currentValue": "211851250",
      "confidence": 0.98,
      "isUserEdited": false,
      "source": { "page": 1, "boundingBox": { "x": 0.1, "y": 0.2, "width": 0.2, "height": 0.03 } }
    }
  ],
  "lineItems": [
    {
      "id": "uuid",
      "sortOrder": 0,
      "articleNumber": "391119",
      "description": "Beger PP 750ml",
      "purchaseQuantity": 12,
      "purchaseUnit": "PK",
      "stockTakingQuantity": 2400,
      "stocktakingUnit": "STK",
      "stockTakingQuantityPerPurchaseUnit": 200,
      "unitPrice": 75.49,
      "amount": 905.88,
      "lineType": "PRODUCT",
      "confidence": 0.95,
      "isUserEdited": false
    }
  ],
  "createdAt": "2026-10-13T12:01:00.000Z",
  "updatedAt": "2026-10-13T12:01:00.000Z"
}
```

**Response `404`** — extraction not ready yet.

---

## 7. Create editor link

Optional: return a URL so a human can open HTVeriDoc review without full login.

### `POST /integrations/handoff/editor-link`

**Headers**

```http
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Body**

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `documentId` | uuid string | Yes | |
| `expiresInSeconds` | int | No | Default 7 days; min 60; max 30 days |

```json
{
  "documentId": "uuid",
  "expiresInSeconds": 604800
}
```

**Response `200`**

```json
{
  "token": "eyJ...",
  "url": "https://<web-host>/editor/<token>",
  "documentId": "uuid",
  "expiresAt": "2026-10-20T12:00:00.000Z"
}
```

### How partners should use `url`

1. Partner **BE** calls this endpoint (never the partner FE).  
2. Partner BE returns `{ url, expiresAt }` on **its own** API to the FE.  
3. Partner FE embeds the review/PDF UI:

```html
<iframe
  src="https://<htveridoc-web>/editor/<token>"
  title="HTVeriDoc review"
  style="width:100%;height:80vh;border:0"
></iframe>
```

Do **not** expose the HTVeriDoc service JWT. Only pass the short-lived editor `url` through your BE.  
HTVeriDoc allows framing when `EDITOR_FRAME_ANCESTORS` is configured (see web env / deploy docs).

---

## 8. Approve document

Triggers the main handoff webhook (`document.approved`) with extraction payload.

### `POST /documents/:id/approve`

**Headers**

```http
Authorization: Bearer <accessToken>
```

**Body** — none

**Response `200`** — document DTO with `"status": "APPROVED"`.

**Errors**

- `400` — wrong status, missing required fields, or validation blockers

---

## 9. Reject document (optional)

### `POST /documents/:id/reject`

**Body**

```json
{
  "reason": "Wrong supplier on PDF"
}
```

`reason` is optional (max 2000 chars).

**Response `200`** — document DTO with `"status": "REJECTED"`.

---

## 10. Webhooks (inbound to partner BE)

HTVeriDoc **POSTs** to the Receiver URL configured in Settings → Webhooks.

### Request your BE must accept

```http
POST /webhook/htveridoc/document-status-update
Content-Type: application/json
X-HTVeriDoc-Event: document.approved
X-HTVeriDoc-Signature: <hmac-sha256-hex-of-raw-body>
X-HTVeriDoc-Delivery: <delivery-id>
```

| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` |
| `X-HTVeriDoc-Event` | Event name (same as `body.event`) |
| `X-HTVeriDoc-Signature` | HMAC-SHA256 hex of **raw** request body using your signing secret |
| `X-HTVeriDoc-Delivery` | Unique delivery id (idempotency) |

Respond with **HTTP 2xx**. Non-2xx is treated as failure (e.g. 404 = path missing).

### Verify signature (Node example)

```js
const crypto = require('crypto');
const expected = crypto
  .createHmac('sha256', process.env.HTVERIDOC_WEBHOOK_SECRET)
  .update(rawBody) // Buffer/string of exact raw bytes
  .digest('hex');
const ok = crypto.timingSafeEqual(
  Buffer.from(expected),
  Buffer.from(req.headers['x-htveridoc-signature'] || ''),
);
```

### Events

| Event | When |
|-------|------|
| `document.extracted` | Parsing finished |
| `document.validating` | Validation running (in validate) |
| `document.ready_for_review` | Ready for human review |
| `document.in_review` | Review started / reopened (in review) |
| `document.approved` | **Main handoff** — use `extraction` |
| `document.rejected` | Rejected |
| `document.extraction_failed` | Parse failed |
| `document.validation_failed` | Validation failed |
| `webhook.test` | Manual Test from Settings → Webhooks |

### Payload (`document.approved`)

```json
{
  "event": "document.approved",
  "occurredAt": "2026-10-13T06:00:00.000Z",
  "organizationId": "uuid",
  "documentId": "uuid",
  "status": "APPROVED",
  "documentType": "PURCHASE_ORDER_CONFIRMATION",
  "fileName": "po.pdf",
  "editorUrl": "https://<web-host>/editor/<token>",
  "extraction": {
    "documentNumber": "211851250",
    "supplierName": "Seller AS",
    "currency": "NOK",
    "fields": {
      "documentNumber": "211851250",
      "supplier.name": "Seller AS"
    },
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

---

## Recommended partner BE sequence

```text
1. POST /auth/login
2. POST /documents          (multipart file)
3. POST /documents/:id/process
4. GET  /documents/:id      (poll until READY_FOR_REVIEW / failure)
5. GET  /documents/:id/extraction
6. POST /integrations/handoff/editor-link   (optional)
7. Human reviews (UI or editorUrl) OR your BE trusts data
8. POST /documents/:id/approve
9. Receive POST webhook document.approved on your receiver
```

---

## Permissions needed on the integration user

| Action | Permission |
|--------|------------|
| Upload | `document.create` |
| Process / edit | `document.edit` |
| Read / extraction / editor link | `document.read` |
| Approve | `document.approve` |
| Reject | `document.reject` |
| Configure webhook (admin UI/API) | `integration.manage` |

---

## Related docs

- Architecture (BE only): `docs/partner-be-integration.md`
- Webhook detail: `docs/handoff-webhooks-editor.md`
- In-app: Guides → Integration guide → **API reference**
