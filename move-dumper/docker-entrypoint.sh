#!/bin/bash
set -euo pipefail
cd /repo/move-dumper
if [[ ! -d node_modules/tsx ]]; then
  npm install
fi
exec "$@"
