# move-dumper simulation

Locked by [ADR 0007](../decisions/0007-skill-levels-and-pairing.md), [ADR 0009](../decisions/0009-dump-metadata-and-sgf.md), and [ADR 0020](../decisions/0020-dumper-games-no-cube.md). Teacher: [gnubg.md](gnubg.md). Files: [dump-format.md](dump-format.md). Battle-arena / engine match math (not dumper policy): [match-play.md](match-play.md).

Simulates independent money games, labels every checker play from bgweb-api, and writes JSONL plus GNU Backgammon SGF. The game loop lives in `ts-core/sim` (`playGame`); this package adds skill sampling and dump I/O. There is **no doubling-cube policy**.

From `move-dumper/` ([ADR 0011](../decisions/0011-docker-only.md)):

```sh
npm run up
npm test
npm run dump -- --games 1 --seed 1
npm run down
npm run install:host
```

Those scripts wrap Docker Compose (`dump:inner` / `test:inner` run inside the container). `install:host` writes `node_modules` onto the host for IDE typechecking only.

## Per game

1. Sample an unordered level pair from the weights below; randomly assign `p1` / `p2`.
2. Play one game to bear-off via `playGame({ allowCube: false })`. No match score, no Crawford cycle, no cube offer/take/drop.
3. Write `replay/<gameId>.sgf`. Records for that game are committed to `records.jsonl.gz` first (one gzip member per game) so a crash keeps finished games readable.

Teacher `getmoves` retries on disconnect / 5xx until the API returns. SIGINT/SIGTERM finish after the current game (`gzip.end` + manifest). Do not kill `-9` if you want the last member closed.

Seed the RNG; store `seed` on the batch manifest.

## Opening a game

Reset the board to the standard opening. Cube is dead: `value` 1, `owner` `"centered"`, `mayDouble` both false. `match` is `null` ([ADR 0020](../decisions/0020-dumper-games-no-cube.md)). GNU SGF may still use a 1-point `MI` header for gnubg; that is not `Position.match`. Each side rolls one die; ties reroll; higher is on roll with those two dice (opening is never doubles).

Later turns: roll both dice. Never consult cube.

## Checker ply

1. `POST /api/v1/getmoves` with `score-moves: true`, **no** `max-moves`. Cubeless and cubeful-equity passes as in [gnubg.md](gnubg.md).
2. Append a `decision: "checker"` record with **all** legal plays and teacher evals.
3. Sample `chosen` with the on-roll level (below). Rank by **negated result cubeless equity** (`-eval.cubeless.equity` of the teacher result, which is STM of the result). Store that as `RankedPlay.rankScore` (higher is better). Do not rank by MWC or cubeful equity. Loop: `src/games.ts`.
4. Apply `chosen.steps` to the position JSON (hits implied). Do not re-generate the legal list; the teacher list is source.
5. If a player has 15 off: the game is over (single / gammon / backgammon for SGF `RE` only). Next game is independent.

Gammon: loser has 0 off. Backgammon: loser has 0 off **and** a checker on the bar or in the winner’s home (p1 home 1–6, p2 home 19–24).

No resignations in v1. Play to bear-off.

## Levels

| Level | Checker play |
| --- | --- |
| noob | Uniform over legal plays |
| beginner | Softmax on negated cubeless equity, τ = 0.08 |
| midwit | τ = 0.025 |
| genius | τ = 0.008 |
| infallible | Argmax negated cubeless equity; ties: teacher `diff`, then stable `steps` |

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

The dumper owns dice and applying `steps`. Legality comes from getmoves. Have the `backgammon-rules` subagent check samples (bar, hits, bear-off).

## Replay

GNU Backgammon SGF (`FF[4]`, `GM[6]`), one file per game. `PW` = p1, `PB` = p2; `W[]` = p1 plays, `B[]` = p2. No cube doubles / takes / drops. Open in `replay-player` or gnubg. Training ignores SGF.
