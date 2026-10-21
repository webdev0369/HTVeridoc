#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[api] ERROR: DATABASE_URL is not set. Add a Postgres plugin and reference its URL on this service."
  exit 1
fi

APP_NAME="${APP_NAME:-unknown}"
echo "[api] APP_NAME=${APP_NAME}"

# Run migrations once (identity service, or explicitly requested).
if [ "${RUN_MIGRATIONS:-}" = "true" ] || [ "${APP_NAME}" = "identity" ]; then
  echo "[api] Running database migrations..."
  DS=""
  if [ -f ./node_modules/@htveridoc/db/dist/database/data-source.js ]; then
    DS=./node_modules/@htveridoc/db/dist/database/data-source.js
  elif [ -f ./dist/database/data-source.js ]; then
    DS=./dist/database/data-source.js
  fi
  if [ -z "$DS" ]; then
    echo "[api] ERROR: cannot find TypeORM data-source.js"
    exit 1
  fi
  if ! node ./node_modules/typeorm/cli.js migration:run -d "$DS"; then
    echo "[api] ERROR: migrations failed. Check DATABASE_URL and that Postgres is reachable from this service."
    exit 1
  fi
else
  echo "[api] Skipping migrations (RUN_MIGRATIONS not set / not identity)."
fi

echo "[api] Starting NestJS..."
exec node dist/main.js
