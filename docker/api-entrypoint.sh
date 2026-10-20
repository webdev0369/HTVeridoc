#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[api] ERROR: DATABASE_URL is not set. Add a Postgres plugin and reference its URL on this service."
  exit 1
fi

echo "[api] Running database migrations..."
if ! node ./node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js; then
  echo "[api] ERROR: migrations failed. Check DATABASE_URL and that Postgres is reachable from this service."
  exit 1
fi

# Idempotent: roles/permissions (fixes "Roles not seeded" on register).
echo "[api] Seeding roles and permissions..."
if ! node dist/database/seed.js; then
  echo "[api] ERROR: seed failed."
  exit 1
fi

echo "[api] Starting NestJS..."
exec node dist/main.js
