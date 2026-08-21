#!/bin/bash
set -euo pipefail
cd /app
if [[ -f pyproject.toml ]]; then
  pip install -e .
elif [[ -f requirements.txt ]]; then
  pip install -r requirements.txt
fi
exec "$@"
