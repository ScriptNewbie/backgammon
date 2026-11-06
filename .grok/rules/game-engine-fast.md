# game-engine-fast

CUDA C++ ply-search engine on the GPU ([ADR 0028](../../docs/decisions/0028-game-engine-fast.md)). Separate from `game-engine`; both are maintained. Arena driver only.

- Contract: `docs/domain/game-engine-fast.md` (same `/evaluate` body and response as `docs/domain/game-engine.md`, plus `?ply=N`). Bodies: `docs/domain/board-representation.md`, `docs/domain/evaluation.md`.
- Tensor: `docs/domain/features.md`; cube block fixed ([ADR 0029](../../docs/decisions/0029-fixed-cube-features.md)). Must pass `training-ground/fixtures/features.json`.
- Model: `cubeless-fast.onnx` (dynamic batch) from `training-ground`. Weights are read from the ONNX file; no ONNX Runtime. Do not commit weights.
- No cube logic: `cubeAction` is always `null`, `cubefulEquity = equity * cube.value`. Search ignores `position.match`. At `ply >= 1` return only fully searched candidates.
- FP32, best-effort determinism. Board/movegen code stays plain data with `BG_HD` so it can run in kernels.
- Rules correctness comes from the package's own hand-written tests, not a parity harness against TypeScript.
- Docker only, from `game-engine-fast/`. Host commands: [README.md](../../README.md) (http://localhost:3001). Builds go to the `game_engine_fast_build` volume. Do not install CUDA, CMake, or a compiler on the host.
