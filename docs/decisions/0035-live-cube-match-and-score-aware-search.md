# 0035 Live-cube match cube and a score-aware search

- Status: accepted
- Date: 2026-11-14
- Amends: the dead-cube match cube and checker ranking of [0018](0018-cube-wrap-formula.md) and [0032](0032-engines-own-decisions.md); "the search ignores `position.match`" in [0028](0028-game-engine-fast.md) and [0032](0032-engines-own-decisions.md)

## Context

After [0034](0034-money-play.md) our engines priced money play with a live cube (Janowski), but matches with a dead cube: in a match the doubler's equity after a take ignored the taker's recube, so the engine doubled too readily and dropped too often. `game-engine-fast` also chose every reply inside its search, and applied both move filters, by cubeless money equity: at gammon-sensitive scores (double match point, gammon-go, gammon-save, post-Crawford) it could pick the wrong replies and filter out the right root play before searching it. Only the final order of the returned plays used the score.

The cheaper of the improvements discussed were chosen now. A full cubeful search is logged for later in [improvements.md](../improvements.md).

## Decision

- **Live-cube match cube.** Janowski's model is carried over to match winning chances (`ts-core/match-cube`, `game-engine-fast/src/match.cpp`): for the side whose probabilities they are, the fully live MWC is piecewise linear in the win chance through the take point and the cash point (as money play), with the dead-cube MWC at win chance 0 and 1. The take and cash points come from the MET one cube level at a time: a player owning cube `K` may redouble to `2K` up to 64, so each level's cash point is the other side's take point one level up. Cubeful MWC is `(1 - x) · dead + x · live` with `x = 0.68`; dead when nobody may double. Gammon rates stay fixed as the win chance moves.
- Our engines use it for **match checker ranking** (`moverValue` = 1 − the opponent's live-cube MWC of the result) and **match cube decisions** (`/cube`: no double, double/take, double/drop in MWC; double when `min(DT, DP) > ND`, take when `DT < DP`, the same rule as money). The dead-cube match formula is no longer used for decisions.
- **Score-aware search.** `game-engine-fast` chooses each reply and applies the root and inner move filters by what the mover makes of the position at the request's score and cube: live-cube MWC in a match, Janowski money equity for money play. Values given to the filters are in money-equity units so the thresholds keep their meaning: EMG in a match (MWC mapped linearly so that losing / winning one cube is −1 / +1), equity per unit of cube for money. Cube state and score stay fixed inside the tree (no cube actions in the search). With nobody able to double, the search is exactly the old cubeless-equity search.
- `game-engine` has no search (0-ply), so for it only the ranking and cube formula change.

## Consequences

Match cube decisions and match rankings change for both engines, and `game-engine-fast` can return different plays at deeper plies in matches and money play. The search's per-request cost grows by one small scoring function per choice (MET values are tabled once per request). Our cube play is still a formula on cubeless probabilities: no cube actions inside the search and no learned cube head. Spec: [match-play.md](../domain/match-play.md), [money-play.md](../domain/money-play.md), [game-engine.md](../domain/game-engine.md), [game-engine-fast.md](../domain/game-engine-fast.md).
