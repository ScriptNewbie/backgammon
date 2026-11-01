#!/bin/bash
set -euo pipefail
cd /repo/gui
if [[ -f package.json && ( ! -d node_modules/.bin || ! -e node_modules/ts-core ) ]]; then
  npm install
fi
exec "$@"
