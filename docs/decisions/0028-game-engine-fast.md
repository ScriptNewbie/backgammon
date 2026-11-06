# 0028 game-engine-fast: GPU ply-search engine as a separate package

- Status: accepted
- Date: 2026-11-06
- Amends: [0014](0014-export-onnx-and-pte.md) (third export artifact), [0023](0023-arena-any-driver.md) (new driver; `ply` beyond 0 / 1)

## Context

`game-engine` scores each legal play with one net call (0-ply). We want deep ply search that uses the RTX 5070 (CUDA), which needs batches of tens of thousands of positions, move generation fast enough to feed them, and eventually GPU kernels. Rewriting `game-engine` would supersede [0004](0004-game-engine-typescript-onnx.md) and [0017](0017-hono.md) and put the GUI and every existing client at risk. The exported `cubeless.onnx` / `.pte` are also consumed by a project outside this repo, so their contract must not change.

## Decision

- **Package.** A seventh top-level package, `game-engine-fast/`, with its own Dockerfile (CUDA base image, `gpus: all`) and Compose file. `game-engine` stays as it is (TypeScript, Hono, `onnxruntime-node`). Both engines are maintained. `game-engine-fast` is an arena driver only, for now; a later ADR may promote it.
- **Language.** CUDA C++ throughout: kernels in `.cu`, host code in C++20. Board and move generation are shared `__host__ __device__` code. Early net inference may go through ONNX Runtime's C++ API with the CUDA execution provider.
- **Net artifact.** `training-ground` also writes `cubeless-fast.onnx` from the same `nn.Module` and weights: dynamic batch dimension, input `features` `[N, 206]`, output `cubeless` `[N, 5]`. `cubeless.onnx` and `cubeless.pte` are unchanged (batch 1). Not committed.
- **Wire contract.** Same as `game-engine`: `GET /health`, `POST /evaluate` with a position JSON body and the `{ moves: [{ steps, eval }] }` response. Search params go in the query string (`?ply=N`). `eval.source` is `"model"`. `cubefulEquity = cubeless.equity * cube.value`; `cubeAction` is always `null`.
- **Which moves come back.** At `ply=0` every legal play. At `ply >= 1` only the candidates searched to the full requested depth (moves eliminated by the move filter are left out), so the arena's MWC re-rank only compares evals of the same depth.
- **No cube.** The engine has no cube logic. The arena's shared infallible cube heuristic decides, as for other drivers. Cube features go to the net as fixed constants ([0029](0029-fixed-cube-features.md)).
- **Search objective.** Inner nodes maximise cubeless money equity. `position.match` is ignored inside the tree; the arena ranks root candidates by mover MWC. Score-dependent gammon values are a possible later upgrade.
- **Search config.** Fixed depth only, no time budget. `ply` uses GnuBG numbering (0 = net only, 1 = average over the opponent's replies). It is the only knob, from 0 up to a cap enforced by the engine (initially 4). Move filters are engine defaults. Arena label: `game-engine-fast-ply<N>`.
- **Precision.** FP32. Determinism is best effort; exact ties break by `stepsKey` like `game-engine`.
- **Correctness.** The C++ board and move generation get their own hand-written edge-case tests (reviewed against the rules), not a parity harness against TypeScript. The C++ featurizer must pass `training-ground/fixtures/features.json`. `ts-core/sim` does not add a legality check.
- **Throughput.** The arena stays sequential for now. Arena concurrency plus engine-side request batching is a planned follow-up.

## Consequences

AGENTS.md lists seven packages. Spec: [game-engine-fast.md](../domain/game-engine-fast.md). When the package lands: add its README section, a `.cursor/rules/game-engine-fast.mdc` rule with `.grok/` copy and `.claude/` pointer, the `game-engine-fast` driver and its `ply` range in `battle-arena` and [battle-arena.md](../domain/battle-arena.md), and the `cubeless-fast.onnx` export in the `train-model` skill.

At `ply >= 1` the response no longer lists every legal play; a `pruned` flag on moves may be added later instead. Match play inside the tree is approximate. Low-ply arena runs underuse the GPU until arena concurrency lands. The GUI keeps using `game-engine`.
