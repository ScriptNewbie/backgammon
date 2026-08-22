---
name: evaluate-position
description: Workflow for the game-engine HTTP API that returns legal moves with evaluations. Use when implementing or changing evaluate endpoints, request/response types, ONNX inference, cube action, or move ranking.
---

# Evaluate a position

TypeScript + Hono + `onnxruntime-node` ([ADR 0004](docs/decisions/0004-game-engine-typescript-onnx.md), [ADR 0017](docs/decisions/0017-hono.md)). Docker only ([ADR 0011](docs/decisions/0011-docker-only.md)). Board / moves / featurizer: `ts-core`. Cube wrap: [ADR 0018](docs/decisions/0018-cube-wrap-formula.md).

## Contract

- **Request:** `POST /evaluate` position JSON with dice ([docs/domain/game-engine.md](docs/domain/game-engine.md), [docs/domain/board-representation.md](docs/domain/board-representation.md)).
- **Infer:** JSON → 206-vector ([docs/domain/features.md](docs/domain/features.md)) → ONNX → cubeless probs.
- **Response:** legal moves + eval object ([docs/domain/evaluation.md](docs/domain/evaluation.md)), including cubeful equity (`equity * cube.value`) and cube action.

## Steps

1. Read those domain docs before touching types or handlers.
2. Generate legal moves only. Have the `backgammon-rules` subagent check samples (p1 home 1–6, p2 home 19–24).
3. Rank checker plays by **negated** cubeful equity of the resulting position.
4. Do not spawn Python per request.
5. Keep the TS featurizer in `ts-core` in lockstep with Python fixtures.
6. From `game-engine/`: `npm run up` (http://localhost:3000), `npm test`, `npm run install:host`. Port 3000 is the Compose publish port, not an HTTP-framework decision.
