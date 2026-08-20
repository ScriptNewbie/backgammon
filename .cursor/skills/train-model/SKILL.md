---
name: train-model
description: Workflow for training the backgammon evaluation model in training-ground. Use when training, setting up datasets, checkpoints, metrics, ONNX export, or PyTorch training loops.
---

# Train model

`training-ground` is not scaffolded. Follow this when implementing or running training.

## Steps

1. Read [docs/domain/board-representation.md](docs/domain/board-representation.md), [docs/domain/features.md](docs/domain/features.md), and [docs/domain/evaluation.md](docs/domain/evaluation.md).
2. Load dump batches from [docs/domain/dump-format.md](docs/domain/dump-format.md). Ignore `xgid`. Record `eval` is often null — apply `moves[].steps` and train on `moves[].eval.cubeless` (STM of the result). Do not train on bgweb `x`/`o` boards.
3. Train the main net on **cubeless** probabilities. Cubeful labels are for the cube wrapper, not the main loss.
4. Keep the Python featurizer in lockstep with TypeScript; run golden vector fixtures.
5. Export **ONNX** for `game-engine`. Optionally keep `.pt` for Python parity checks.
6. Data, checkpoints, `wandb/`, `*.pt`, `*.onnx` stay on ignored paths. Never commit them.
7. If data layout is still open in [docs/decisions/0000-open-questions.md](docs/decisions/0000-open-questions.md), ask and use `record-decision`.

Do not add a Python toolchain unless the user asks.
