# move-dumper simulation

Locked by [ADR 0007](../decisions/0007-skill-levels-and-pairing.md), [ADR 0009](../decisions/0009-dump-metadata-and-sgf.md), [ADR 0020](../decisions/0020-dumper-games-no-cube.md), and [ADR 0031](../decisions/0031-gnubg-cli-sidecar.md). Teacher: [gnubg.md](gnubg.md). Files: [dump-format.md](dump-format.md). Battle-arena / engine match math (not dumper policy): [match-play.md](match-play.md).

Simulates independent money games, labels every checker play with GNU Backgammon (the `gnubg` sidecar), and writes JSONL plus GNU Backgammon SGF. The game loop lives in `ts-core/sim` (`playGame`); this package adds skill sampling and dump I/O. There is **no doubling-cube policy**.

From `move-dumper/` ([ADR 0011](../decisions/0011-docker-only.md)). Host commands: [README.md](../../README.md).

```sh
docker compose up -d
docker compose --profile test run --rm test
docker compose --profile dumper run --rm dumper npm run dump:inner -- --games 1 --seed 1
docker compose --profile dumper run --rm dumper npm run dump:inner -- --games 1 --seed 1 --ply 1 --label-filter all
docker compose down
docker compose --profile install-host run --rm install-host
```

`dump:inner` / `test:inner` run inside the container. `install-host` writes `node_modules` onto the host for IDE typechecking only.

## Per game

1. Sample an unordered level pair from the weights below; randomly assign `p1` / `p2`. Each game has its own RNG for this, its dice, and its plays.
2. Play one game to bear-off via `playGame({ allowCube: false })`. No match score, no Crawford cycle, no cube offer/take/drop.
3. Write `replay/<gameId>.sgf`. Records for that game are committed to `records.jsonl.gz` first, together (one gzip member per game), so a crash keeps finished games readable.

Teacher queries retry on disconnect / 5xx until the sidecar returns. SIGINT/SIGTERM finish the games in progress and start no new one (`gzip.end` + manifest). Do not kill `-9` if you want the last member closed.

Seed the RNG; store `seed` on the batch manifest. Game i is seeded by the i-th draw from `seed`, so the games of a batch depend only on `seed`, not on `--concurrency`.

`--concurrency N` (default 1) plays N games at once, each asking the sidecar for its own labels; up to the sidecar's `GNUBG_WORKERS` (one per CPU by default) keeps every gnubg process busy. Games commit in the order they finish, so records of different games are not in game-index order; each game's records stay together. A game that fails stops the batch: the games in flight finish, and the error is reported.

## Opening a game

Reset the board to the standard opening. Cube is dead: `value` 1, `owner` `"centered"`, `mayDouble` both false. `match` is `null` ([ADR 0020](../decisions/0020-dumper-games-no-cube.md)). GNU SGF may still use a 1-point `MI` header for gnubg; that is not `Position.match`. Each side rolls one die; ties reroll; higher is on roll with those two dice (opening is never doubles).

Later turns: roll both dice. Never consult cube.

## Checker ply

1. One gnubg `hint` for every legal play at `--ply` (default 2) with `--label-filter` (default `gnubg`, GnuBG world class as bgweb-api labelled; `all` searches every play at `--ply`), evaluated **cubeless** as a money game ([gnubg.md](gnubg.md), [ADR 0036](../decisions/0036-cubeless-teacher-labels.md)). A dance skips the query.
2. Clamp each play's probabilities to a consistent set (`src/labels.ts`): `0 <= backgammon <= gammon <= win <= 1` and `0 <= loseBackgammon <= loseGammon <= 1 - win`, then recompute `equity`. gnubg rounds each printed probability on its own, which can break those bounds by about 1e-6. Steps 3 and 4 use the clamped values.
3. Append a `decision: "checker"` record with **all** legal plays and teacher evals.
4. Sample `chosen` with the on-roll level (below). Infallible plays gnubg's own first line ([ADR 0032](../decisions/0032-engines-own-decisions.md)); the softmax levels weight by **negated result cubeless equity** (`-eval.cubeless.equity` of the teacher result, which is STM of the result). Store that as `RankedPlay.rankScore` (higher is better). Do not rank by MWC or cubeful equity. Do not import `ts-core/match`. Loop: `src/games.ts`.
5. Apply `chosen.steps` to the position JSON (hits implied). The dumped move list is gnubg's, matched one-to-one onto our legal plays.
6. If a player has 15 off: the game is over (single / gammon / backgammon for SGF `RE` only). Next game is independent.

Gammon: loser has 0 off. Backgammon: loser has 0 off **and** a checker on the bar or in the winner’s home (p1 home 1–6, p2 home 19–24).

No resignations in v1. Play to bear-off.

## Levels

| Level | Checker play |
| --- | --- |
| noob | Uniform over legal plays |
| beginner | Softmax on negated cubeless equity, τ = 0.08 |
| midwit | τ = 0.025 |
| genius | τ = 0.008 |
| infallible | gnubg's own first line (`plays[0]`, gnubg's order: cubeless money equity at its ply and filter) |

`P(i) ∝ exp(equity_i / τ)` with equity = `-result.cubeless.equity`. τ is the same numeric family as ADR 0007.

## Pairing weights (default)

Unordered pair keys, names sorted alphabetically. Sample proportional to weight, then randomly assign colors. **noob–noob = 0**.

| Pair | Weight |
| --- | --- |
| midwit–midwit | 8 |
| genius–midwit | 7 |
| genius–infallible | 6 |
| genius–genius | 4 |
| beginner–midwit | 3 |
| infallible–midwit | 3 |
| beginner–beginner | 2 |
| beginner–genius | 2 |
| infallible–infallible | 2 |
| beginner–infallible | 1 |
| beginner–noob | 1 |
| midwit–noob | 1 |
| genius–noob | 0.5 |
| infallible–noob | 0.5 |
| noob–noob | 0 |

## Apply moves

The dumper owns dice and applying `steps`. Legality comes from our `generateLegalPlays`; every gnubg line must match one of those plays and gnubg must list them all. Have the `backgammon-rules` subagent check samples (bar, hits, bear-off).

## Replay

GNU Backgammon SGF (`FF[4]`, `GM[6]`), one file per game. `PW` = p1, `PB` = p2; `W[]` = p1 plays, `B[]` = p2. No cube doubles / takes / drops. Open in `gui` or gnubg. Training ignores SGF.
