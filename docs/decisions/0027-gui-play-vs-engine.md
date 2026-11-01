# 0027 GUI play mode against game-engine

- Status: accepted
- Date: 2026-11-01
- Amends: [0010](0010-replay-player.md) (the GUI is no longer replay-only), [0026](0026-gui-tailwind.md)

## Context

`gui` only replayed GNU SGF files. We want to play against our own `game-engine` in the browser, while keeping replay.

## Decision

- `gui` has two screens: **Play** (default) and **Replay**. Replay is unchanged.
- Play is a **match** against `game-engine` with a live doubling cube and Crawford. The user picks the length (1–11). Human is always `p1` (bottom, bears off bottom right); the engine is `p2`.
- Dice are fair random dice from the browser (`crypto.getRandomValues`), shown with the 3D roll.
- **Move input:** click a checker; it moves by the first die, in the displayed order, that gives a legal step. A **Swap dice** button under the dice reverses the order before the first step. Undo takes back one step; Done ends the turn once every usable die is played. Step legality comes from `ts-core` `generateLegalSequences` (all maximal plays in every step order, with the die per step).
- **Engine:** plays `moves[0]` from `POST /evaluate`. Cube decisions come from the same evals, with no new endpoint: the eval of the human's play (engine on roll) gives `cubeAction.double` for the engine's next turn; the eval of the engine's play (human on roll) gives `cubeAction.take` when the human doubles. If no eval exists (the previous mover danced), the engine does not double and does take.
- **Analysis:** after each human turn, show the human's play and its cubeful equity, the engine's best play, and the equity loss. No hints before moving.
- The browser reaches the engine through the Vite dev-server proxy `/api/engine` → `ENGINE_URL` (default `http://host.docker.internal:3000`). The engine stays CORS-free. The GUI still has no backend of its own.

## Consequences

Play needs `game-engine` running (`docker compose up` in `game-engine/`) with `training-ground/checkpoints/cubeless.onnx`. Spec: [gui.md](../domain/gui.md). The engine picks by cubeful equity, not by match-winning chance as the arena's ranking does; good enough for play. Play results are not written to SGF and are not training data.
