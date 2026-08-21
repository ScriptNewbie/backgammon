# 0013 CUDA PyTorch for training-ground

- Status: accepted
- Date: 2026-08-21

## Context

[ADR 0011](0011-docker-only.md) made Docker the only runtime and used `python:3.12-bookworm` for `training-ground`, but left GPU/CUDA images undecided. Training the cubeless net needs a CUDA build of PyTorch inside Compose, not a host pip install and not a CPU wheel from PyPI (that wheel would replace a CUDA install on `pip install -e .` if `torch` were a normal PyPI dependency). An RTX 5070 is Blackwell (`sm_120`). Official PyTorch wheels only include `sm_120` kernels when built with CUDA 12.8 or newer. The pairing that is both 5070-capable and new enough for ExecuTorch 1.4 (`torch>=2.13`) is torch 2.13 from the cu130 index.

## Decision

- Keep the `python:3.12-bookworm` base. Install **`torch==2.13.0`** from `https://download.pytorch.org/whl/cu130`. The wheel bundles CUDA 13.0 runtime libraries; the host supplies the driver via NVIDIA Container Toolkit (Docker Desktop WSL2 on Windows). Do not switch to an NVIDIA NGC image.
- Do **not** list `torch` in `pyproject.toml` dependencies. Install it from the cu130 index in the Dockerfile and in `docker-entrypoint.sh` / `docker-install-host.sh` before `pip install -e .`.
- The Compose `train` service sets `gpus: all`. `install-host` does not. Tests may run on CPU inside the CUDA image; they must not require `torch.cuda.is_available()`.
- Do not train against the `install-host` Linux `.venv`.
- Host NVIDIA Game Ready driver **580+** is required for CUDA 13.0 kernels. Do not use the cu126 index as a fallback (no `sm_120`).

## Consequences

Developers need a working Docker GPU stack and a 580+ Windows driver to attach the 5070 to `train`. The image is larger than a CPU wheel. Domain encodings are unchanged. ExecuTorch install remains `--no-deps` after this pin ([ADR 0014](0014-export-onnx-and-pte.md)).
