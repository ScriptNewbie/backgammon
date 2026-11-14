# 0034 Money play: Janowski cube, Jacoby off, no beavers

- Status: accepted
- Date: 2026-11-14
- Amends: the money cubeful equity in [0018](0018-cube-wrap-formula.md), `/cube` availability in [0032](0032-engines-own-decisions.md), match-only play in [0019](0019-battle-arena.md), [0023](0023-arena-any-driver.md), and [0027](0027-gui-play-vs-engine.md)
- Closes: the Jacoby / beavers open question

## Context

Only matches could be played: the arena took a match length, the GUI offered match lengths, and our engines' `/cube` was unavailable for money because the cube formula needs a match score. The gnubg, Hedgehog, and XG sidecars already play money. A dead-cube money formula is no use for cube decisions: with a dead cube, doubling is right as soon as you are ahead. The GUI's review line measured every move in money equity, while the engines rank match plays by MWC.

## Decision

- **Money rules:** Jacoby off, no beavers, no raccoons. A double is taken or dropped. Cube cap 64, as in matches.
- **Money cube for our engines:** Janowski's live-cube model with cube efficiency `x = 0.68` (Hedgehog's default; gnubg uses the same model). From the cubeless probs, `W` (average points won per win) and `L` (average points lost per loss) give the take point `TP = (L - 1/2) / (W + L + 1/2)` and the cash point `CP = (L + 1) / (W + L + 1/2)`. Cubeful equity is `(1 - x) · dead + x · live`, where `live` is linear between those points and depends on who may double (centered, own cube, opponent's cube). A cube nobody may turn is dead. Spec: [money-play.md](../domain/money-play.md).
- **`cubefulEquity`** on engine evals is that Janowski money equity, in points at the current cube value, for STM of the scored position (dead-cube `equity × value` when nobody may double). Engines rank money plays by it.
- **`/cube` for money** (`match: null`) is available when the player on roll may double and the cube is below 64. It returns the doubler's equities for no double, double/take, and double/drop (in points at the current cube), and `currency: "money"` (`"mwc"` in a match). Double when `min(double/take, double/drop) > no double`; take when `double/take < double/drop`.
- **`/evaluate`** also returns, on each move, `moverValue`: the number the engine ranked it by, for the mover (MWC in a match, cubeful money equity in money play), and `moverValueKind: "mwc" | "money"` on the response.
- **Shared loop (`ts-core/sim`):** asks cube questions in money games too (not on the opening roll, not at cube 64, never with `--no-cube`).
- **Arena:** `--money --games N` plays N money games, alternating seats each game. The summary gives points and points per game (with a standard error) per side. One SGF per run (`MI[length:0]`, running score in `ws`/`bs`). `--length` and `--matches` are match-only. XG plays whatever Jacoby setting is in XG; set it off.
- **GUI:** the setup offers **Money** next to match lengths. A money session keeps a running point total and never ends by itself. The review line uses `moverValue`: in a match your play and the engine's in match winning chance and the loss in percentage points; in money play in cubeful equity and the loss in points.
- **Replay:** SGF with `length:0` replays as money games.

## Consequences

Every driver can play money in the arena, with its own cube. Our engines' money cube is Janowski on a cubeless net, not a learned cubeful head. Match play is unchanged (dead-cube MWC formula, [0018](0018-cube-wrap-formula.md)). The dumper still plays money without a cube ([0020](0020-dumper-games-no-cube.md)); teacher labels are unchanged.

Engine `cubefulEquity` for a live cube changes from `equity × value` to Janowski, so money rankings change. `game-engine-fast` gains the same money code in C++, tested against `ts-core` values.
