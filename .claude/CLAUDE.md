# Claude Code entry point

Shared truth is `AGENTS.md` + `docs/`. This file only imports it; do not put project rules here.

@../AGENTS.md

## Claude Code extras

- Path-scoped rules: `.claude/rules/` (mirrors `.cursor/rules/` and `.grok/rules/`).
- Skills: `.claude/skills/`. Subagents: `.claude/agents/` (`backgammon-rules`, `verifier`).
- `.claude/settings.json` denies host `node` / `npm` / `npx` / `python` / `pip` ([ADR 0011](../docs/decisions/0011-docker-only.md)). Run everything through Docker Compose from the package directory.
- Personal overrides go in `.claude/settings.local.json` (gitignored).
