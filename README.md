# HTVeridoc

Document-processing platform (Phases 1–3): multi-tenant auth, PDF upload/storage, and a basic review shell.

## Stack

- **Web:** Next.js + TypeScript + Tailwind + TanStack Query + PDF.js
- **API:** NestJS + TypeORM + PostgreSQL + Redis/BullMQ (connection only)
- **Storage:** local filesystem under `storage/htveridoc`

Docker is **not** required for local development. For a full stack deploy (API + web + Postgres + Redis + persistent PDF storage), use Docker Compose below.

## Prerequisites

- Node.js **20+** for this repo (other apps can stay on Node 16)
- pnpm 9 (ships with nvm’s Node 20 install, or `corepack enable`)
- PostgreSQL 14+ running locally **or** Docker Desktop / Docker Engine
- Redis optional for Phases 1–3 (BullMQ is registered but idle; required later for jobs)

### Node 16 + Node 20 side by side (Windows nvm)

On Windows, `nvm use` changes Node **globally** (symlink under `C:\Program Files\nodejs`). That is why it feels like the whole system switches.

For HTVeriDoc you do **not** need to leave Node 20 active:

```bash
# one-time
nvm install 20

# keep your default / other projects on 16 if you want:
nvm use 16

# from THIS repo — start via node (not bare pnpm) when shell is Node 16
node scripts/dev.js
# Windows:  dev.cmd
# Git Bash: bash dev.sh
```

`pnpm` 9 refuses to start on Node 16, so do **not** type bare `pnpm dev` while your global Node is 16. Use `node scripts/dev.js` / `dev.cmd` instead — it re-execs under nvm’s Node 20 without `nvm use`.

You should see `[dev] shell is v16...; re-exec under ...\v20.x.x`.  
`.nvmrc` in this repo is `20`. Avoid `nvm use 20` while you are actively running a Node 16 FE elsewhere.

## Setup

```bash
# From repo root
cp .env.example .env
# Edit DATABASE_URL to match your local Postgres credentials / JWT secrets
```

Create the database (Windows example with PostgreSQL installer):

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -f scripts/create-database.sql
```

Then:

```bash
pnpm install
pnpm migration:run
pnpm seed
```

## Run

```bash
# Preferred when global Node is 16 (Windows nvm):
node scripts/dev.js
# or:  dev.cmd   /   bash dev.sh

# If your shell is already Node 20+, these also work:
pnpm dev:api   # http://localhost:3001
pnpm dev:web   # http://localhost:3000
pnpm dev       # runs node scripts/dev.js
```

`dev.js` / `with-project-node.js` pin Node 20 for this repo only so Gemini (`@google/genai`) works without flipping global nvm.

## Deploy with Docker (full system)

Requires Docker Compose. This starts **Postgres**, **Redis**, **API** (runs migrations on boot), and **Web**, with a named volume for PDF storage.

```bash
cp .env.docker.example .env
# Edit JWT secrets, POSTGRES_PASSWORD, GEMINI_API_KEY, and public URLs
docker compose up --build -d
```

- Web: http://localhost:3000  
- API: http://localhost:3001/health  

`NEXT_PUBLIC_API_URL` and `CORS_ORIGIN` must be URLs the **browser** can reach (e.g. your VPS domain), not Docker service names. Rebuild the web image after changing `NEXT_PUBLIC_API_URL`.

```bash
pnpm docker:logs    # follow logs
pnpm docker:down    # stop stack
```

On a VPS: install Docker, copy the repo, set `.env` with your public hostnames/HTTPS URLs, then `docker compose up --build -d`.

## Deploy on Railway

Ship readiness (config + env). Create **four services** (or use Railway Postgres/Redis plugins):

| Service | Source | Notes |
|---------|--------|--------|
| Postgres | Railway plugin | Set `DATABASE_URL` on API |
| Redis | Empty service + Docker image `redis:7-alpine` (no volume) **or** Upstash | Free plan allows **1 volume** (use it for Postgres). Do **not** use Bitnami/Redis templates that attach a second volume. Set `REDIS_URL` on API (BullMQ; Redis 5+). Ephemeral Redis is fine for queues. |
| API | Dockerfile `apps/api/Dockerfile` or root [`railway.toml`](railway.toml) | Migrations run on boot via `docker/api-entrypoint.sh`. Start command must be `/entrypoint.sh` (not `pnpm …`) — the runtime image has no pnpm. |
| Web | Dockerfile `apps/web/Dockerfile` or [`railway.web.toml`](railway.web.toml) | Build with `NEXT_PUBLIC_API_URL` = public API URL. Start command must be `node apps/web/server.js` (not `npm`/`pnpm`). No publish directory. If using Nixpacks instead, start stays `pnpm --filter @htveridoc/web start` — do not use `next start` with Docker standalone output. |

**API listen port:** Railway injects `PORT`. The API uses `PORT` when set, otherwise `API_PORT` (default `3001`). Health check: `GET /health`.

**Required API env (production):**

- `DATABASE_URL`, `REDIS_URL`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (long random strings)
- `CORS_ORIGIN` = public web origin (comma-separated if multiple)
- `PUBLIC_WEB_URL` = same public web origin (editor links in webhooks)
- `PUBLIC_API_URL` = public API origin (credentials UI)
- `GEMINI_API_KEY` (+ optional `GEMINI_MODEL`)
- `INTEGRATIONS_SECRET_KEY` (preferred over falling back to JWT secret)
- `STORAGE_ROOT` = volume mount path (e.g. `/data/storage`)

**Web env:**

- `NEXT_PUBLIC_API_URL` = public API URL (rebuild after change)
- `EDITOR_FRAME_ANCESTORS` = comma-separated partner origins allowed to iframe the editor (see `apps/web/next.config.ts`)

**Volume:** Attach a persistent volume to the API service at `STORAGE_ROOT` so PDFs survive restarts.

Example configs: API [`railway.toml`](railway.toml) (`healthcheckPath = /health`); Web [`railway.web.toml`](railway.web.toml) (point each service’s Config-as-code file path at the matching file).

## Smoke checklist

1. Open http://localhost:3000/register and create an organization + admin user.
2. Confirm `GET http://localhost:3001/health` returns `{ status: "ok" }`.
3. Upload a PDF on **Documents**.
4. Open the document and verify the PDF.js viewer renders pages.
5. Confirm the file exists under `storage/htveridoc/organizations/{orgId}/documents/{docId}/original/document.pdf`.

