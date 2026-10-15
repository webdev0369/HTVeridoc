# Partner backend ↔ HTVeriDoc (correct pattern)

HTVeriDoc integrates **server-to-server**. The partner frontend must **not** call HTVeriDoc APIs.

## Do not do this (FE)

```ts
// ❌ Wrong — FE must not own HTVeriDoc calls
export const htveridocTester = {
  login: () => `admin/htveridoc-tester/login`,
  upload: () => `admin/htveridoc-tester/documents/upload`,
  process: (id) => `admin/htveridoc-tester/documents/${id}/process`,
  // ...
};
```

Putting login / upload / process / approve on the **frontend** (or FE “tester” routes that the browser drives) exposes credentials and couples the UI to HTVeriDoc.

## Do this instead (BE)

```text
Partner FE  →  Partner BE only
Partner BE  →  HTVeriDoc API  (JWT, upload, process, approve, editor-link)
HTVeriDoc   →  Partner BE webhook receiver  (status + extraction)
```

| Layer | Responsibility |
|-------|----------------|
| Partner FE | Upload to **your** API; show status from **your** DB; **embed** editor `url` from **your** BE in an iframe |
| Partner BE | Store HTVeriDoc credentials; call HTVeriDoc; create editor-link; return `url` to FE; receive webhooks |
| HTVeriDoc | Parse / review / approve; issue editor URLs; POST events to your receiver URL |

## Partner BE checklist

1. Env (server only): `HTVERIDOC_BASE_URL`, service user email/password or token strategy  
2. `POST {HTVERIDOC}/auth/login` → cache `accessToken` server-side  
3. `POST {HTVERIDOC}/documents` (multipart `file`)  
4. `POST {HTVERIDOC}/documents/:id/process`  
5. Poll `GET .../documents/:id` and `GET .../extraction`  
6. `POST {HTVERIDOC}/integrations/handoff/editor-link` → return `{ url }` to FE (for iframe embed)  
7. `POST {HTVERIDOC}/documents/:id/approve` when your workflow confirms data  
8. Implement webhook route, e.g. `POST /webhook/htveridoc/document-status-update`  
9. Register that URL in HTVeriDoc → Settings → Webhooks → Test (must be HTTP 2xx)

Auth on outbound calls: `Authorization: Bearer <accessToken>`

### Editor embed (PDF viewer in partner UI)

```text
FE  →  GET/POST /integrations/htveridoc/jobs/:id/editor-link   (partner BE)
BE  →  POST /integrations/handoff/editor-link                  (HTVeriDoc)
BE  →  { url, expiresAt }                                      (to FE)
FE  →  <iframe src={url} />                                    (inside partner product)
```

- FE must **not** invent `/editor/...` URLs or call HTVeriDoc for the link.
- Prefer a fresh link from your BE; webhook `editorUrl` is optional cache only.

## Webhook (inbound to partner BE)

HTVeriDoc `POST`s JSON with headers:

- `X-HTVeriDoc-Event`
- `X-HTVeriDoc-Signature` (HMAC-SHA256 of raw body, if secret configured)
- `X-HTVeriDoc-Delivery`

Main event: `document.approved` — use `extraction.fields` and `extraction.lineItems`.

## FE after BE is ready

Partner FE only needs **your** endpoints, for example:

- `POST /integrations/htveridoc/jobs` (your BE then calls HTVeriDoc)
- `GET /integrations/htveridoc/jobs/:id` (status from your DB)
- `GET|POST /integrations/htveridoc/jobs/:id/editor-link` → embed returned `url` in iframe
- `POST /integrations/htveridoc/jobs/:id/approve`

No `htveridoc-tester` routes in the browser. Editor iframe `src` = URL from **your BE only**.

## Related

- **Full API contract (headers / body / response):** `docs/partner-api-reference.md`
- **Copy-paste FE/BE tester prompts:** `docs/partner-tester-prompts.md`
- Events & payloads: `docs/handoff-webhooks-editor.md`
- Customer overview: `docs/customer-integration-guide.md`
- In-app: Guides → Integration guide → **API reference**
