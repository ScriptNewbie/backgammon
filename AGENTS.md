# Agent instructions

This is a four-package monorepo. Do not add other top-level packages.

| Package | Stack | Job |
| --- | --- | --- |
| `move-dumper` | TypeScript | Simulate matches; dump labelled positions/moves from bgweb-api (GNU Backgammon nets) |
| `training-ground` | PyTorch → ONNX export | Train the cubeless eval net |
| `game-engine` | TypeScript + `onnxruntime-node` | Board + dice → legal moves with cubeful evals |
| `replay-player` | Vite + TypeScript | Debug web UI: load GNU SGF dumps and step through them |

`training-ground` and `game-engine` are not scaffolded. Do not add language toolchains, `package.json`, `pyproject.toml`, or an HTTP server unless the user asks.

## Docker

The only supported host tool is **Docker** (Engine + Compose v2). Do not install or invoke Node, Python, or pip on the host — even if they are on PATH ([ADR 0011](docs/decisions/0011-docker-only.md)). Run Compose **from the package directory**. Runtime TypeScript `node_modules` live in a Compose volume (Linux).

TypeScript npm scripts wrap Compose. They do not run `tsx` / Vite on the host. `*:inner` scripts are in-container only. If `npm` is missing, use the equivalent `docker compose` lines in that package’s `package.json`.

`install:host` writes IDE files onto the host bind-mount (TypeScript: `node_modules`; Python: `.venv` once `pyproject.toml` or `requirements.txt` exists). Do not run dumps, tests, Vite, or training against that host tree.

| Package | Tests | Run | IDE deps |
| --- | --- | --- | --- |
| `move-dumper` | `npm test` | Teacher API: `npm run up`. Dump: `npm run dump -- --matches 1 --seed 1` | `npm run install:host` |
| `replay-player` | `npm test` | `npm run up` (http://localhost:5173) | `npm run install:host` |
| `training-ground` | `docker compose run --rm train python -m pytest` (when tests exist) | `docker compose run --rm train <command>` (not scaffolded; data layout still open) | `docker compose --profile install-host run --rm install-host` |
| `game-engine` | `docker compose run --rm game-engine npm test` (when tests exist) | `npm run up` (http://localhost:3000; not scaffolded; HTTP framework still open) | `npm run install:host` |

Images: `node:22-bookworm` for TypeScript packages; `python:3.12-bookworm` for `training-ground`. Do not use `docker run -v "${PWD}:/app"` as the workflow.

## Hard rules

- Representations: JSON (source of truth), feature tensor, XGID. Specs: [docs/domain/board-representation.md](docs/domain/board-representation.md), [docs/domain/features.md](docs/domain/features.md). Do not add a fourth. GNU SGF is replay-only.
- Players are `p1` / `p2` ([ADR 0001](docs/decisions/0001-player-labels.md)).
- Evals: [docs/domain/evaluation.md](docs/domain/evaluation.md). Net = cubeless probs; API = cubeful wrap + cube action ([ADR 0003](docs/decisions/0003-doubling-cube.md)).
- Inference is ONNX in the TS engine, not Python-per-request ([ADR 0004](docs/decisions/0004-game-engine-typescript-onnx.md)).
- Dumps: [docs/domain/dump-format.md](docs/domain/dump-format.md) (`manifest.json` + gzip JSONL + SGF replay). Do not commit `move-dumper/dumps/`, checkpoints, or weights.
- Do not silently decide open questions. See [docs/decisions/0000-open-questions.md](docs/decisions/0000-open-questions.md). When the user decides, use the `record-decision` skill and write an ADR.

## Harness

This repo is used in **Cursor** and **Grok Build**. Shared truth is `AGENTS.md` + `docs/`. Cursor extras: `.cursor/`. Grok extras: `.grok/` (rules as `.md`; skills; agents). Keep those two trees in sync when you edit a skill, rule, or subagent. Do not add `CLAUDE.md`. In Grok Build, run `grok inspect` to confirm discovery.

## Where to look

- Domain facts: `docs/domain/`
- Architecture Decision Records: `docs/decisions/`
- Workflows: `.cursor/skills/` and `.grok/skills/`
- Standing constraints: `.cursor/rules/` and `.grok/rules/`
