---
name: train-model
description: Workflow for training the backgammon evaluation model in training-ground. Use when training, setting up datasets, checkpoints, metrics, ONNX export, or PyTorch training loops.
---

# Train model

Docker only ([ADR 0011](docs/decisions/0011-docker-only.md)). CUDA PyTorch in the `train` image ([ADR 0013](docs/decisions/0013-training-cuda.md)). Data layout: [ADR 0012](docs/decisions/0012-training-data-layout.md). Featurizer: `src/training_ground/features.py`. Golden vectors: `fixtures/features.json`.

## Steps

1. Read [docs/domain/board-representation.md](docs/domain/board-representation.md), [docs/domain/features.md](docs/domain/features.md), and [docs/domain/evaluation.md](docs/domain/evaluation.md).
2. Load dump batches from `/data/dumps` (Compose mounts `../move-dumper/dumps` read-only; see [docs/domain/dump-format.md](docs/domain/dump-format.md)). Ignore `xgid` and SGF. Record `eval` is often null — apply `moves[].steps` and train on `moves[].eval.cubeless` (STM of the result). Do not train on bgweb `x`/`o` boards.
3. Split by `matchId`, not record or batch: `int.from_bytes(sha256(matchId.encode("utf-8")).digest()[:8], "big") % 100` → train `0–89`, val `90–94`, test `95–99`. Cubeless training ignores `decision == "cube"` at sample time.
4. Train the main net on **cubeless** probabilities. Cubeful labels are for the cube wrapper, not the main loss.
5. Keep the Python featurizer in lockstep with TypeScript; run golden vector fixtures (`docker compose run --rm train python -m pytest`).
6. Export **ONNX** for `game-engine` and ExecuTorch **`.pte`** via `export_onnx_and_pte` ([ADR 0014](docs/decisions/0014-export-onnx-and-pte.md)). Optionally keep `.pt` for Python parity checks.
7. Data, `training-ground/cache/`, `training-ground/checkpoints/`, `wandb/`, `*.pt`, `*.onnx`, `*.pte` stay on ignored paths. Never commit them.
8. From `training-ground/`: tests `docker compose run --rm train python -m pytest`; training `docker compose run --rm train <command>` (`gpus: all` on `train`). IDE `.venv`: `docker compose --profile install-host run --rm install-host` (Linux venv is not a host interpreter). Install CUDA torch from the cu130 index, not PyPI. Do not run host `python` or `pip`.

Do not copy dumps into `training-ground/`. Do not list `torch`, `onnx`, or `executorch` as PyPI dependencies that would replace the cu130 torch wheel.
