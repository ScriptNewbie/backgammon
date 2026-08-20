---
name: evaluate-position
description: Workflow for the game-engine HTTP API that returns legal moves with evaluations. Use when implementing or changing evaluate endpoints, request/response types, ONNX inference, cube action, or move ranking.
---

# Evaluate a position

`game-engine` is not scaffolded. TypeScript + `onnxruntime-node` ([ADR 0004](docs/decisions/0004-game-engine-typescript-onnx.md)).

## Contract

- **Request:** position JSON + dice ([docs/domain/board-representation.md](docs/domain/board-representation.md)).
- **Infer:** JSON → 206-vector ([docs/domain/features.md](docs/domain/features.md)) → ONNX → cubeless probs.
- **Response:** legal moves + eval object ([docs/domain/evaluation.md](docs/domain/evaluation.md)), including cubeful equity and cube action.

## Steps

1. Read those domain docs before touching types or handlers.
2. Generate legal moves only. Have the `backgammon-rules` subagent check samples (p1 home 1–6, p2 home 19–24).
3. Rank checker plays by **negated** cubeful equity of the resulting position.
4. Do not spawn Python per request. Do not pick an HTTP framework unless the user asks (still open).
5. Keep the TS featurizer in lockstep with Python fixtures.
