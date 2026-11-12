# Battle-arena

Locked by [ADR 0019](../decisions/0019-battle-arena.md), [ADR 0023](../decisions/0023-arena-any-driver.md), [ADR 0025](../decisions/0025-xg-gui-sidecar.md), [ADR 0028](../decisions/0028-game-engine-fast.md), [ADR 0030](../decisions/0030-hedgehog-plays-itself.md), [ADR 0031](../decisions/0031-gnubg-cli-sidecar.md), and [ADR 0032](../decisions/0032-engines-own-decisions.md). Match math: [match-play.md](match-play.md). GNU Backgammon sidecar: [gnubg.md](gnubg.md). Engine HTTP: [game-engine.md](game-engine.md), [game-engine-fast.md](game-engine-fast.md). Shared loop: `ts-core/sim`.

TypeScript tool that plays match-play between two drivers, both at **max strength**. Default is our `game-engine` vs GNU Backgammon (`gnubg`). Either side may be `game-engine`, `game-engine-fast`, `gnubg`, `hedgehog`, or `xg` (`teacher` is accepted as an old name for `gnubg`, with a warning), including the same driver on both sides.

From `battle-arena/` ([ADR 0011](../decisions/0011-docker-only.md)). Host commands: [README.md](../../README.md).

```sh
docker compose up -d
docker compose --profile test run --rm test
docker compose --profile arena run --rm arena npm run battle:inner -- --matches 1 --seed 1 --length 7
docker compose --profile arena run --rm arena npm run battle:inner -- --matches 1 --seed 1 --no-cube
docker compose --profile arena run --rm arena npm run battle:inner -- --a game-engine --b hedgehog --b-ply 0 --matches 1 --seed 1
docker compose --profile arena run --rm arena npm run battle:inner -- --a hedgehog --a-ply 0 --b hedgehog --b-ply 1 --matches 1 --seed 1
docker compose --profile arena run --rm -e XG_BASE_URL=http://host.docker.internal:8091 arena npm run battle:inner -- --a game-engine --b xg --matches 1 --seed 1 --length 1
docker compose up -d game-engine-fast
docker compose --profile arena run --rm arena npm run battle:inner -- --a game-engine-fast --a-ply 0 --b game-engine --matches 1 --seed 1
docker compose down
docker compose --profile install-host run --rm install-host
```

`battle:inner` / `test:inner` run inside the container. `install-host` writes `node_modules` onto the host for IDE typechecking only. A `game-engine` side needs `training-ground/checkpoints/cubeless.onnx` (mounted into the game-engine service). A `game-engine-fast` side needs an NVIDIA GPU and `cubeless-fast.onnx`; its service is opt-in (`docker compose up -d game-engine-fast`, profile `fast`) and shares the `game-engine-fast` build volume, so Compose warns that the volume belongs to the other project. The warning is harmless.

## Per match

1. Two sides, `a` (`--a`) and `b` (`--b`). Even index: a=`p1`, b=`p2`. Odd index: swapped.
2. Play games until a player’s score `>= length` (CLI `--length`, default 7; allowed `{1,3,5,7,9,11,13,15}`).
3. Every side plays its engine's own decisions ([ADR 0032](../decisions/0032-engines-own-decisions.md)): its engine's top checker play at the real cube, score, and Crawford state, and its engine's offer (doubler) and take (taker), each side asking its own engine. The arena never re-ranks a play or computes a cube decision. It only decides when a cube question is asked: never on the opening roll of a game, in the Crawford game, or at cube 64. **`--no-cube`:** never offer, take, or drop; `mayDouble` is false and the cube stays 1 (games play to bear-off / gammon / backgammon).
4. Write `battle-arena/replays/<batch-id>/<matchId>.sgf`. The batch id names both sides (`game-engine-vs-gnubg-ply2`, `hedgehog-ply0-vs-hedgehog-ply1`). Print a summary of match wins (overall and by seat), games, and points when the batch finishes.

No skill levels. No training JSONL. Never commit `replays/`.

## Drivers

Each side has its own URL (`--a-url`, `--b-url`). Defaults: `ENGINE_BASE_URL` or `http://127.0.0.1:3000`, `FAST_ENGINE_BASE_URL` or `http://127.0.0.1:3001`, `GNUBG_BASE_URL` or `http://127.0.0.1:8080`, `HEDGEHOG_BASE_URL` or `http://127.0.0.1:8090`, `XG_BASE_URL` or `http://127.0.0.1:8091`. Health-check only the sides that play (one check per driver and URL).

- **GNU Backgammon (`gnubg`):** the CLI sidecar in [gnubg.md](gnubg.md) ([ADR 0031](../decisions/0031-gnubg-cli-sidecar.md)), the `gnubg` Compose service. gnubg's top checker play with its own move filter at the real cube, score, and Crawford state (not re-ranked), and gnubg's own offer and take. `ply` is GnuBG 0-4 (default 2, GnuBG world class, the depth bgweb-api effectively played at) for checker play and cube. Labels dumps too, through `move-dumper`.
- **Hedgehog:** the sidecar in [hedgehog.md](hedgehog.md) ([ADR 0030](../decisions/0030-hedgehog-plays-itself.md)). Hedgehog's top checker play at the cube and score (not re-ranked), and Hedgehog's own offer and take. `ply` is GnuBG 0 or 1 (default 1), for checker play and cube. Not a dump source.
- **Game-engine:** `POST /evaluate` with the full position JSON (dice set); plays `moves[0]`, which the engine orders by mover MWC at the score ([game-engine.md](game-engine.md)). Offer and take from the engine's `POST /cube` on the position with the doubler on roll, cached per position.
- **Game-engine-fast:** the GPU engine in [game-engine-fast.md](game-engine-fast.md). Same `POST /evaluate` and `POST /cube` as game-engine plus `?ply=N` on both, so checker play and cube use the same search depth. `ply` is GnuBG 0–4 (default 0).
- **XG:** eXtreme Gammon 2 through the host GUI sidecar in [xg.md](xg.md). XG's top checker play (not re-ranked), and XG's own offer and take. Analysis level is whatever is set in XG. Not a dump source.

Parameters are per side. A driver applies a parameter only when it supports it. `ply` is gnubg (0–4), hedgehog (0–1), and game-engine-fast (0–4); the CLI accepts integers 0–4 and a value above the side's driver maximum is an error. Setting `--a-ply` or `--b-ply` on `game-engine` or `xg` drops that value and prints a warning. Each side's cube questions go to that side's own engine only.

## Replay SGF

Same GNU Backgammon encoding as [dump-format.md](dump-format.md) (`FF[4]`, `GM[6]`). `PW`/`PB` are `p1-<label>` / `p2-<label>`, where the label is the driver (`game-engine`, `gnubg-ply2`, `hedgehog-ply1`, `game-engine-fast-ply2`). `AP[battle-arena:1]`. Open in `gui` (file picker) or gnubg. Training ignores these files.
