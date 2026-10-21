# HTVeridoc

Document-processing platform (Phases 1–3): multi-tenant auth, PDF upload/storage, and a basic review shell.

## Stack

- **Web:** Next.js + TypeScript + Tailwind + TanStack Query + PDF.js
- **API (microservices):** five Nest apps — `identity`, `documents`, `processing`, `review`, `integrations` — plus `gateway`
- **Shared packages:** `@htveridoc/shared`, `@htveridoc/db`, `@htveridoc/domains`
- **Storage:** local filesystem under `storage/htveridoc`

Docker is **not** required for local development. For a full stack deploy (gateway + five APIs + web + Postgres + Redis + persistent PDF storage), use Docker Compose below.

### Repo layout

```text
apps/
  api/
    identity|documents|processing|review|integrations  # :3011–:3015
    gateway                                            # public API :3001
  web/                                                 # :3000
packages/
  shared/    # config, storage, health, JWT verify
  db/        # entities, migrations, seed
  domains/   # Nest domain modules (loaded per service)
```

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
# Gateway (:3001) + 5 API services (:3011–:3015) + web (:3000)
pnpm dev
# or: node scripts/dev.js   /   dev.cmd   /   bash dev.sh
```

Swagger per service: `http://localhost:3011/docs` … `http://localhost:3015/docs`  
Gateway: `http://localhost:3001`

`with-project-node.js` pins Node 20 for this repo only so Gemini (`@google/genai`) works without flipping global nvm.

## Deploy with Docker (full system)

Requires Docker Compose. This starts **Postgres**, **Redis**, **gateway + five API microservices** (identity runs migrations on boot), and **Web**, with a named volume for PDF storage.

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

Prefer Docker Compose for the full microservice stack. On Railway, deploy **one service per Nest app** under `apps/api/<name>` (plus web), or use Compose on a VPS.

| Service | Source | Notes |
|---------|--------|--------|
| Postgres | Railway plugin | Shared `DATABASE_URL` on every API service |
| Redis | Empty service + `redis:7-alpine` **or** Upstash | Set `REDIS_URL` on APIs (BullMQ; Redis 5+) |
| APIs | `apps/api/identity` … `integrations` (+ optional `gateway`) | Set `APP_NAME` per service. Run migrations on **identity** (`RUN_MIGRATIONS=true`) via `docker/api-entrypoint.sh` |
| Web | `apps/web/Dockerfile` or [`railway.web.toml`](railway.web.toml) | Build with `NEXT_PUBLIC_API_URL` = public gateway/API URL |

**Listen port:** platforms inject `PORT` (else `API_PORT`). Health: `GET /health`.

**Required API env:** `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN`, `PUBLIC_WEB_URL`, `PUBLIC_API_URL`, `GEMINI_API_KEY`, `INTEGRATIONS_SECRET_KEY`, `STORAGE_ROOT` (volume mount).

**Web env:** `NEXT_PUBLIC_API_URL`; optional `EDITOR_FRAME_ANCESTORS` (see `apps/web/next.config.ts`).
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
