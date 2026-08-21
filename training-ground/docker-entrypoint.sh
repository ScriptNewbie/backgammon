#!/bin/bash
set -euo pipefail
cd /app
if [[ -f pyproject.toml ]]; then
  # CUDA torch first so a later editable install cannot swap in a PyPI CPU wheel.
  pip install torch==2.13.0 --index-url https://download.pytorch.org/whl/cu130
  pip install onnx onnxscript pyyaml flatbuffers packaging "ruamel.yaml" tabulate
  pip install --no-deps executorch==1.4.1
  pip install -e .
elif [[ -f requirements.txt ]]; then
  pip install -r requirements.txt
fi
exec "$@"
