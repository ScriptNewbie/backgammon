#!/bin/bash
set -euo pipefail
cd /app
if [[ -f package.json && ! -d node_modules/.bin ]]; then
  npm install
fi
exec "$@"
