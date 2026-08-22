#!/bin/bash
set -euo pipefail
cd /repo/game-engine
if [[ -f package.json && ! -d node_modules/.bin ]]; then
  npm install
fi
exec "$@"
