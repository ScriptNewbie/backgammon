#!/bin/bash
set -euo pipefail
cd /app
# The image installs everything at build time and records the pyproject.toml it was built from.
# Reinstall only when the bind-mounted pyproject.toml differs or the imports fail.
installed() {
  [[ -f /opt/pyproject.sha256 ]] && sha256sum --status -c /opt/pyproject.sha256 2>/dev/null &&
    python -c "import torch, onnx, onnxruntime, executorch, training_ground" 2>/dev/null
}
if [[ -f pyproject.toml ]]; then
  if ! installed; then
    # CUDA torch first so a later editable install cannot swap in a PyPI CPU wheel.
    pip install torch==2.13.0 --index-url https://download.pytorch.org/whl/cu130
    pip install onnx onnxscript onnxruntime pyyaml flatbuffers packaging "ruamel.yaml" tabulate
    pip install --no-deps executorch==1.4.1
    pip install -e .
    sha256sum /app/pyproject.toml > /opt/pyproject.sha256
  fi
elif [[ -f requirements.txt ]]; then
  pip install -r requirements.txt
fi
exec "$@"
