#!/usr/bin/env bash
# Works when global Node is 16 — does not call nvm use.
set -euo pipefail
cd "$(dirname "$0")"
exec node scripts/dev.js "$@"
