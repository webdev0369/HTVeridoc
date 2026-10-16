# Partner backend ↔ HTVeriDoc

Server-to-server only. See the full customer path in [`customer-integration-guide.md`](./customer-integration-guide.md).

## Architecture (locked)

```text
Partner FE  →  Partner BE only
Partner BE  →  HTVeriDoc API  (JWT, upload, process, editor-link, approve)
HTVeriDoc   →  Partner BE webhook receiver  (status + extraction)
```

### Editor embed

```text
FE  →  your BE  …/editor-link
BE  →  HTVeriDoc POST /integrations/handoff/editor-link
BE  →  { url, expiresAt }  to FE
FE  →  <iframe src={url} />
```

- FE must **not** invent `/editor/...` URLs or call HTVeriDoc.  
- Re-fetch a fresh link from your BE ~5–15 minutes before `expiresAt`.  
- Optional webhook `editorUrl` is cache-only; prefer your BE endpoint.

## Partner BE env (server only)

Copy from HTVeriDoc **API credentials** (never put in FE):

```text
HTVERIDOC_API_URL=https://<htveridoc-api-host>
HTVERIDOC_EMAIL=<integration-user@your-company.com>
HTVERIDOC_PASSWORD=<password>
HTVERIDOC_ORGANIZATION_ID=<uuid>
HTVERIDOC_WEBHOOK_SECRET=<from credentials page>
```

No `HTVERIDOC_WEB_URL` / web origin — editor URLs come back as `{ url }` from the API.

## BE checklist

1. Login `POST /auth/login` → cache access token  
2. Upload `POST /documents` (multipart `file`)  
3. Process `POST /documents/:id/process`  
4. Poll `GET /documents/:id` (+ extraction)  
5. Editor link `POST /integrations/handoff/editor-link` → return `{ url, expiresAt }` to FE  
6. Approve `POST /documents/:id/approve` when ready  
7. Webhook receiver (e.g. `POST /webhook/htveridoc/document-status-update`)  
8. Register URL in HTVeriDoc → Webhooks → Test (HTTP 2xx)

Outbound auth: `Authorization: Bearer <accessToken>`

## Webhook inbound

Headers: `X-HTVeriDoc-Event`, `X-HTVeriDoc-Signature`, `X-HTVeriDoc-Delivery`  
Main event: `document.approved` — use `extraction.fields` and `extraction.lineItems`.

## FE after BE is ready

Only **your** endpoints, e.g.:

- `POST /integrations/htveridoc/jobs`  
- `GET /integrations/htveridoc/jobs/:id`  
- `GET|POST /integrations/htveridoc/jobs/:id/editor-link` → iframe `src`  
- `POST /integrations/htveridoc/jobs/:id/approve`  

No `htveridoc-tester` routes in the browser.

## Related

- Customer overview: [`customer-integration-guide.md`](./customer-integration-guide.md)  
- HTTP contract: [`partner-api-reference.md`](./partner-api-reference.md)  
- Tester prompts: [`partner-tester-prompts.md`](./partner-tester-prompts.md)  
- Webhooks detail: [`handoff-webhooks-editor.md`](./handoff-webhooks-editor.md)  
