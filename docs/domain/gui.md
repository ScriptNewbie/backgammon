# GUI

Locked by [ADR 0010](../decisions/0010-replay-player.md), [ADR 0026](../decisions/0026-gui-tailwind.md), [ADR 0027](../decisions/0027-gui-play-vs-engine.md), and [ADR 0033](../decisions/0033-board-package.md). Vite + vanilla TypeScript + Tailwind CSS in `gui/`. Run with `docker compose up --build` from `gui/` (http://localhost:5173). Host commands: [README.md](../../README.md).

The board is the [`board`](board-widget.md) custom element (`<backgammon-board>`). This package does not draw checkers or dice. It sets an XGID and the partial-turn props (`usedDice`, `movable`, `swap`) and listens for `point` and `swap`.

Two screens, switched in the header.

## Play

A match or a money session against `game-engine` ([game-engine.md](game-engine.md), money: [ADR 0034](../decisions/0034-money-play.md)). Needs the engine running (`docker compose up` in `game-engine/`).

- **Setup:** **Play** = match to 1, 3, 5, 7, 9 or 11, or **Money**; **New match**. Human is `p1` (bottom, bears off bottom right); engine is `p2`. Matches: live cube with Crawford ([match-play.md](match-play.md)). Money: live cube, Jacoby off, no beavers, a running point total, no end ([money-play.md](money-play.md)).
- **Dice:** random in the browser (`crypto.getRandomValues`). Opening roll decides who starts and is that player's first roll.
- **Your turn:** if you may double, choose **Double** or **Roll**; otherwise the GUI rolls for you. Movable checkers have a ring. Click one: it moves by the first die, in the displayed order, that gives a legal step. **Swap dice** (under the dice, before the first step) reverses the order. **Undo** takes back one step. **Done** ends the turn when every usable die is played. With no legal move the turn passes by itself.
- **Legality:** a partial turn is legal iff it is a prefix of a play from `ts-core` `generateLegalSequences` (maximal plays, higher-die rule, every step order, die per step).
- **Engine turn:** may double, rolls, calls `POST /evaluate`, plays `moves[0]` (the engine's own choice at the match score or in money play, [ADR 0032](../decisions/0032-engines-own-decisions.md)), step by step.
- **Cube decisions** are the engine's own, from `POST /cube` (position with the doubler on roll, no dice):
  - before its roll, when it may double, the engine is asked with itself on roll and doubles if `offer` is `"double"`;
  - when you double, the engine is asked with you on roll and takes unless `take` is `"drop"`.
- **Review line** (after each of your turns): your play, the engine's choice (`moves[0]`), and your loss, all on the scale the engine ranked by (`moverValue`, `moverValueKind`): in a match each play's **match winning chance** and the loss in percentage points; in money play each play's **cubeful money equity** for you (Janowski, scaled by the cube) and the loss in points. The loss is at least 0. No hints before you move.
- **Game end:** matches score by `pointsAwarded` (cube × single/gammon/backgammon, capped at the match length); money scores cube × result uncapped. Drops score the cube value. **Next game** / **New match**.
- **Wire:** the browser posts position JSON ([board-representation.md](board-representation.md)) to `/api/engine/evaluate` and `/api/engine/cube`; the Vite dev server proxies `/api/engine` to `ENGINE_URL` (Compose default `http://host.docker.internal:3000`).
- Play is not recorded: no SGF, no training data.

## Replay

Steps through GNU Backgammon SGF (`FF[4]` `GM[6]`) from `move-dumper/dumps/<batch>/replay/` or `battle-arena/replays/` ([dump-format.md](dump-format.md)). File picker only. Previous / Next (or ←/→) is one dice roll, checker step, or cube action. Positions are rebuilt by applying SGF events from the standard opening with `ts-core`. A game with `MI[length:0]` replays as a money game (standard money opening, live cube).

## Look

Tailwind utilities on the chrome (header, HUD, buttons). The board’s own look, dice roll, and checker flights live in [`board`](board-widget.md): solid colors, no gradients, dice land flat, animations ignore the OS reduce-motion setting.
