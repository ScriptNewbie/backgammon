# Battle-arena

Locked by [ADR 0019](../decisions/0019-battle-arena.md) and [ADR 0023](../decisions/0023-arena-any-driver.md). Match math: [match-play.md](match-play.md). Teacher conversion: [gnubg.md](gnubg.md). Engine HTTP: [game-engine.md](game-engine.md). Shared loop: `ts-core/sim`.

TypeScript tool that plays match-play between two drivers, both at **max strength**. Default is our `game-engine` vs the bgweb-api teacher. Either side may be `game-engine`, `teacher`, or `hedgehog`, including the same driver on both sides.

From `battle-arena/` ([ADR 0011](../decisions/0011-docker-only.md)). Host commands: [README.md](../../README.md).

```sh
docker compose up -d
docker compose --profile test run --rm test
docker compose --profile arena run --rm arena npm run battle:inner -- --matches 1 --seed 1 --length 7
docker compose --profile arena run --rm arena npm run battle:inner -- --matches 1 --seed 1 --no-cube
docker compose --profile arena run --rm arena npm run battle:inner -- --a game-engine --b hedgehog --b-ply 0 --matches 1 --seed 1
docker compose --profile arena run --rm arena npm run battle:inner -- --a hedgehog --a-ply 0 --b hedgehog --b-ply 1 --matches 1 --seed 1
docker compose down
docker compose --profile install-host run --rm install-host
```

`battle:inner` / `test:inner` run inside the container. `install-host` writes `node_modules` onto the host for IDE typechecking only. A `game-engine` side needs `training-ground/checkpoints/cubeless.onnx` (mounted into the game-engine service).

## Per match

1. Two sides, `a` (`--a`) and `b` (`--b`). Even index: a=`p1`, b=`p2`. Odd index: swapped.
2. Play games until a player’s score `>= length` (CLI `--length`, default 7; allowed `{1,3,5,7,9,11,13,15}`).
3. Both sides always pick the best checker play by **mover MWC** (tie-break: teacher `diff` when present, then stable `stepsKey`). Cube (default): infallible dead-cube action from `evaluateCube`. Skip cube on the opening roll of a game; skip at cube 64. **`--no-cube`:** never offer, take, or drop; `mayDouble` is false and the cube stays 1 (games play to bear-off / gammon / backgammon).
4. Write `battle-arena/replays/<batch-id>/<matchId>.sgf`. The batch id names both sides (`game-engine-vs-teacher`, `hedgehog-ply0-vs-hedgehog-ply1`). Print a summary of match wins (overall and by seat), games, and points when the batch finishes.

No skill levels. No training JSONL. Never commit `replays/`.

## Drivers

Each side has its own URL (`--a-url`, `--b-url`). Defaults: `ENGINE_BASE_URL` or `http://127.0.0.1:3000`, `BGWEB_BASE_URL` or `http://127.0.0.1:8080`, `HEDGEHOG_BASE_URL` or `http://127.0.0.1:8090`. Health-check only the sides that play (one check per driver and URL).

- **Teacher:** `POST /api/v1/getmoves` as in [gnubg.md](gnubg.md). Rank the returned list by mover MWC.
- **Hedgehog:** the sidecar in [hedgehog.md](hedgehog.md), ranked by mover MWC. `ply` is GnuBG 0 or 1 (default 1). Not a dump source.
- **Game-engine:** `POST /evaluate` with the full position JSON (dice set). Re-rank by mover MWC; do not use the API’s money-equity order for match play.

Parameters are per side. A driver applies a parameter only when it supports it. `ply` is hedgehog only. Setting `--a-ply` or `--b-ply` on `game-engine` or `teacher` drops that value and prints a warning. Cube is not asked of any HTTP API.

## Replay SGF

Same GNU Backgammon encoding as [dump-format.md](dump-format.md) (`FF[4]`, `GM[6]`). `PW`/`PB` are `p1-<label>` / `p2-<label>`, where the label is the driver (`game-engine`, `teacher`, `hedgehog-ply1`). `AP[battle-arena:1]`. Open in `replay-player` (file picker) or gnubg. Training ignores these files.
