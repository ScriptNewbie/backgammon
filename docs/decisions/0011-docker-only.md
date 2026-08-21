# 0011 Docker is the only supported runtime

- Status: accepted
- Date: 2026-08-21

## Context

TypeScript packages need Node.js ≥ 20; `training-ground` needs Python and PyTorch. Host installs differ across machines (especially native addons such as `onnxruntime-node` and esbuild on Windows). Agents were told to prefer `node` / `npm` on PATH and fall back to `docker run`, which still assumed a Unix shell and a host toolchain.

## Decision

- **Docker Engine + Compose v2** is the only supported way to install dependencies, run tests, dump, train, or serve.
- Developers and agents must not install or invoke host Node, npm, Python, or pip. Presence of those tools on PATH does not change the commands.
- Each of the four packages has its own `Dockerfile` and `docker-compose.yml`. Run Compose from that package directory. Commands: [AGENTS.md](../../AGENTS.md).
- Bind-mount source; keep **runtime** `node_modules` in a Compose volume so Linux binaries are used inside the container.
- Each package has Compose profile `install-host`. TypeScript: `npm run install:host` writes `node_modules` onto the host for IDE typechecking. Python: the same profile writes `.venv` once `pyproject.toml` or `requirements.txt` exists (`--copies`, so bind-mounts on Windows work). Do not run dumps, tests, Vite, or training against that host tree. A Linux `.venv` is not a host interpreter.
- Do not add a fifth top-level package for Docker. Images: `node:22-bookworm` for TypeScript packages; `python:3.12-bookworm` for `training-ground` until that package pins its own PyTorch install in-image.

## Consequences

`AGENTS.md`, README, domain run sections, and Cursor/Grok harness files describe Compose only — no `docker run -v "${PWD}:/app"` fallback and no host `tsx`. `game-engine` is not scaffolded yet; its Compose file is the run path once it is. GPU/CUDA for `training-ground` is [ADR 0013](0013-training-cuda.md). Pinning `foochu/bgweb-api` to a digest remains open.
