#!/bin/sh
set -eu

echo "[api] Running database migrations..."
node ./node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js

echo "[api] Starting NestJS..."
exec node dist/main.js
