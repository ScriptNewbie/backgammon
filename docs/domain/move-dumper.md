# move-dumper simulation

Locked by [ADR 0007](../decisions/0007-skill-levels-and-pairing.md), [ADR 0008](../decisions/0008-match-play.md), [ADR 0009](../decisions/0009-dump-metadata-and-sgf.md). Teacher: [gnubg.md](gnubg.md). Files: [dump-format.md](dump-format.md). Match math: [match-play.md](match-play.md).

Simulates matches, labels every checker play from bgweb-api, applies a noisy cube heuristic, and writes JSONL plus GNU Backgammon SGF.

From `move-dumper/` ([ADR 0011](../decisions/0011-docker-only.md)):

```sh
npm run up
npm test
npm run dump -- --matches 1 --seed 1
npm run down
npm run install:host
```

Those scripts wrap Docker Compose (`dump:inner` / `test:inner` run inside the container). `install:host` writes `node_modules` onto the host for IDE typechecking only.

## Per match

1. Sample an unordered level pair from the weights below; randomly assign `p1` / `p2`.
2. Sample length uniformly from `{1, 3, 5, 7, 9, 11, 13, 15}`.
3. Play games until a player’s score `>= length`. Same pair and length for the whole match.
4. Write `replay/<matchId>.sgf`.

Seed the RNG; store `seed` on the batch manifest.

## Opening a game

Reset the board to the standard opening, cube 1 / centered. Set `mayDouble` from Crawford / post-Crawford / length-1 ([match-play.md](match-play.md)). Each side rolls one die; ties reroll; higher is on roll with those two dice (opening is never doubles). Skip cube before this first roll.

Later turns: cube decision (if allowed), then roll both dice.

## Checker ply

1. `POST /api/v1/getmoves` with `score-moves: true`, **no** `max-moves`. Cubeless and cubeful-equity passes as in [gnubg.md](gnubg.md).
2. Append a `decision: "checker"` record with **all** legal plays and teacher evals.
3. Sample `chosen` with the on-roll level (below).
4. Apply `chosen.steps` to the position JSON (hits implied). Do not re-generate the legal list; the teacher list is source.
5. If a player has 15 off: award points, update score, maybe Crawford, next game or match over.

Gammon: loser has 0 off. Backgammon: loser has 0 off **and** a checker on the bar or in the winner’s home (p1 home 1–6, p2 home 19–24).

No resignations in v1. Play to bear-off (or a cube drop).

## Levels

| Level | Checker play | Cube |
| --- | --- | --- |
| noob | Uniform over legal plays | Offer P=0.10 when allowed; take/drop 50/50 |
| beginner | Softmax MWC, τ = 0.08 | Logistic ΔMWC, same τ |
| midwit | τ = 0.025 | same |
| genius | τ = 0.008 | same |
| infallible | Argmax MWC; ties: teacher `diff`, then stable `steps` | MWC-best action, including too-good |

`P(i) ∝ exp(mwc_i / τ)`. Mover MWC: [match-play.md](match-play.md).

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

The dumper owns dice and applying `steps`. Legality comes from getmoves. Have the `backgammon-rules` subagent check samples (bar, hits, bear-off, Crawford `mayDouble`).

## Replay

GNU Backgammon SGF (`FF[4]`, `GM[6]`), one file per match. `PW` = p1, `PB` = p2; `W[]` = p1 plays, `B[]` = p2. `MI` includes length and score. Include cube doubles / takes / drops. Open in `replay-player` or gnubg. Training ignores SGF.
