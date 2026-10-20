#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[api] ERROR: DATABASE_URL is not set. Add a Postgres plugin and reference its URL on this service."
  exit 1
fi

SERVICE_NAME="${SERVICE_NAME:-all}"
echo "[api] SERVICE_NAME=${SERVICE_NAME}"

# Run migrations once (identity slice, or explicitly requested).
if [ "${RUN_MIGRATIONS:-}" = "true" ] || [ "${SERVICE_NAME}" = "identity" ]; then
  echo "[api] Running database migrations..."
  if ! node ./node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js; then
    echo "[api] ERROR: migrations failed. Check DATABASE_URL and that Postgres is reachable from this service."
    exit 1
  fi
else
  echo "[api] Skipping migrations (RUN_MIGRATIONS not set / not identity)."
fi

echo "[api] Starting NestJS..."
exec node dist/main.js
