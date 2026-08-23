# Match play

Locked by [ADR 0008](../decisions/0008-match-play.md) for **battle-arena** and the engine cube wrap. [ADR 0020](../decisions/0020-dumper-games-no-cube.md) removed match play and cube policy from `move-dumper` and made `Position.match` `MatchInfo | null`; this file applies when `match` is set. Cube skill noise for arena: [ADR 0007](../decisions/0007-skill-levels-and-pairing.md) names; arena itself is infallible ([ADR 0019](../decisions/0019-battle-arena.md)).

This file is **not** dumper policy. Jacoby, beavers, and raccoons are money-play variants and stay unused.

## Length and score

Each match samples length **uniformly** from `{1, 3, 5, 7, 9, 11, 13, 15}`. Away = `length - score` (at least 1 while the match is live). Match over when a player’s score is `>= length`.

Points for a finished game: `cube.value` × 1 (single), 2 (gammon), or 3 (backgammon). Cap the added score at what wins the match; extra points do not matter.

## Crawford

On. No Holland rule.

- After a game, if a player has **first** reached `length - 1` and the match is not over, the **next** game is Crawford: both `cube.mayDouble` false, cube stays 1 / centered.
- After the Crawford game, later games are **post-Crawford**: cube is live again (centered at 1 unless turned that game).
- **Length 1:** both start 1-away. The only game is Crawford. Cube dead for the match.
- A gammon that jumps from below `length - 1` straight to a match win **skips** Crawford.

## Match equity table

Kazaross XG2: [data/kazaross-xg2-met.json](data/kazaross-xg2-met.json) (covers 15-away).

Let `MET(a, b)` be P(player at `a`-away wins) vs opponent `b`-away.

- Pre-Crawford, or Crawford game: `crawford[a-1][b-1]`.
- Post-Crawford, STM is the 1-away leader: `postCrawfordLeader[String(oppAway)]`.
- Post-Crawford, STM is the trailer: `postCrawfordTrailer[String(stmAway)]`.

If a computed away would be `<= 0`, MWC is 1 (already won) or 0 (already lost).

## Dead-cube MWC from cubeless probs

Teacher cubeless probs are for **STM of the scored position** ([evaluation.md](evaluation.md), [gnubg.md](gnubg.md)). Do not use money `cubefulEquity` as match equity.

Let cube value be `C`. If STM wins a single / gammon / backgammon, they gain `C` / `2C` / `3C` points (then cap). Losses award the same to the opponent.

```
mwc = P(win_single) * MET(after single win)
    + P(gammon_only) * MET(after gammon)
    + P(backgammon) * MET(after BG)
    + P(lose_single) * MET(after single loss)
    + P(lose_gammon_only) * MET(after gammon loss)
    + P(lose_backgammon) * MET(after BG loss)
```

`P(win_single) = win - gammon`, `P(gammon_only) = gammon - backgammon`, and the lose split likewise (`lose = 1 - win`).

Live-cube recube value is out of scope for v1.

## Checker ranking (mover)

Each legal play’s eval is the **result** with opponent to move. Convert that result’s cubeless probs to MWC for the **opponent**, then

`moverMwc = 1 - opponentMwc`

(after applying the play, cube unchanged). **Battle-arena / engine** argmax on `moverMwc` (stored as `RankedPlay.rankScore`). The **dumper** does not rank by MWC; it uses negated result cubeless equity ([move-dumper.md](move-dumper.md), [ADR 0020](../decisions/0020-dumper-games-no-cube.md)).

## Cube heuristic

Decide **before the roll** when `mayDouble` is true for on-roll. Skip the **opening roll of a game**. Skip (and leave `mayDouble` false) when `cube.value` is already **64** — doubling to 128 is illegal.

Use cubeless probs of the play that created the current position (STM = player about to roll).

Actions:

| Action | MWC for the player on roll |
| --- | --- |
| no-double | dead-cube MWC at current `C` |
| double, opponent drops | MET after they gain `C` points (game over) |
| double, opponent takes | dead-cube MWC at `2C` (taker owns the cube). `2C` is at most 64. |

- **Drop** if taker’s MWC after take `<` MWC after drop (drop MWC for the taker is `1 -` dropper’s MET).
- **Too good:** no-double MWC `>` double-and-take MWC → do not offer (play for gammon).
- Otherwise **double** if double-and-take (or drop, if they would drop) MWC `>` no-double MWC.

Infallible takes that action. Other levels: logistic on ΔMWC with the same τ as checker play (`P(double) = 1 / (1 + exp(-Δ / τ))`, and the same for take vs drop). Noob: offer with probability 0.10 when allowed; take/drop with probability 0.50.

Teacher `eval.cubeAction` stays `null`. The dumper does not persist cube actions ([ADR 0020](../decisions/0020-dumper-games-no-cube.md)). `game-engine` maps the infallible side of this heuristic onto `eval.cubeAction` ([ADR 0018](../decisions/0018-cube-wrap-formula.md)).
