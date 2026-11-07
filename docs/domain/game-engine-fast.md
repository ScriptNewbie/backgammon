# game-engine-fast

Locked by [ADR 0028](../decisions/0028-game-engine-fast.md). Status: `ply=0`–`4` work (move filters from 2-ply) and the `battle-arena` driver is wired (`--a game-engine-fast --a-ply N`). Tree expansion runs on all CPU threads; featurizing and the net run on the GPU. Move generation on the GPU and overlapping transfers with compute are not built yet. Bodies: [board-representation.md](board-representation.md), [evaluation.md](evaluation.md). Tensor: [features.md](features.md) (cube block fixed, [ADR 0029](../decisions/0029-fixed-cube-features.md)). Reference engine: [game-engine.md](game-engine.md).

CUDA C++ ply-search engine on the GPU, used as a `battle-arena` driver. Separate from `game-engine`; both are maintained. Model: `MODEL_PATH` (default `/models/cubeless-fast.onnx`) from `training-ground` (same weights as `cubeless.onnx`, dynamic batch `[N, 206]` → `cubeless` `[N, 5]`). Do not commit weights. Compose port **3001**.

The engine reads the weights straight from the ONNX file (no ONNX Runtime) and refuses any graph other than `Gemm(transB=1)` → `Relu` → … → `Gemm` → `Sigmoid` with input `features` and output `cubeless`. Inference is one cuBLAS SGEMM per layer in plain FP32 (no TF32). Internally the board is side-to-move relative: each player's checkers in its own numbering, 0 = off, 25 = bar.

## `GET /health`

`200` `{ "ok": true }`.


## `POST /evaluate?ply=N`

Body and response shape are the same as `game-engine` `POST /evaluate`.

- `ply`: GnuBG numbering. `0` = net only, `1` = average over the opponent's 21 rolls and best replies, and so on. Default `0`. Values above the cap (4) return `400`.
- `ply=0` and `ply=1`: every legal play, each with the eval of the resulting position (opponent is STM).
- `ply>=2`: only the plays that pass the root filter, each searched to the full depth, plus any play that ends the game (exact). Filters are engine defaults, not request params.
- One play per distinct resulting board. When several step orders reach the same board, the engine may report a different (equally legal) order than `game-engine`.
- Sorted best-first for the mover by negated `cubefulEquity` of the result. Exact ties break by `stepsKey`.
- `eval.source` is `"model"`. `cubefulEquity = cubeless.equity * cube.value`. `cubeAction` is always `null`.
- The search ignores the cube (fixed tensor constants) and `position.match`. Inner nodes maximise cubeless money equity. The arena ranks the returned candidates by mover MWC.
- FP32. Determinism is best effort.
- `400` on invalid JSON / position / dice / `ply`.

## Search

Expectimax over dice. For a position with the side to move about to roll, searched `d` plies:

- `d = 0`: the net.
- `d = 1`: for each of the 21 rolls (weight 1/36 doubles, 2/36 otherwise) the mover picks the play whose resulting position has the highest 0-ply **cubeless money equity** for the mover.
- `d >= 2`: for each roll, rank the plays at 0-ply, keep the **inner filter**'s survivors, search those at `d - 1`, and pick the best survivor. Dropped plays take no part.
- A play that ends the game uses exact probabilities. A roll with no legal play passes the turn. The value is the weighted average of the five **probabilities** (not of equity).

Move filters (`src/search.hpp`) keep the 0-ply best and then up to `maxKeep` in total within `threshold` equity of it, gnubg style:

| Filter | Where | Default |
| --- | --- | --- |
| Root | which root plays are searched to full depth at `ply >= 2` | 8 within 0.16 |
| Inner | replies kept per roll at depth `>= 2` | 1 (the 0-ply best, as gnubg) |

A request runs in rounds: expand the tree, send every new leaf board to the GPU (chunks of 131,072), apply the filters that were waiting on those values, expand the survivors, repeat; then back the values up.

- **Threads.** Each round's work (root boards, then pending filter entries) is split into contiguous chunks run on a pool of `SEARCH_THREADS` threads (default: all hardware threads). A chunk builds into its own arena with its own leaf dedupe; arenas are appended to the tree in chunk order, so the result does not depend on the thread count. Leaves are deduplicated within a chunk only.
- **GPU.** The net receives 52-byte boards, not 824-byte feature vectors; a kernel featurizes them (the same `featurize` code as the CPU), then one cuBLAS SGEMM per layer.
- **Log.** The server log shows `nodes`, `leaves=<distinct>/<visits>`, `rounds`, and the time in expand, merge, net, and backup per request.

Opening position on an RTX 5070 and 12 CPU threads:

| ply | distinct leaves | time per request |
| --- | --- | --- |
| 1 | 3k–21k | 1–7 ms |
| 2 | 12k–66k | 10–21 ms |
| 3 | 0.2M–1.2M | 47–240 ms |
| 4 | 4.9M–25M | 1.4–7 s (about 1.2 GB RAM) |

At 4-ply the net (strict FP32 plus synchronous copies, about 100 batches in a row) is about half the time and merging the arenas about a fifth.

## Tests

doctest suite (`docker compose --profile test run --rm test`). Hand-written edge cases for the C++ board and move generation (bar entry and dancing, the higher-die rule, using both dice, partial doubles, bearing off, hits); expected plays are JSON step strings applied by an independent test helper. The featurizer must pass `training-ground/fixtures/features.json`. With the model mounted, the GPU forward pass must match the CPU reference within `1e-5`. The batched search must match a plain recursive reference with its own copy of the filter rule (one net call per leaf, no tree storage, dedupe, or rounds) at 1-ply and 2-ply on contact positions (inner keep 1 and 3) and 2- and 3-ply on a race, using an asymmetric fake net so perspective flips are checked. At `ply=2` the returned plays must be exactly the root-filter survivors. Results must be bit-identical with 1 and 8 threads, and the GPU featurize path must match the CPU reference on about 7k real positions.
