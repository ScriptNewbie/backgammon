# battle-arena

TypeScript. Play our game-engine against the bgweb-api teacher at max strength ([ADR 0019](../../docs/decisions/0019-battle-arena.md)).

- Loop: `docs/domain/battle-arena.md`, `ts-core/sim`. Rank checkers by mover MWC. Shared infallible cube heuristic (`--no-cube` disables it). Alternate seats.
- Drivers: `POST /evaluate` (re-rank; do not use money-equity order) and teacher `getmoves`.
- SGF under gitignored `battle-arena/replays/`. No training JSONL. Open in replay-player or gnubg.
- Docker only, from `battle-arena/`: `npm run up`, `npm test`, `npm run battle -- --matches 1 --seed 1`, `npm run down`, `npm run install:host`. Do not run `battle:inner` / `test:inner` on the host. Requires `training-ground/checkpoints/cubeless.onnx`.
