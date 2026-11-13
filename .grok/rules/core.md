# Core

- Eight packages only: `ts-core`, `move-dumper`, `training-ground`, `game-engine`, `game-engine-fast`, `board`, `gui`, `battle-arena`. Do not add another top-level package.
- Docker (Engine + Compose v2) is the only supported runtime ([ADR 0011](../../docs/decisions/0011-docker-only.md)). Do not install or invoke host Node, npm, Python, or pip. Commands: [README.md](../../README.md). Do not wrap Compose in host npm.
- Read `docs/domain/` before inventing board, move, or eval shapes.
- Open questions: `docs/decisions/0000-open-questions.md`. Do not silently decide them; use the `record-decision` skill and write an ADR.
- Never commit dumps, arena replays, checkpoints, weights, or `.env` files.
- Cursor, Grok Build, and Claude Code: keep `.cursor/` and `.grok/` skills, rules, and agents in sync; `.claude/` holds pointers into `.cursor/` (add one when you add a skill, rule, or agent). Do not add any `CLAUDE.md` or `CLAUDE.local.md`; Claude Code reads `AGENTS.md` natively.
