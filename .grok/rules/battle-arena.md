# battle-arena

TypeScript. Play our game-engine against the bgweb-api teacher at max strength ([ADR 0019](../../docs/decisions/0019-battle-arena.md)).

- Loop: `docs/domain/battle-arena.md`, `ts-core/sim`. Rank checkers by mover MWC (`RankedPlay.rankScore`). Shared infallible cube heuristic (`--no-cube` disables it). Alternate seats.
- Drivers: `POST /evaluate` (re-rank; do not use money-equity order) and teacher `getmoves`. `--opponent hedgehog` is an arena opponent via the external sidecar (`docs/domain/hedgehog.md`); do not vendor the engine or `.ogxf` weights, and do not label dumps from it.
- SGF under gitignored `battle-arena/replays/`. No training JSONL. Open in replay-player or gnubg.
- Docker only, from `battle-arena/`. Host commands: [README.md](../../README.md). Do not run `battle:inner` / `test:inner` on the host. Requires `training-ground/checkpoints/cubeless.onnx`.
