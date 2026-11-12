# Hedgehog

Arena opponent for `battle-arena`. Locked by [ADR 0022](../decisions/0022-hedgehog-external.md). Decisions are the engine's own ([ADR 0030](../decisions/0030-hedgehog-plays-itself.md)). Position JSON stays the stored form ([board-representation.md](board-representation.md)). OGID exists only on this wire. Training dumps stay on bgweb-api.

## Licensing

| Part | Licence | Rule here |
| --- | --- | --- |
| [hedgehog-public](https://gitlab.com/eranlambooij/hedgehog-public) engine | MIT | Cloned at image build time, pinned commit. Never copied into this repo. |
| Its OGID / OGXM spec documents | CC BY 4.0 | Read only. |
| Its vendored Highway SIMD library | Apache-2.0 or BSD-3 | Inside the image only. |
| [cpp-httplib](https://github.com/yhirose/cpp-httplib) | MIT | Downloaded at image build time. |
| [getmoves_server.cpp](../integrations/hedgehog/getmoves_server.cpp) | this repo | Our code. Calls the engine's public headers. |
| `.ogxf` weights from [hedgehog-bg.com/models/](https://hedgehog-bg.com/models/) | non-commercial use, with credit | Downloaded at image build time. Never committed. Never publish the image. |

There is no copyleft in the sidecar. Do not port Hedgehog code or tables (MET, cube formulas) into `ts-core` or any other package; call the sidecar.

Hedgehog output never reaches training: no dumps, labels, distillation targets, tuning sets, or evaluation-set curation from Hedgehog moves, evals, or arena games that involve it. `training-ground` reads only `move-dumper` dumps, and `battle-arena/replays/` is never committed or read by training.

## Strongest public net

[Benchmarks](https://hedgehog-bg.com/benchmarks) (0-ply, cubeful, 10M games, 2026-10-13): Aureus beats FOX, and both beat GnuBG. Colossus 2.0 is stronger and is not in the public model list. The strongest file that list serves, and that the MIT engine loads, is `aureus_v0.12_2026-09-26.ogxf`.

The public search stops at GnuBG 1-ply. `ply` 0 is the direct net eval. `ply` 1 is the one-roll community search. Default is 1.

## What the engine decides

The sidecar makes every `hedgehog` decision with the public engine's own rules, at the cube, score, and Crawford state in the OGID. Our code does not re-rank or override them.

- **Checker play:** each successor is valued from the mover's side (`ply` 1 searches one opponent roll past it, with interior choices by `eval_equity_match` at the score). Plays are ranked best first by `match_emg_equity` at the mover's score and cube value, which is money cubeless equity in a money game. The client plays the first.
- **Cube:** the position with the doubler on roll is valued (`ply` 1 averages the doubler's own roll). Offer is `cube_evaluate_double_match_capped` at a match score, or `cube_evaluate_double_capped` for money (Jacoby off). Take is `cube_should_take_match_capped` / `cube_should_take_capped` from the taker's seat. Both use the engine's default Janowski efficiency (0.68) and the 64 cap. The engine gates doubling on ownership, the Crawford game, the post-Crawford leader, and a cube that already wins the match. A dead cube (owner `D`) never doubles.

The public build does not have Hedgehog's commercial extras: per-class cube efficiency, cube tree search, learned cubeful heads, and Colossus. Arena plays still store cubeless probabilities and `cubefulEquity: 0`, and `cubeAction` stays `null` on the play eval.

## Run the sidecar

From the repo root, this image clones the MIT engine at the pinned commit, compiles [getmoves_server.cpp](../integrations/hedgehog/getmoves_server.cpp) into it, and downloads Aureus. Build it yourself. It is not a Compose service of this repo. Rebuild after pulling a change to the sidecar.

```sh
docker build -t hedgehog-getmoves docs/integrations/hedgehog
docker run --rm -p 8090:8090 hedgehog-getmoves
```

`GET /health` returns `{"ok":true,"model":"aureus_v0.12_2026-09-26.ogxf","maxPly":1,"api":2}`. The client refuses any `api` other than 2, so an older image fails the health check. The server is cpp-httplib v0.63.0. It keeps accepting connections during a search, and `/health` answers while a search is in progress. Searches share one model context, so a second request waits.

`POST /v1/moves` body is `{"ogid":"...","ply":1}`, with dice in the OGID. Ply is GnuBG's: 0 is the net, 1 is one roll; outside 0..1 is clamped. Moves come back best first. Each is the successor OGID plus cubeless probabilities from the player who just moved (`win`, `gammon_win`, `bg_win`, `gammon_loss`, `bg_loss`), `equity` (cubeless money), and `match_equity` (the ranking key).

`POST /v1/cube` body is `{"ogid":"...","ply":1}`, with the doubler on roll and no dice (state `C`). It returns `offer` (`double` / `no-double`), `take` (`take` / `drop`), `available` (the engine allows a double here), `action` (engine wording), the three decision values `no_double` / `double_take` / `double_pass` in `currency` (`mwc` at a match score, `equity` for money), and the doubler's probabilities.

FOX is the faster public net: `docker build --build-arg MODEL=fox_v0.34_2026-09-26.ogxf -t hedgehog-getmoves docs/integrations/hedgehog`.

## Our client

`ts-core/hedgehog` writes the OGID, joins successor boards back to our `steps`, and asks for the cube.

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
| no dice | state `C`, empty dice field |

Borne-off checkers are omitted. A successor is matched on the checker multiset, then kept as our steps. A forced pass comes back as that same board once, and the client keeps no steps. The play eval is the flip of the mover probabilities (result side to move), `source` `"hedgehog"`. Moves not best first, or without `match_equity`, fail the match. `chooseChecker` returns the first play. `cubeAction` returns the offer and take, cached per OGID so a double and its answer cost one query.

Arena (from `battle-arena/`, sidecar on the host):

```sh
docker compose --profile arena run --rm -e HEDGEHOG_BASE_URL=http://host.docker.internal:8090 arena npm run battle:inner -- --a game-engine --b hedgehog --matches 1 --seed 1 --length 7
```

`--b-ply 0` is the direct net on that side, for checker play and cube. Default ply is 1. `host.docker.internal` is published on the arena service (`host-gateway`). The sidecar listens on port 8090. Both sides may be hedgehog, each with its own `--a-url` / `--b-url` and `--a-ply` / `--b-ply`. A driver other than hedgehog or game-engine-fast ignores `ply` and warns.
