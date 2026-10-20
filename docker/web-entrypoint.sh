#!/bin/sh
set -eu

# Next standalone layout differs slightly by version; prefer monorepo path.
if [ -f apps/web/server.js ]; then
  echo "[web] Starting Next standalone (apps/web/server.js) on PORT=${PORT:-8080}"
  exec node apps/web/server.js
fi

if [ -f server.js ]; then
  echo "[web] Starting Next standalone (server.js) on PORT=${PORT:-8080}"
  exec node server.js
fi

echo "[web] ERROR: server.js not found. Listing /app:"
ls -la /app || true
ls -la /app/apps/web 2>/dev/null || true
exit 1
