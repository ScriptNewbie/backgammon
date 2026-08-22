# Core

- Five packages only: `ts-core`, `move-dumper`, `training-ground`, `game-engine`, `replay-player`. Do not add another top-level package.
- Docker (Engine + Compose v2) is the only supported runtime ([ADR 0011](../../docs/decisions/0011-docker-only.md)). Do not install or invoke host Node, npm, Python, or pip. Commands: `AGENTS.md`.
- Read `docs/domain/` before inventing board, move, or eval shapes.
- Open questions: `docs/decisions/0000-open-questions.md`. Do not silently decide them; use the `record-decision` skill and write an ADR.
- Never commit dumps, checkpoints, weights, or `.env` files.
- Cursor and Grok Build: keep `.cursor/` and `.grok/` skills, rules, and agents in sync. Do not add `CLAUDE.md`.
