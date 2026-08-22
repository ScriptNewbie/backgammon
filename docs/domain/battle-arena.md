# Battle-arena

Locked by [ADR 0019](../decisions/0019-battle-arena.md). Match math: [match-play.md](match-play.md). Teacher conversion: [gnubg.md](gnubg.md). Engine HTTP: [game-engine.md](game-engine.md). Shared loop: `ts-core/sim`.

TypeScript tool that plays match-play between engine **drivers**. v1 is our `game-engine` vs the bgweb-api teacher, both at **max strength**.

From `battle-arena/` ([ADR 0011](../decisions/0011-docker-only.md)):

```sh
npm run up
npm test
npm run battle -- --matches 1 --seed 1 --length 7
npm run battle -- --matches 1 --seed 1 --no-cube
npm run down
npm run install:host
```

Those scripts wrap Docker Compose (`battle:inner` / `test:inner` run inside the container). `install:host` writes `node_modules` onto the host for IDE typechecking only. Requires `training-ground/checkpoints/cubeless.onnx` (mounted into the game-engine service).

## Per match

1. Assign seats: even index engine=`p1` / teacher=`p2`; odd index swapped.
2. Play games until a player’s score `>= length` (CLI `--length`, default 7; allowed `{1,3,5,7,9,11,13,15}`).
3. Both sides always pick the best checker play by **mover MWC** (tie-break: teacher `diff` when present, then stable `stepsKey`). Cube (default): infallible dead-cube action from `evaluateCube`. Skip cube on the opening roll of a game; skip at cube 64. **`--no-cube`:** never offer, take, or drop; `mayDouble` is false and the cube stays 1 (games play to bear-off / gammon / backgammon).
4. Write `battle-arena/replays/<batch-id>/<matchId>.sgf`. Print a summary of match wins (overall and by seat), games, and points when the batch finishes.

No skill levels. No training JSONL. Never commit `replays/`.

## Drivers

- **Teacher:** `POST /api/v1/getmoves` as in [gnubg.md](gnubg.md). Rank the returned list by mover MWC.
- **Game-engine:** `POST /evaluate` with the full position JSON (dice set). Re-rank by mover MWC; do not use the API’s money-equity order for match play.

Cube is not asked of either HTTP API.

## Replay SGF

Same GNU Backgammon encoding as [dump-format.md](dump-format.md) (`FF[4]`, `GM[6]`). `PW`/`PB` are `p1-game-engine` / `p2-teacher` (or swapped). `AP[battle-arena:1]`. Open in `replay-player` (file picker) or gnubg. Training ignores these files.
