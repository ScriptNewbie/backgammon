# 0030 Hedgehog plays its own checker and cube decisions

- Status: accepted
- Date: 2026-11-12
- Amends: the checker rank and shared cube in [0022](0022-hedgehog-external.md) and [0023](0023-arena-any-driver.md), for the `hedgehog` driver only

## Context

The `hedgehog` side used to send the sidecar every legal play and re-rank the returned cubeless probabilities by our mover MWC. Its cube came from our shared infallible heuristic. So the arena measured Hedgehog's net inside our decision rules, not the Hedgehog engine.

The MIT engine ([hedgehog-public](https://gitlab.com/eranlambooij/hedgehog-public)) has its own decision rules: a match-play checker currency (`match_emg_equity`, priced through its Rockwell-Kazaross MET), a score-aware community search, and money and match cube decisions (`cube_evaluate_double_capped`, `cube_evaluate_double_match_capped`, and the matching take functions). They cover Crawford, post-Crawford, a dead cube, and the score gates on doubling. [0025](0025-xg-gui-sidecar.md) already lets `xg` play its own decisions.

## Decision

- The `hedgehog` side plays Hedgehog's decisions, the way the engine makes them at the cube, score, and Crawford state in the OGID. Our code does not re-rank the plays or override the cube.
- Checker play: `POST /v1/moves` returns every play best first, ranked by `match_emg_equity` at the mover's score and cube value (money equity for money play). Interior search choices use `eval_equity_match` at the same score. The client plays the first move. A response that is not best first, or has no `match_equity`, fails the match.
- Cube: `POST /v1/cube` takes the OGID with the doubler on roll and no dice. It returns the engine's offer for the doubler and its take for the taker, using the engine's default Janowski efficiency, a 64 cap, and Jacoby off. A dead cube (OGID owner `D`) never doubles. The `hedgehog` side ignores `cubeEval.infallible*`. The other side keeps its own cube rule. `--no-cube`, Crawford, the opening roll, and cube 64 still skip the cube in the shared loop.
- `ply` stays GnuBG 0 or 1 per side and applies to checker and cube searches.
- The sidecar reports `api: 2` on `/health`. The client refuses any other version, so an old image fails at the health check instead of mid-match.
- The Dockerfile pins the hedgehog-public commit the sidecar was written against.

Licensing (unchanged from 0022, restated because this change calls more of the engine):

- The repo holds only our own sidecar source, which calls the engine's public headers, and a Dockerfile that clones the engine at build time. No engine source, MET table, or `.ogxf` weights are copied in. Do not port Hedgehog code or tables into `ts-core` or any other package.
- Third-party code in the image: hedgehog-public is MIT, its OGID/OGXM spec documents are CC BY 4.0, its vendored Highway library is Apache-2.0 or BSD-3, and cpp-httplib is MIT. None of these is copyleft.
- The `.ogxf` weights are licensed for non-commercial use with credit. Build the image locally and never publish it.
- Hedgehog output never reaches training. No dumps, labels, distillation targets, tuning sets, or evaluation-set curation come from Hedgehog moves, evals, or arena games that involve it. `training-ground` reads only `move-dumper` dumps ([0012](0012-training-data-layout.md)), and `battle-arena/replays/` stays uncommitted and ignored by training.

## Consequences

The arena compares our engine with Hedgehog as its MIT engine plays, not with Hedgehog's net under our rules. Hedgehog's commercial product has more than the public engine: per-class cube efficiency, a cube tree search, learned cubeful heads, and Colossus. The arena does not measure any of those.

Existing sidecar images must be rebuilt. `createCheckerDriver` (MWC re-rank, shared cube) is now the teacher's driver only. Spec: [hedgehog.md](../domain/hedgehog.md), [battle-arena.md](../domain/battle-arena.md).
