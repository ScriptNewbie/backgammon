# Agent instructions

This is a seven-package monorepo. Do not add other top-level packages.

| Package | Stack | Job |
| --- | --- | --- |
| `ts-core` | TypeScript | Shared board types, apply-steps, legal moves, featurizer; Node match/MWC/cube formula, sim, teacher client, hedgehog client, XG sidecar client, SGF writer |
| `move-dumper` | TypeScript | Simulate games (no cube); dump labelled checker positions/moves from bgweb-api (GNU Backgammon nets) |
| `training-ground` | PyTorch → ONNX + ExecuTorch `.pte` | Train the cubeless eval net |
| `game-engine` | TypeScript + Hono + `onnxruntime-node` | Board + dice → legal moves with cubeful evals |
| `game-engine-fast` | CUDA C++ | GPU ply search; same `/evaluate` contract; arena driver only ([ADR 0028](docs/decisions/0028-game-engine-fast.md)). Not implemented yet |
| `gui` | Vite + TypeScript + Tailwind CSS | Web UI: play a match against `game-engine`; replay GNU SGF dumps |
| `battle-arena` | TypeScript | Play any driver against any driver (default: our engine vs teacher); win summary + SGF |

## Docker

The only supported host tool is **Docker** (Engine + Compose v2). Do not install or invoke host Node, npm, Python, or pip — even if they are on PATH ([ADR 0011](docs/decisions/0011-docker-only.md)). Run Compose **from the package directory**. Runtime TypeScript `node_modules` live in a Compose volume (Linux).

Host commands: [README.md](README.md). Do not wrap Compose in host npm. `*:inner` scripts (and `start` / `dev`) run inside the container, where npm exists.

`install-host` writes IDE files onto the host bind-mount (TypeScript: `node_modules`; Python: `.venv` once `pyproject.toml` or `requirements.txt` exists). Do not run dumps, tests, Vite, or training against that host tree.

Images: `node:22-bookworm` for TypeScript packages; `python:3.12-bookworm` plus a cu130 PyTorch wheel for `training-ground` ([ADR 0013](docs/decisions/0013-training-cuda.md)); an NVIDIA CUDA image with `gpus: all` for `game-engine-fast` ([ADR 0028](docs/decisions/0028-game-engine-fast.md)). Do not use `docker run -v "${PWD}:/app"` as the workflow.

## Hard rules

- Representations: JSON (source of truth), feature tensor, XGID. Specs: [docs/domain/board-representation.md](docs/domain/board-representation.md), [docs/domain/features.md](docs/domain/features.md). Do not add a fourth. GNU SGF is replay-only.
- Players are `p1` / `p2` ([ADR 0001](docs/decisions/0001-player-labels.md)).
- Evals: [docs/domain/evaluation.md](docs/domain/evaluation.md). Net = cubeless probs; API = cubeful wrap + cube action ([ADR 0003](docs/decisions/0003-doubling-cube.md), [ADR 0018](docs/decisions/0018-cube-wrap-formula.md)).
- Inference is ONNX in the TS engine, not Python-per-request ([ADR 0004](docs/decisions/0004-game-engine-typescript-onnx.md)). HTTP is Hono ([ADR 0017](docs/decisions/0017-hono.md)). Training also writes ExecuTorch `.pte` ([ADR 0014](docs/decisions/0014-export-onnx-and-pte.md)).
- Shared TS: [ADR 0016](docs/decisions/0016-ts-core.md), [ADR 0019](docs/decisions/0019-battle-arena.md). `gui` imports `ts-core`, not `move-dumper`. Arena SGF is debug-only; do not commit `battle-arena/replays/`.
- Dumps: [docs/domain/dump-format.md](docs/domain/dump-format.md) (`manifest.json` + gzip JSONL + SGF replay). Trainers read them in place via Compose (`/data/dumps`); split by `gameId` ([ADR 0012](docs/decisions/0012-training-data-layout.md)); featurized tensor cache ([ADR 0021](docs/decisions/0021-featurized-tensor-cache.md)). Do not commit `move-dumper/dumps/`, `battle-arena/replays/`, `training-ground/cache/`, checkpoints, or weights (`*.pt`, `*.onnx`, `*.pte`).
- Do not silently decide open questions. See [docs/decisions/0000-open-questions.md](docs/decisions/0000-open-questions.md). When the user decides, use the `record-decision` skill and write an ADR.

## Harness

This repo is used in **Cursor**, **Grok Build**, and **Claude Code** ([ADR 0024](docs/decisions/0024-claude-code-harness.md)). Shared truth is `AGENTS.md` + `docs/`. Cursor extras: `.cursor/`. Grok extras: `.grok/` (rules as `.md`; skills; agents). Claude Code reads this file natively and has no `CLAUDE.md`; its extras in `.claude/` are thin pointers into `.cursor/` (rules with `paths:` frontmatter, skills, agents) plus `settings.json`, which denies host `node` / `npm` / `npx` / `tsx` / `python` / `pip` and `docker run -v`. Personal Claude overrides go in `.claude/settings.local.json` (gitignored). When you edit a skill, rule, or subagent, edit `.cursor/` and keep the `.grok/` copy in sync; when you add or rename one, add the matching `.claude/` pointer. Do not add a `CLAUDE.md`, `.claude/CLAUDE.md`, or `CLAUDE.local.md`: any of them stops Claude Code from reading this file. In Grok Build, run `grok inspect` to confirm discovery; in Claude Code, `/context all` and `/agents` show what loaded.

## Where to look

- Host commands: [README.md](README.md)
- Domain facts: `docs/domain/`
- Architecture Decision Records: `docs/decisions/`
- Workflows: `.cursor/skills/` (copies in `.grok/skills/`, pointers in `.claude/skills/`)
- Standing constraints: `.cursor/rules/` (copies in `.grok/rules/`, pointers in `.claude/rules/`)
