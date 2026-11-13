# 0026 Rename replay-player to gui; Tailwind styling

- Status: accepted
- Date: 2026-11-01
- Amends: [0010](0010-replay-player.md) (package name and styling), package lists in [0016](0016-ts-core.md) and [0019](0019-battle-arena.md)

## Context

The browser package `replay-player` ([ADR 0010](0010-replay-player.md)) was styled with a hand-written stylesheet: wood and felt gradients, radial-gradient checkers, heavy shadows, and a near-instant dice flip. It is the only browser UI in the repo and the name was narrower than its job.

## Decision

- Rename the top-level package `replay-player` → `gui` (directory, npm name, Compose service `gui`, volume `gui_node_modules`). Still one of six packages; this is a rename, not a seventh.
- Style with Tailwind CSS v4 (`tailwindcss` + `@tailwindcss/vite`). Use utility classes in markup; keep custom CSS only for what utilities cannot express.
- Minimal look: solid, readable colors. No gradients, no decorative shadows or textures.
- Dice: a short 3D spin when rolled (Web Animations API, ease-out, no bounce). Every roll ends on an exact face-forward orientation: the landed die is flat, with no tilt or residual rotation. Animations always play, regardless of the OS reduce-motion setting (they are short and show what moved).
- Everything else in ADR 0010 holds: SGF-only input, file picker, Previous / Next, no backend, no React, imports `ts-core` and not `move-dumper`.

## Consequences

Run from `gui/` (`docker compose up --build`, http://localhost:5173). Rules: `.cursor/rules/gui.mdc`, `.grok/rules/gui.md`, `.claude/rules/gui.md`. The old `replay_player_node_modules` Compose volume is orphaned; remove it with `docker volume rm` if wanted. No domain contract changes.

[0033](0033-board-package.md) moves the board into the `board` package. This app stays vanilla and mounts `<backgammon-board>`.
