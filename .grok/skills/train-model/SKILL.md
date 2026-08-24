---
name: train-model
description: Workflow for training the backgammon evaluation model in training-ground. Use when training, setting up datasets, checkpoints, metrics, ONNX export, or PyTorch training loops.
---

# Train model

Docker only ([ADR 0011](docs/decisions/0011-docker-only.md)). CUDA PyTorch in the `train` image ([ADR 0013](docs/decisions/0013-training-cuda.md)). Data layout: [ADR 0012](docs/decisions/0012-training-data-layout.md). Featurizer: `src/training_ground/features.py`. Golden vectors: `fixtures/features.json`.

## Steps

1. Read [docs/domain/board-representation.md](docs/domain/board-representation.md), [docs/domain/features.md](docs/domain/features.md), and [docs/domain/evaluation.md](docs/domain/evaluation.md).
2. Load dump batches from `/data/dumps` (Compose mounts `../move-dumper/dumps` read-only; see [docs/domain/dump-format.md](docs/domain/dump-format.md)). Ignore `xgid` and SGF. Record `eval` is often null — apply `moves[].steps` and train on `moves[].eval.cubeless` (STM of the result). Do not train on bgweb `x`/`o` boards.
3. Split by `matchId`, not record or batch: `int.from_bytes(sha256(matchId.encode("utf-8")).digest()[:8], "big") % 100` → train `0–89`, val `90–94`, test `95–99`. Cubeless training ignores `decision == "cube"` at sample time. New dumps ([ADR 0020](docs/decisions/0020-dumper-games-no-cube.md)) are checker-only games with `matchId` equal to `gameId` and `position.match` null. Do not treat the dead cube as live cube labels.
4. Train the **teacher** `CubelessNet` (default 206→512→512→512→5, sigmoid, MSE on cubeless probs; [ADR 0015](docs/decisions/0015-teacher-cubeless-mlp.md)). Cubeful labels are for the cube wrapper, not the main loss. Distillation to a smaller student is a later ADR.
5. Keep the Python featurizer in lockstep with TypeScript in `ts-core`; run golden vector fixtures (`docker compose run --rm train python -m pytest`).
6. Export **ONNX** for `game-engine` and ExecuTorch **`.pte`** via `export_onnx_and_pte` ([ADR 0014](docs/decisions/0014-export-onnx-and-pte.md)). Optionally keep `.pt` for Python parity checks.
7. Data, `training-ground/cache/`, `training-ground/checkpoints/`, `wandb/`, `*.pt`, `*.onnx`, `*.pte` stay on ignored paths. Never commit them.
8. From `training-ground/`. Host commands: [README.md](README.md). Tests: `docker compose run --rm train python -m pytest`. Train: `docker compose run --rm train python -m training_ground.train --dumps /data/dumps --epochs 20 --batch-size 1024 --checkpoint-dir checkpoints` (`gpus: all` on `train`). Export ONNX for the engine with `--export-stem checkpoints/cubeless`. IDE `.venv`: `docker compose --profile install-host run --rm install-host` (Linux venv is not a host interpreter). Install CUDA torch from the cu130 index, not PyPI. Do not run host `python` or `pip`.

Do not copy dumps into `training-ground/`. Do not list `torch`, `onnx`, or `executorch` as PyPI dependencies that would replace the cu130 torch wheel.
