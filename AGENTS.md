# Agent instructions

This is a three-package monorepo. Do not add other top-level packages.

| Package | Stack | Job |
| --- | --- | --- |
| `move-dumper` | TypeScript | Dump labelled positions/moves from bgweb-api (GNU Backgammon nets) |
| `training-ground` | PyTorch → ONNX export | Train the cubeless eval net |
| `game-engine` | TypeScript + `onnxruntime-node` | Board + dice → legal moves with cubeful evals |

Packages are not scaffolded. Do not add language toolchains, `package.json`, `pyproject.toml`, or an HTTP server unless the user asks.

## Hard rules

- Representations: JSON (source of truth), feature tensor, XGID. Specs: [docs/domain/board-representation.md](docs/domain/board-representation.md), [docs/domain/features.md](docs/domain/features.md). Do not add a fourth.
- Players are `p1` / `p2` ([ADR 0001](docs/decisions/0001-player-labels.md)).
- Evals: [docs/domain/evaluation.md](docs/domain/evaluation.md). Net = cubeless probs; API = cubeful wrap + cube action ([ADR 0003](docs/decisions/0003-doubling-cube.md)).
- Inference is ONNX in the TS engine, not Python-per-request ([ADR 0004](docs/decisions/0004-game-engine-typescript-onnx.md)).
- Dumps: [docs/domain/dump-format.md](docs/domain/dump-format.md) (`manifest.json` + gzip JSONL). Do not commit `move-dumper/dumps/`, checkpoints, or weights.
- Do not silently decide open questions. See [docs/decisions/0000-open-questions.md](docs/decisions/0000-open-questions.md). When the user decides, use the `record-decision` skill and write an ADR.

## Harness

This repo is used in **Cursor** and **Grok Build**. Shared truth is `AGENTS.md` + `docs/`. Cursor extras: `.cursor/`. Grok extras: `.grok/` (rules as `.md`; skills; agents). Keep those two trees in sync when you edit a skill, rule, or subagent. Do not add `CLAUDE.md`. In Grok Build, run `grok inspect` to confirm discovery.

## Where to look

- Domain facts: `docs/domain/`
- Architecture Decision Records: `docs/decisions/`
- Workflows: `.cursor/skills/` and `.grok/skills/`
- Standing constraints: `.cursor/rules/` and `.grok/rules/`