## API (Phases 1–3)

| Method | Path | Notes |
|--------|------|--------|
| POST | `/auth/register` | Creates org + ADMIN user |
| POST | `/auth/login` | JWT access + refresh |
| POST | `/auth/refresh` | Rotate refresh token |
| POST | `/auth/logout` | Revoke refresh token |
| GET | `/auth/me` | Current user + orgs |
| GET | `/organizations/current` | Active org |
| GET | `/users` | Org members |
| GET | `/users/roles` | Role catalog |
| POST | `/users` | Add org member (`user.manage`) |
| PATCH | `/users/:id/role` | Change role (`user.manage`) |
| PATCH | `/users/:id/status` | Enable/disable (`user.manage`) |
| POST | `/documents` | multipart `file` PDF (+ optional `queueId`) |
| GET | `/documents` | Paginated list (optional `queueId`; membership-scoped) |
| GET | `/documents/:id` | Metadata |
| GET | `/documents/:id/file` | Authenticated PDF stream |
| PATCH | `/documents/:id/queue` | Assign / clear document queue |
| DELETE | `/documents/:id` | Soft-delete |
| POST | `/documents/:id/process` | Enqueue Gemini extraction (`ai-extraction` job queue) |
| GET | `/documents/:id/extraction` | Latest extraction result |
| GET | `/ai/requests` | AI token/cost tracking |
| GET | `/document-queues` | List Rossum-style document queues (`queue.read`) |
| POST | `/document-queues` | Create queue (`queue.manage`) |
| PATCH | `/document-queues/:id` | Update queue / members (`queue.manage`) |
| DELETE | `/document-queues/:id` | Archive queue (`queue.manage`) |
| GET | `/queue/jobs` | List recent BullMQ background jobs (`queue.read`) |
| POST | `/queue/jobs/:queueName/:jobId/retry` | Retry failed job (`queue.manage`) |

**Queues vs jobs:** Settings → **Queue Manager** configures document workflow queues (type, members, inbox). Settings → **Background Jobs** is the BullMQ ops view for extraction/export workers.

### Phase 4 — Gemini

1. Set `GEMINI_API_KEY` in `.env` (model defaults to `gemini-3-flash-preview`).
2. Redis: BullMQ needs Redis **5+**. Older Windows Redis (e.g. 3.x) is auto-detected and extraction falls back to **inline** mode.
3. Run `pnpm migration:run` (creates `extractions` + `ai_requests`).
4. Open a document → **Extract with Gemini** → watch status move to `EXTRACTED` and review JSON.

### Phase 5 — PO confirmation structured extraction

- Prompt/schema **v1.1.0** for full header + line items (fees/cancelled preserved)
- Tables: `extraction_fields`, `extraction_line_items`, `extraction_sources`
- `GET /documents/:id/extraction` returns `fields`, `lineItems`, and `summary`
- Reprocess existing documents after `pnpm migration:run` to populate structured rows

### Handoff (Approve → webhook)

After parsing and review, **Approve** notifies other systems via webhooks (extraction payload + optional editor link).

**Path:** Partner FE → Partner BE → HTVeriDoc API; HTVeriDoc → Partner BE webhooks (never call HTVeriDoc from the browser).

- **Start here:** [`docs/customer-integration-guide.md`](docs/customer-integration-guide.md)
- **In-app:** Configuration → **API credentials** · Guides → **Integration guide** · Settings → **Webhooks**
- **Partner BE checklist:** `docs/partner-be-integration.md`
- **HTTP contract:** `docs/partner-api-reference.md`
- **Tester prompts:** `docs/partner-tester-prompts.md`
- **Webhooks / editor detail:** `docs/handoff-webhooks-editor.md`

Legacy TotalCtrl store-orders export is not part of the product flow (`docs/export-destination-contract.md`).


## Storage layout

```text
storage/htveridoc/organizations/{organizationId}/documents/{documentId}/original/document.pdf
```

PDFs are never served from a public web root; only via authenticated NestJS endpoints.
