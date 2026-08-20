# Agent instructions

This is a four-package monorepo. Do not add other top-level packages.

| Package | Stack | Job |
| --- | --- | --- |
| `move-dumper` | TypeScript | Simulate matches; dump labelled positions/moves from bgweb-api (GNU Backgammon nets) |
| `training-ground` | PyTorch → ONNX export | Train the cubeless eval net |
| `game-engine` | TypeScript + `onnxruntime-node` | Board + dice → legal moves with cubeful evals |
| `replay-player` | Vite + TypeScript | Debug web UI: load GNU SGF dumps and step through them |

Packages are not scaffolded. Do not add language toolchains, `package.json`, `pyproject.toml`, or an HTTP server unless the user asks.

## Node / npm

`move-dumper` and `replay-player` need Node.js ≥ 20. Prefer `node` and `npm` on PATH. If either is missing, do **not** stop — run the same commands in Docker from the package directory:

```sh
docker run --rm -v "${PWD}:/app" -w /app node:22-bookworm npm install
docker run --rm -v "${PWD}:/app" -w /app node:22-bookworm npm test
```

To start the replay UI from `replay-player/`: `docker compose up` (http://localhost:5173).

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
