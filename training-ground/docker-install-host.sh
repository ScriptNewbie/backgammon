#!/bin/bash
set -euo pipefail
cd /app
if [[ ! -f pyproject.toml && ! -f requirements.txt ]]; then
  echo "training-ground is not scaffolded; nothing to install for the IDE yet."
  exit 0
fi
python -m venv --copies .venv
if [[ -f pyproject.toml ]]; then
  .venv/bin/pip install -e .
else
  .venv/bin/pip install -r requirements.txt
fi
