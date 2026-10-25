# Hedgehog

Arena opponent for `battle-arena`. Locked by [ADR 0022](../decisions/0022-hedgehog-external.md). Position JSON stays the stored form ([board-representation.md](board-representation.md)). OGID exists only on this wire. Training dumps stay on bgweb-api.

The evaluation library is [eranlambooij/hedgehog-public](https://gitlab.com/eranlambooij/hedgehog-public) (MIT). The weight files on [hedgehog-bg.com/models/](https://hedgehog-bg.com/models/) are not MIT: the site licenses the WASM build and the open-weight networks for non-commercial use, with credit. Do not commit `.ogxf` files, and do not publish an image that contains one. There is no upstream image to `docker compose up` the way [gnubg.md](gnubg.md) uses `foochu/bgweb-api`.

## Strongest public net

[Benchmarks](https://hedgehog-bg.com/benchmarks) (0-ply, cubeful, 10M games, 2026-10-13): Aureus beats FOX, and both beat GnuBG. Colossus 2.0 is stronger and is not in the public model list. The strongest file that list serves, and that the MIT engine loads, is `aureus_v0.12_2026-09-26.ogxf`.

The public search stops at 2-ply. `ply` 2 is that search. `ply` 1 is the direct net eval of each successor. Default is 2.

Published nets do not emit a cubeful head. Arena plays store cubeless probabilities and `cubefulEquity: 0`. `cubeAction` stays `null`. Arena cube decisions stay on the shared infallible heuristic.

## Run the sidecar

From the repo root, this image clones the MIT engine, compiles [getmoves_server.cpp](../integrations/hedgehog/getmoves_server.cpp) into it, and downloads Aureus. Build it yourself. It is not a Compose service of this repo.

```sh
docker build -t hedgehog-getmoves docs/integrations/hedgehog
docker run --rm -p 8090:8090 hedgehog-getmoves
```

`GET /health` returns `{"ok":true,"model":"aureus_v0.12_2026-09-26.ogxf","maxPly":2}`.

`POST /v1/moves` body is `{"ogid":"...","ply":2}`. Each move is the successor OGID plus cubeless probabilities from the player who just moved (`win`, `gammon_win`, `bg_win`, `gammon_loss`, `bg_loss`, `equity`). `ply` above 2 is clamped.

FOX is the faster public net: `docker build --build-arg MODEL=fox_v0.34_2026-09-26.ogxf -t hedgehog-getmoves docs/integrations/hedgehog`.

## Our client

`ts-core/hedgehog` writes the OGID and joins successor boards back to our `steps`.

| Our JSON | OGID |
| --- | --- |
| `p1` (bears off toward 1) | Black. Bar is pip 25. |
| `p2` (bears off toward 24) | White. Bar is pip 0. |
| `onRoll: "p1"` | color field `W` (White reached, Black to move) |
| `onRoll: "p2"` | color field `B` |
| live centered cube | `N` + log2(value) + `N` |
| neither side `mayDouble`, value under 64 | owner `D` (dead) |
| value 64 | owner kept (`W` / `B`), exponent `6` |
| `match: null` | length `0`, scores `0` |
| Crawford | length like `7C` |
| dice set | state `R` and two dice digits |

Borne-off checkers are omitted. A successor is matched on the checker multiset, then kept as our steps. A forced pass comes back as that same board once, and the client keeps no steps. The play eval is the flip of the mover probabilities (result side to move), `source` `"hedgehog"`.

Arena (from `battle-arena/`, sidecar on the host):

```sh
docker compose --profile arena run --rm -e HEDGEHOG_BASE_URL=http://host.docker.internal:8090 arena npm run battle:inner -- --opponent hedgehog --matches 1 --seed 1 --length 7
```

`--ply 1` is the direct net. Default `--ply 2`. `host.docker.internal` is published on the arena service (`host-gateway`). The sidecar listens on port 8090.
