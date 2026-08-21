#!/bin/bash
set -euo pipefail
cd /app
if [[ ! -f pyproject.toml && ! -f requirements.txt ]]; then
  echo "training-ground is not scaffolded; nothing to install for the IDE yet."
  exit 0
fi
python -m venv --copies .venv
if [[ -f pyproject.toml ]]; then
  .venv/bin/pip install torch==2.13.0 --index-url https://download.pytorch.org/whl/cu130
  .venv/bin/pip install onnx onnxscript pyyaml flatbuffers packaging "ruamel.yaml" tabulate
  .venv/bin/pip install --no-deps executorch==1.4.1
  .venv/bin/pip install -e .
else
  .venv/bin/pip install -r requirements.txt
fi
