# GUI

Locked by [ADR 0010](../decisions/0010-replay-player.md), [ADR 0026](../decisions/0026-gui-tailwind.md), and [ADR 0027](../decisions/0027-gui-play-vs-engine.md). Vite + vanilla TypeScript + Tailwind CSS in `gui/`. Run with `docker compose up --build` from `gui/` (http://localhost:5173). Host commands: [README.md](../../README.md).

Two screens, switched in the header.

## Play

A match against `game-engine` ([game-engine.md](game-engine.md)). Needs the engine running (`docker compose up` in `game-engine/`).

- **Setup:** match length 1, 3, 5, 7, 9 or 11; **New match**. Human is `p1` (bottom, bears off bottom right); engine is `p2`. Live cube with Crawford ([match-play.md](match-play.md)).
- **Dice:** random in the browser (`crypto.getRandomValues`). Opening roll decides who starts and is that player's first roll.
- **Your turn:** if you may double, choose **Double** or **Roll**; otherwise the GUI rolls for you. Movable checkers have a ring. Click one: it moves by the first die, in the displayed order, that gives a legal step. **Swap dice** (under the dice, before the first step) reverses the order. **Undo** takes back one step. **Done** ends the turn when every usable die is played. With no legal move the turn passes by itself.
- **Legality:** a partial turn is legal iff it is a prefix of a play from `ts-core` `generateLegalSequences` (maximal plays, higher-die rule, every step order, die per step).
- **Engine turn:** may double, rolls, calls `POST /evaluate`, plays `moves[0]`, step by step.
- **Cube decisions** come from `/evaluate` evals (each is for the resulting position, the opponent on roll):
  - engine doubles next turn ⇐ `cubeAction.double` of the human's chosen play;
  - engine takes your double ⇐ `cubeAction.take` of the engine's last play;
  - no eval (previous mover danced) ⇒ engine does not double, and takes.
- **Review line** (after each of your turns): your play and its cubeful equity for you (`-cubefulEquity`, scaled by the cube), the engine's best play, and the loss. No hints before you move.
- **Game end:** points by `pointsAwarded` (cube × single/gammon/backgammon, capped at the match length). Drops score the cube value. **Next game** / **New match**.
- **Wire:** the browser posts position JSON ([board-representation.md](board-representation.md)) to `/api/engine/evaluate`; the Vite dev server proxies `/api/engine` to `ENGINE_URL` (Compose default `http://host.docker.internal:3000`).
- Play is not recorded: no SGF, no training data.

## Replay

Steps through GNU Backgammon SGF (`FF[4]` `GM[6]`) from `move-dumper/dumps/<batch>/replay/` or `battle-arena/replays/` ([dump-format.md](dump-format.md)). File picker only. Previous / Next (or ←/→) is one dice roll, checker step, or cube action. Positions are rebuilt by applying SGF events from the standard opening with `ts-core`.

## Look

Tailwind utilities, solid colors, no gradients. Dice roll in 3D and land flat with no tilt. Checker moves are animated. Animations ignore the OS reduce-motion setting.
