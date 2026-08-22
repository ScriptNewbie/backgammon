#!/bin/bash
set -euo pipefail
cd /repo/replay-player
if [[ -f package.json && ! -d node_modules/.bin ]]; then
  npm install
fi
exec "$@"
