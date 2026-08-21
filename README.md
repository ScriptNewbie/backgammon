# Backgammon

A backgammon engine split into four packages. **Docker** (Engine + Compose v2) is required — do not install Python or a Node toolchain for the app itself ([ADR 0011](docs/decisions/0011-docker-only.md)). npm scripts only launch Compose. Run each command from that package’s directory. After clone, `npm run install:host` in each TypeScript package (and the Compose equivalent in `training-ground/`) so the IDE can see types.

| Package | Role | Tests | Run | IDE deps |
| --- | --- | --- | --- | --- |
| `move-dumper` | TypeScript tool that simulates matches and dumps positions and move evaluations from [bgweb-api](https://github.com/foochu/bgweb-api) (GNU Backgammon nets over HTTP) | `npm test` | Teacher: `npm run up`. Dump: `npm run dump -- --matches 1 --seed 1` | `npm run install:host` |
| `training-ground` | PyTorch training; exports ONNX (not scaffolded) | `docker compose run --rm train python -m pytest` | `docker compose run --rm train <command>` | `docker compose --profile install-host run --rm install-host` |
| `game-engine` | TypeScript HTTP API: board + dice → legal moves with evaluations; infers the net via ONNX Runtime (not scaffolded) | `docker compose run --rm game-engine npm test` | `npm run up` (http://localhost:3000) | `npm run install:host` |
| `replay-player` | Vite web app that steps through GNU Backgammon SGF dumps | `npm test` | `npm run up` (http://localhost:5173) | `npm run install:host` |

Money play includes a doubling cube. **v1 dumps are match play** (Crawford, sampled odd match lengths). Players are `p1` / `p2`. Agent instructions: [AGENTS.md](AGENTS.md) and `docs/`. Cursor and Grok Build both use that file; Grok-native copies live under `.grok/`. In a Grok terminal: `grok` then `grok inspect`.
