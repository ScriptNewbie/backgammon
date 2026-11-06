# game-engine-fast

Locked by [ADR 0028](../decisions/0028-game-engine-fast.md). Not implemented yet. Bodies: [board-representation.md](board-representation.md), [evaluation.md](evaluation.md). Tensor: [features.md](features.md) (cube block fixed, [ADR 0029](../decisions/0029-fixed-cube-features.md)). Reference engine: [game-engine.md](game-engine.md).

CUDA C++ ply-search engine on the GPU, used as a `battle-arena` driver. Separate from `game-engine`; both are maintained. Model: `cubeless-fast.onnx` from `training-ground` (same weights as `cubeless.onnx`, dynamic batch `[N, 206]` → `cubeless` `[N, 5]`). Do not commit weights.

## `GET /health`

`200` `{ "ok": true }`.

## `POST /evaluate?ply=N`

Body and response shape are the same as `game-engine` `POST /evaluate`.

- `ply`: GnuBG numbering. `0` = net only, `1` = average over the opponent's 21 rolls and best replies, and so on. Default `0`. The engine rejects values above its cap (initially 4) with `400`.
- `ply=0`: every legal play, each with the eval of the resulting position (opponent is STM).
- `ply>=1`: only candidates searched to the full depth. Moves dropped by the move filter are left out. Filter widths are engine defaults, not request params.
- Sorted best-first for the mover by negated `cubefulEquity` of the result. Exact ties break by `stepsKey`.
- `eval.source` is `"model"`. `cubefulEquity = cubeless.equity * cube.value`. `cubeAction` is always `null`.
- The search ignores the cube (fixed tensor constants) and `position.match`. Inner nodes maximise cubeless money equity. The arena ranks the returned candidates by mover MWC.
- FP32. Determinism is best effort.
- `400` on invalid JSON / position / dice / `ply`.

## Tests

Hand-written edge cases for the C++ board and move generation (bar entry and dancing, the higher-die rule, using both dice, partial doubles, bearing off, hits). The featurizer must pass `training-ground/fixtures/features.json`.
