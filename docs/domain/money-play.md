# Money play

Locked by [ADR 0034](../decisions/0034-money-play.md). Match play: [match-play.md](match-play.md). Eval schema: [evaluation.md](evaluation.md).

A money game is a position with `match: null`. Each game is scored on its own: the winner gets `cube.value` × 1 (single), 2 (gammon), or 3 (backgammon), with no cap. A dropped double scores the cube value before the double.

## Rules

- **Jacoby off:** gammons and backgammons count with the cube centered.
- **No beavers, no raccoons:** a double is taken or dropped.
- Cube cap 64, as in matches. No Crawford rule.
- Who may double is `cube.mayDouble` (both at the start; only the owner after a take; nobody at 64).

## Janowski cubeful equity (our engines)

`game-engine` and `game-engine-fast` turn the net's cubeless probabilities into money cubeful equity with Rick Janowski's live-cube model, cube efficiency `x = 0.68` (`CUBE_EFFICIENCY` in `ts-core/money`, `kCubeEfficiency` in `game-engine-fast/src/match.hpp`).

For the side whose probabilities they are, with `p = win`:

- `W = (win + gammon + backgammon) / win` (average points per win at cube 1), `1` if `win = 0`;
- `L = (lose + loseGammon + loseBackgammon) / lose` with `lose = 1 - win`, `1` if `lose = 0`;
- take point `TP = (L - 1/2) / (W + L + 1/2)`, cash point `CP = (L + 1) / (W + L + 1/2)`.

The **live** equity at cube 1 is piecewise linear in `p`:

| Cube | `p` below | between | above |
| --- | --- | --- | --- |
| centered | `-L + (L - 1)·p/TP` (to −1 at `TP`) | `-1 + 2·(p - TP)/(CP - TP)` | `1 + (W - 1)·(p - CP)/(1 - CP)` (from +1 at `CP`) |
| mine (I may double, they may not) | `-L + (L + 1)·p/CP` up to `CP` | — | `1 + (W - 1)·(p - CP)/(1 - CP)` |
| theirs (they may double, I may not) | `-L + (L - 1)·p/TP` up to `TP` | — | `-1 + (W + 1)·(p - TP)/(1 - TP)` |

Cubeful equity in points: `value · ((1 - x) · equity + x · live)`. When nobody may double (cube 64, or a cube turned off) it is the dead-cube `equity · value`.

`eval.cubefulEquity` on engine moves is this number for STM of the result position. In a match the same field still holds this money number; match decisions use MWC ([match-play.md](match-play.md)).

## Engine decisions

- **Checker play:** `/evaluate` orders plays by the mover's cubeful equity, `-cubefulEquity` of the result (`moverValue`, `moverValueKind: "money"`).
- **Cube:** `/cube` (doubler on roll, `dice: null`), available when the doubler may double and the cube is below 64. With `ND` = no double at the current cube, `DT` = double/take (the taker then owns a cube at twice the value; dead at 64), `DP` = double/drop (`+value`), all for the doubler in points:
  - offer when `min(DT, DP) > ND` (so "too good" plays on when `ND > DP`);
  - take when `DT < DP`.
- The response has `currency: "money"`.

## Other sides

- **gnubg:** money XGID (length 0, Jacoby off); the sidecar runs `set jacoby off`. gnubg's own money cube. A "beaver" answer counts as a take.
- **Hedgehog:** money OGID; its money cube functions, Jacoby off ([hedgehog.md](hedgehog.md)).
- **XG:** money XGID with Jacoby and beavers off in the XGID; XG's own settings otherwise apply, so set Jacoby off in XG ([xg.md](xg.md)).

## Where it is played

- `battle-arena --money --games N` ([battle-arena.md](battle-arena.md)).
- `gui` Play screen, **Money** option ([gui.md](gui.md)).
- `move-dumper` plays money games **without a cube** ([ADR 0020](../decisions/0020-dumper-games-no-cube.md)).

SGF: `MI[length:0][game:N][ws:..][bs:..]` with each seat's running points, no `RU`.
