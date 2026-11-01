# 0024 Claude Code harness

- Status: accepted
- Date: 2026-11-01

## Context

The repo was set up for agentic coding in Cursor (`.cursor/`) and Grok Build (`.grok/`), with `AGENTS.md` + `docs/` as shared truth and an explicit "do not add `CLAUDE.md`" rule. Claude Code does not read `AGENTS.md` on its own; it reads `CLAUDE.md`, `.claude/rules/`, `.claude/skills/`, `.claude/agents/`, and `.claude/settings.json`.

## Decision

Support Claude Code as a third harness under `.claude/`:

- `.claude/CLAUDE.md` imports `@../AGENTS.md` and holds no project rules of its own. No root `CLAUDE.md`, so Cursor and Grok do not pick up a second instructions file.
- `.claude/rules/*.md` mirror the Cursor/Grok rules; package rules are scoped with `paths:` frontmatter (Cursor `globs:`).
- `.claude/skills/` and `.claude/agents/` mirror the other two trees. `backgammon-rules` is read-only via `tools: Read, Grep, Glob`.
- `.claude/settings.json` denies host `node` / `npm` / `npx` / `tsx` / `python` / `pip` and `docker run -v` to enforce [ADR 0011](0011-docker-only.md). `.claude/settings.local.json` is gitignored.

## Consequences

Skill, rule, and subagent edits must now be applied to `.cursor/`, `.grok/`, and `.claude/`. `AGENTS.md`, the core rules, and the `record-decision` skill say so.
