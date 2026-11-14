# Match play

Locked by [ADR 0008](../decisions/0008-match-play.md) for **battle-arena** and the engine cube wrap. The engines' match cube and checker ranking use the live-cube model below ([ADR 0035](../decisions/0035-live-cube-match-and-score-aware-search.md)). Since [ADR 0032](../decisions/0032-engines-own-decisions.md) the checker ranking and cube formula below run **inside** `game-engine` (`ts-core/match`) and `game-engine-fast` (`src/match.cpp`); the arena only plays what each engine decides. [ADR 0020](../decisions/0020-dumper-games-no-cube.md) removed match play and cube policy from `move-dumper` and made `Position.match` `MatchInfo | null`; this file applies when `match` is set. Cube skill noise for arena: [ADR 0007](../decisions/0007-skill-levels-and-pairing.md) names; arena itself is infallible ([ADR 0019](../decisions/0019-battle-arena.md)).

This file is **not** dumper policy. Money play (`match: null`: Janowski cube, Jacoby off, no beavers) is in [money-play.md](money-play.md) ([ADR 0034](../decisions/0034-money-play.md)).

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

This is the **dead-cube** MWC: no further cube action. The engines decide with the live-cube MWC below, which starts from it.

## Live-cube MWC (engines, ADR 0035)

Janowski's money model ([money-play.md](money-play.md)) carried over to match winning chances, for the player whose probs they are, at cube `C` (`ts-core/match-cube`, `game-engine-fast/src/match.cpp`). Gammon rates are fixed as the win chance `p` moves, so the dead-cube MWC is the straight line from `L(C)` (MWC if this player loses at `C`, gammons included) at `p = 0` to `W(C)` at `p = 1`.

- **Take point** of a player doubled to `K`: the `p` where owning `K` (fully live) is worth as much as dropping `K/2`.
- **Cash point** of a player owning `K`: one minus the opponent's take point at `2K`. At 64 the cube cannot be turned, so the owner's value is the dead line. Points are worked out from 64 down, one level at a time.
- **Fully live MWC:** piecewise linear in `p`: centered through `(0, L)`, `(TP, MET after losing C)`, `(CP, MET after winning C)`, `(1, W)`; when I own the cube through `(0, L)`, `(CP, MET after winning C)`, `(1, W)`; when the opponent owns it, one minus their owned value. If a take point is not below the cash point, the dead line is used.
- **Cubeful MWC:** `(1 - x) · dead + x · live`, `x = 0.68` (as money). Dead when nobody may double.

## Checker ranking (mover)

Each legal play’s eval is the **result** with opponent to move. Convert that result’s cubeless probs to the **opponent**'s live-cube MWC (cube unchanged, their cube view from `mayDouble`), then

`moverMwc = 1 - opponentMwc`

(after applying the play, cube unchanged). **The engines** order `/evaluate` by `moverMwc` (ties: `stepsKey`) when `match` is set (`rankForMover`, which also reports it as `moverValue`); `moves[0]` is their play. The **dumper** does not rank by MWC; it uses negated result cubeless equity ([move-dumper.md](move-dumper.md), [ADR 0020](../decisions/0020-dumper-games-no-cube.md)).

## Cube decision

Decide **before the roll** when `mayDouble` is true for on-roll. Skip the **opening roll of a game**. Skip (and leave `mayDouble` false) when `cube.value` is already **64** — doubling to 128 is illegal.

Use the engine’s **own** cubeless probs of the current position for the player about to roll (`POST /cube`; `game-engine-fast` searches it at its ply). Each side asks its own engine, so one side never decides on the other side’s evaluation.

Actions:

| Action | MWC for the player on roll |
| --- | --- |
| no-double (`ND`) | live-cube MWC at current `C` (centered, or mine if I own it) |
| double, opponent drops (`DP`) | MET after I gain `C` points (game over) |
| double, opponent takes (`DT`) | live-cube MWC at `2C` with the taker owning the cube (dead at 64) |

- **Double** when `min(DT, DP) > ND` (so "too good" plays on when `ND > DP`).
- **Take** when `DT < DP` (the taker keeps more MWC by taking).
- The same rule as money play ([money-play.md](money-play.md)).

The engines take that action (`cubeDecision` / `matchCubeVerdict` in `ts-core/match`, `MatchCubeTables::decide` in `game-engine-fast`). Skill-level cube noise is not used: the dumper has no cube and the arena plays at max strength.

Teacher `eval.cubeAction` stays `null`. The dumper does not persist cube actions ([ADR 0020](../decisions/0020-dumper-games-no-cube.md)). Engine `eval.cubeAction` is also `null`; the decision is the `/cube` response ([ADR 0032](../decisions/0032-engines-own-decisions.md)).
