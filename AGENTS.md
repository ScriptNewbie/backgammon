# Agent instructions

This is a six-package monorepo. Do not add other top-level packages.

| Package | Stack | Job |
| --- | --- | --- |
| `ts-core` | TypeScript | Shared board types, apply-steps, legal moves, featurizer; Node match/MWC/cube formula, sim, teacher client, SGF writer |
| `move-dumper` | TypeScript | Simulate games (no cube); dump labelled checker positions/moves from bgweb-api (GNU Backgammon nets) |
| `training-ground` | PyTorch → ONNX + ExecuTorch `.pte` | Train the cubeless eval net |
| `game-engine` | TypeScript + Hono + `onnxruntime-node` | Board + dice → legal moves with cubeful evals |
| `replay-player` | Vite + TypeScript | Debug web UI: load GNU SGF dumps and step through them |
| `battle-arena` | TypeScript | Play engines against each other (v1: our engine vs teacher); win summary + SGF |

## Docker

The only supported host tool is **Docker** (Engine + Compose v2). Do not install or invoke Node, Python, or pip on the host — even if they are on PATH ([ADR 0011](docs/decisions/0011-docker-only.md)). Run Compose **from the package directory**. Runtime TypeScript `node_modules` live in a Compose volume (Linux).

TypeScript npm scripts wrap Compose. They do not run `tsx` / Vite on the host. `*:inner` scripts are in-container only. If `npm` is missing, use the equivalent `docker compose` lines in that package’s `package.json`.

`install:host` writes IDE files onto the host bind-mount (TypeScript: `node_modules`; Python: `.venv` once `pyproject.toml` or `requirements.txt` exists). Do not run dumps, tests, Vite, or training against that host tree.

| Package | Tests | Run | IDE deps |
| --- | --- | --- | --- |
| `ts-core` | `npm test` | (library; no HTTP) | `npm run install:host` |
| `move-dumper` | `npm test` | Teacher API: `npm run up`. Dump: `npm run dump -- --games 1 --seed 1` | `npm run install:host` |
| `replay-player` | `npm test` | `npm run up` (http://localhost:5173) | `npm run install:host` |
| `training-ground` | `docker compose run --rm train python -m pytest` | `docker compose run --rm train python -m training_ground.train --dumps /data/dumps --epochs 20 --batch-size 1024 --checkpoint-dir checkpoints` (CUDA image, `gpus: all`; dumps at `/data/dumps`, [ADR 0012](docs/decisions/0012-training-data-layout.md), [ADR 0013](docs/decisions/0013-training-cuda.md), [ADR 0015](docs/decisions/0015-teacher-cubeless-mlp.md)) | `docker compose --profile install-host run --rm install-host` |
| `game-engine` | `npm test` | `npm run up` (http://localhost:3000) | `npm run install:host` |
| `battle-arena` | `npm test` | Teacher + engine: `npm run up`. Battle: `npm run battle -- --matches 1 --seed 1` | `npm run install:host` |

Images: `node:22-bookworm` for TypeScript packages; `python:3.12-bookworm` plus a cu130 PyTorch wheel for `training-ground` ([ADR 0013](docs/decisions/0013-training-cuda.md)). Do not use `docker run -v "${PWD}:/app"` as the workflow.

## Hard rules

- Representations: JSON (source of truth), feature tensor, XGID. Specs: [docs/domain/board-representation.md](docs/domain/board-representation.md), [docs/domain/features.md](docs/domain/features.md). Do not add a fourth. GNU SGF is replay-only.
- Players are `p1` / `p2` ([ADR 0001](docs/decisions/0001-player-labels.md)).
- Evals: [docs/domain/evaluation.md](docs/domain/evaluation.md). Net = cubeless probs; API = cubeful wrap + cube action ([ADR 0003](docs/decisions/0003-doubling-cube.md), [ADR 0018](docs/decisions/0018-cube-wrap-formula.md)).
- Inference is ONNX in the TS engine, not Python-per-request ([ADR 0004](docs/decisions/0004-game-engine-typescript-onnx.md)). HTTP is Hono ([ADR 0017](docs/decisions/0017-hono.md)). Training also writes ExecuTorch `.pte` ([ADR 0014](docs/decisions/0014-export-onnx-and-pte.md)).
- Shared TS: [ADR 0016](docs/decisions/0016-ts-core.md), [ADR 0019](docs/decisions/0019-battle-arena.md). Replay-player imports `ts-core`, not `move-dumper`. Arena SGF is debug-only; do not commit `battle-arena/replays/`.
- Dumps: [docs/domain/dump-format.md](docs/domain/dump-format.md) (`manifest.json` + gzip JSONL + SGF replay). Trainers read them in place via Compose (`/data/dumps`); split by `matchId` ([ADR 0012](docs/decisions/0012-training-data-layout.md)). Do not commit `move-dumper/dumps/`, `battle-arena/replays/`, `training-ground/cache/`, checkpoints, or weights (`*.pt`, `*.onnx`, `*.pte`).
- Do not silently decide open questions. See [docs/decisions/0000-open-questions.md](docs/decisions/0000-open-questions.md). When the user decides, use the `record-decision` skill and write an ADR.

## Harness

This repo is used in **Cursor** and **Grok Build**. Shared truth is `AGENTS.md` + `docs/`. Cursor extras: `.cursor/`. Grok extras: `.grok/` (rules as `.md`; skills; agents). Keep those two trees in sync when you edit a skill, rule, or subagent. Do not add `CLAUDE.md`. In Grok Build, run `grok inspect` to confirm discovery.

## Where to look

- Domain facts: `docs/domain/`
- Architecture Decision Records: `docs/decisions/`
- Workflows: `.cursor/skills/` and `.grok/skills/`
- Standing constraints: `.cursor/rules/` and `.grok/rules/`
