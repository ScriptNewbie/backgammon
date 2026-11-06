# game-engine-fast

Locked by [ADR 0028](../decisions/0028-game-engine-fast.md). Status: `ply=0` works; ply search and the `battle-arena` driver are not built yet. Bodies: [board-representation.md](board-representation.md), [evaluation.md](evaluation.md). Tensor: [features.md](features.md) (cube block fixed, [ADR 0029](../decisions/0029-fixed-cube-features.md)). Reference engine: [game-engine.md](game-engine.md).

CUDA C++ ply-search engine on the GPU, used as a `battle-arena` driver. Separate from `game-engine`; both are maintained. Model: `MODEL_PATH` (default `/models/cubeless-fast.onnx`) from `training-ground` (same weights as `cubeless.onnx`, dynamic batch `[N, 206]` → `cubeless` `[N, 5]`). Do not commit weights. Compose port **3001**.

The engine reads the weights straight from the ONNX file (no ONNX Runtime) and refuses any graph other than `Gemm(transB=1)` → `Relu` → … → `Gemm` → `Sigmoid` with input `features` and output `cubeless`. Inference is one cuBLAS SGEMM per layer in plain FP32 (no TF32). Internally the board is side-to-move relative: each player's checkers in its own numbering, 0 = off, 25 = bar.

## `GET /health`

`200` `{ "ok": true }`.

## `POST /evaluate?ply=N`

Body and response shape are the same as `game-engine` `POST /evaluate`.

- `ply`: GnuBG numbering. `0` = net only, `1` = average over the opponent's 21 rolls and best replies, and so on. Default `0`. The engine rejects values above its cap (4) with `400`; until search lands, `1`–`4` also return `400` ("not implemented yet").
- `ply=0`: every legal play, each with the eval of the resulting position (opponent is STM).
- `ply>=1`: only candidates searched to the full depth. Moves dropped by the move filter are left out. Filter widths are engine defaults, not request params.
- One play per distinct resulting board. When several step orders reach the same board, the engine may report a different (equally legal) order than `game-engine`.
- Sorted best-first for the mover by negated `cubefulEquity` of the result. Exact ties break by `stepsKey`.
- `eval.source` is `"model"`. `cubefulEquity = cubeless.equity * cube.value`. `cubeAction` is always `null`.
- The search ignores the cube (fixed tensor constants) and `position.match`. Inner nodes maximise cubeless money equity. The arena ranks the returned candidates by mover MWC.
- FP32. Determinism is best effort.
- `400` on invalid JSON / position / dice / `ply`.

## Tests

doctest suite (`docker compose --profile test run --rm test`). Hand-written edge cases for the C++ board and move generation (bar entry and dancing, the higher-die rule, using both dice, partial doubles, bearing off, hits); expected plays are JSON step strings applied by an independent test helper. The featurizer must pass `training-ground/fixtures/features.json`. With the model mounted, the GPU forward pass must match the CPU reference within `1e-5`.
