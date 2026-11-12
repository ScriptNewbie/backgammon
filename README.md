# Backgammon

A backgammon engine split into seven packages. **Docker** (Engine + Compose v2) is the only supported runtime — do not install Python or a Node toolchain on the host ([ADR 0011](docs/decisions/0011-docker-only.md)). Run every command from that package’s directory.

| Package | Role |
| --- | --- |
| `ts-core` | Shared TypeScript: board, legal moves, featurizer; Node match/MWC/cube, sim, gnubg sidecar client, hedgehog client, XG sidecar client, SGF writer ([ADR 0016](docs/decisions/0016-ts-core.md), [ADR 0019](docs/decisions/0019-battle-arena.md), [ADR 0022](docs/decisions/0022-hedgehog-external.md), [ADR 0030](docs/decisions/0030-hedgehog-plays-itself.md), [ADR 0031](docs/decisions/0031-gnubg-cli-sidecar.md), [ADR 0025](docs/decisions/0025-xg-gui-sidecar.md)) |
| `move-dumper` | Simulates money games (no cube) and dumps checker plays labelled by GNU Backgammon (the `gnubg` CLI sidecar, [ADR 0031](docs/decisions/0031-gnubg-cli-sidecar.md)) |
| `training-ground` | PyTorch training of the cubeless eval net; exports ONNX and ExecuTorch `.pte` ([ADR 0014](docs/decisions/0014-export-onnx-and-pte.md)). CUDA image ([ADR 0013](docs/decisions/0013-training-cuda.md)) |
| `game-engine` | TypeScript HTTP API (Hono): board + dice → legal moves with evaluations; infers the net via ONNX Runtime |
| `game-engine-fast` | CUDA C++ HTTP API on the GPU: same `/evaluate` contract plus ply search; arena driver ([ADR 0028](docs/decisions/0028-game-engine-fast.md)) |
| `gui` | Vite + Tailwind web app: play a match against `game-engine`, or step through GNU Backgammon SGF dumps (dumper or arena) ([ADR 0027](docs/decisions/0027-gui-play-vs-engine.md)) |
| `battle-arena` | Play any driver against any driver (default: our engine vs GNU Backgammon); win summary + SGF ([ADR 0019](docs/decisions/0019-battle-arena.md), [ADR 0023](docs/decisions/0023-arena-any-driver.md)) |

Money play includes a doubling cube in the engine and arena. **Dumper dumps are money games without a cube** ([ADR 0020](docs/decisions/0020-dumper-games-no-cube.md)). Players are `p1` / `p2`. Agent instructions: [AGENTS.md](AGENTS.md) and `docs/`. Cursor, Grok Build, and Claude Code all use that file; Grok-native copies live under `.grok/`, Claude Code reads `AGENTS.md` natively and `.claude/` holds pointers into `.cursor/`. In a Grok terminal: `grok` then `grok inspect`. In Claude Code: `claude` from the repo root.

## How to run commands

Host tool is **Docker Compose**. `package.json` scripts named `*:inner` (and `start` / `dev` in the engine and GUI) run **inside** the container, where npm exists. Do not wrap Compose in host npm.

```sh
cd <package>
docker compose …
```

Runtime TypeScript `node_modules` live in a Compose volume (Linux binaries). Do not run dumps, tests, Vite, or training against the host `install-host` tree.

## End-to-end

Typical path from labelled games to a battling engine:

1. Dump games labelled by GNU Backgammon (`move-dumper`).
2. Train the cubeless net and export `cubeless.onnx` (`training-ground`).
3. Serve the engine (`game-engine`) or play any driver against any driver (`battle-arena`; default is the engine vs GNU Backgammon).
4. Play the engine in `gui`, or open GNU SGF there (or in gnubg).

`game-engine` needs `training-ground/checkpoints/cubeless.onnx`. Training needs dumps under `move-dumper/dumps/` (Compose mounts them at `/data/dumps`).

## ts-core

Library only (no HTTP). From `ts-core/`:

```sh
docker compose --profile test run --rm test
docker compose --profile install-host run --rm install-host
```

`install-host` writes `node_modules` onto the host bind-mount so the IDE can typecheck. Do not run `test:inner` on the host.

## move-dumper

Writes `move-dumper/dumps/<batch>/` (`manifest.json` + gzip JSONL + `replay/*.sgf`). Never commit `dumps/`. SIGINT/SIGTERM finishes after the current game.

From `move-dumper/`:

```sh
# gnubg sidecar (builds on first run; http://127.0.0.1:8080 on the host, http://gnubg:8080 for the dumper)
docker compose up -d

docker compose --profile test run --rm test

# labelled games (Compose sets GNUBG_BASE_URL); default GnuBG world class (2-ply, gnubg filter)
docker compose --profile dumper run --rm dumper npm run dump:inner -- --games 1 --seed 1
# every play searched at 1-ply
docker compose --profile dumper run --rm dumper npm run dump:inner -- --games 1 --seed 1 --ply 1 --label-filter all

docker compose down
docker compose --profile install-host run --rm install-host
```

Dumper flags (after `--`):

| Flag | Default | Meaning |
| --- | --- | --- |
| `--games N` | `1` | Number of independent money games (no cube) |
| `--seed N` | `1` | RNG seed stored on the batch manifest |
| `--ply N` | `2` | GnuBG ply of the labels, 0–4 |
| `--label-filter F` | `gnubg` | `gnubg`: GnuBG's own move filter (top plays at `--ply`, the rest shallower; how bgweb-api labelled). `all`: every play at `--ply` |
| `--base-url URL` | `GNUBG_BASE_URL` or `http://127.0.0.1:8080` | gnubg sidecar origin (set by Compose) |

There is no `--matches` / `--length`. Help: add `--help` after `--`.

## training-ground

CUDA image, `gpus: all` on `train` ([ADR 0013](docs/decisions/0013-training-cuda.md)). Host NVIDIA driver 580+ and NVIDIA Container Toolkit. Reads dumps at `/data/dumps`. Split by `gameId` ([ADR 0012](docs/decisions/0012-training-data-layout.md)). Never commit `checkpoints/`, `cache/`, `*.pt`, `*.onnx`, or `*.pte`.

From `training-ground/`:

```sh
docker compose run --rm train python -m pytest

# train the cubeless teacher net
docker compose run --rm train python -m training_ground.train --dumps /data/dumps --epochs 20 --batch-size 1024 --checkpoint-dir checkpoints --cache-dir cache

# train and export ONNX + ExecuTorch .pte for the engine (writes checkpoints/cubeless.onnx)
docker compose run --rm train python -m training_ground.train --dumps /data/dumps --epochs 20 --batch-size 1024 --checkpoint-dir checkpoints --export-stem checkpoints/cubeless

# write only checkpoints/cubeless-fast.onnx from an existing checkpoint (no training)
docker compose run --rm train python -m training_ground.export --checkpoint checkpoints/best.pt --stem checkpoints/cubeless

# continue from a checkpoint
docker compose run --rm train python -m training_ground.train --dumps /data/dumps --epochs 40 --batch-size 1024 --checkpoint-dir checkpoints --resume checkpoints/best.pt --export-stem checkpoints/cubeless

docker compose --profile install-host run --rm install-host
```

`install-host` writes a Linux `.venv` for IDE typechecking. It is not a host interpreter; do not train against it.

Train flags:

| Flag | Default | Meaning |
| --- | --- | --- |
| `--dumps` | `/data/dumps` | Dump root (Compose mount) |
| `--epochs` | `20` | Training epochs |
| `--batch-size` | `1024` | Mini-batch size |
| `--lr` | `1e-3` | Adam learning rate |
| `--hidden-size` | `512` | Hidden layer width |
| `--layers` | `3` | Hidden Linear+ReLU count |
| `--checkpoint-dir` | `checkpoints` | Writes `best.pt` |
| `--export-stem` | (off) | Write `<stem>.onnx` and `<stem>.pte` (batch 1) plus `<stem>-fast.onnx` (dynamic batch, [ADR 0028](docs/decisions/0028-game-engine-fast.md)) after training |
| `--resume` | (off) | Load a `.pt` checkpoint and continue |
| `--seed` | `1` | RNG seed |
| `--num-workers` | `0` | DataLoader workers |
| `--cache-dir` | `cache` | Featurized tensor cache ([ADR 0021](docs/decisions/0021-featurized-tensor-cache.md)) |
| `--rebuild-cache` | (off) | Wipe and rebuild the tensor cache |

`--export-stem checkpoints/cubeless` is the model `game-engine` loads (`MODEL_PATH=/models/cubeless.onnx`).

## game-engine

Needs `training-ground/checkpoints/cubeless.onnx` (Compose mounts that directory at `/models`). Port **3000**. From `game-engine/`:

```sh
docker compose up
# Ctrl+C to stop; or in another shell:
docker compose down

docker compose --profile test run --rm test
docker compose --profile install-host run --rm install-host
```

http://localhost:3000 — `GET /health` → `{"ok":true}`. `POST /evaluate` with a position JSON (dice required) returns legal checker plays best first for the mover at the match score (`moves[0]` is the engine's play). `POST /cube` (doubler on roll, `dice: null`) returns the engine's own double/take. Contract: [docs/domain/game-engine.md](docs/domain/game-engine.md).

## game-engine-fast

CUDA C++ engine on the GPU ([ADR 0028](docs/decisions/0028-game-engine-fast.md)). Same `/evaluate` contract as `game-engine`, plus `?ply=N` (`0`-`4`; see the domain doc for timings). Needs an NVIDIA GPU (`gpus: all`) and `training-ground/checkpoints/cubeless-fast.onnx` (see training-ground). Port **3001**. Each container start configures and incrementally builds into the `game_engine_fast_build` volume (first build fetches dependencies and takes a few minutes). From `game-engine-fast/`:

```sh
docker compose up
docker compose down

docker compose --profile test run --rm test
docker compose --profile gpu-info run --rm gpu-info
```

http://localhost:3001 — `GET /health`, `POST /evaluate?ply=N`, `POST /cube?ply=N`. Contract: [docs/domain/game-engine-fast.md](docs/domain/game-engine-fast.md). Optional tuning from the host environment, for example `SEARCH_MAX_LEAF_VISITS=40000000 docker compose up` (leaf budget per request; heavy 4-ply positions over it get a `400`). All variables: the domain doc, section Limits.

## gui

Two screens. **Play**: a match against `game-engine` (live cube, random dice); start the engine first (`docker compose up` in `game-engine/`, needs `cubeless.onnx`). **Replay**: GNU SGF (`FF[4]` `GM[6]`) from `move-dumper/dumps/<batch>/replay/` or `battle-arena/replays/`, file picker only. Spec: [docs/domain/gui.md](docs/domain/gui.md). From `gui/`:

```sh
docker compose up --build
docker compose down

docker compose --profile test run --rm test
docker compose --profile install-host run --rm install-host
```

http://localhost:5173 — **Play**: pick a match length, New match, click checkers (Swap dice / Undo / Done). **Replay**: pick an `.sgf` and step with Previous / Next. The dev server proxies `/api/engine` to `ENGINE_URL` (default `http://host.docker.internal:3000`).

## battle-arena

Starts the gnubg sidecar + game-engine, then plays matches. A `game-engine` side needs `training-ground/checkpoints/cubeless.onnx`. Writes gitignored `battle-arena/replays/`. From `battle-arena/`:

```sh
docker compose up -d

docker compose --profile test run --rm test

docker compose --profile arena run --rm arena npm run battle:inner -- --matches 1 --seed 1 --length 7
docker compose --profile arena run --rm arena npm run battle:inner -- --matches 1 --seed 1 --no-cube
docker compose --profile arena run --rm arena npm run battle:inner -- --a game-engine --b hedgehog --b-ply 0 --matches 1 --seed 1
docker compose --profile arena run --rm -e XG_BASE_URL=http://host.docker.internal:8091 arena npm run battle:inner -- --a game-engine --b xg --matches 1 --seed 1 --length 1

# GPU engine side (opt-in service; needs an NVIDIA GPU and cubeless-fast.onnx)
docker compose up -d game-engine-fast
docker compose --profile arena run --rm arena npm run battle:inner -- --a game-engine-fast --a-ply 0 --b game-engine --matches 1 --seed 1

docker compose down
docker compose --profile install-host run --rm install-host
```

`game-engine-fast` shares its build volume with `game-engine-fast/`; Compose warns that the volume was created by the other project. That is expected.

Battle flags (after `--`):

| Flag | Default | Meaning |
| --- | --- | --- |
| `--matches N` | `1` | Number of matches |
| `--seed N` | `1` | RNG seed |
| `--length N` | `7` | Match length `1,3,5,7,9,11,13,15` |
| `--no-cube` | (off) | Checker-only; never offer, take, or drop |
| `--a DRIVER` | `game-engine` | Side a: `game-engine`, `game-engine-fast`, `gnubg`, `hedgehog`, or `xg` (`teacher` still works as an old name for `gnubg`) |
| `--b DRIVER` | `gnubg` | Side b. Same driver on both sides is allowed |
| `--a-url URL` / `--b-url URL` | by driver | `ENGINE_BASE_URL` / `FAST_ENGINE_BASE_URL` / `GNUBG_BASE_URL` / `HEDGEHOG_BASE_URL` / `XG_BASE_URL`, or `http://127.0.0.1:3000` / `:3001` / `:8080` / `:8090` / `:8091` |
| `--a-ply N` / `--b-ply N` | `2` gnubg, `1` hedgehog, `0` game-engine-fast | GnuBG ply (0 = net, 1 = one opponent roll). gnubg 0–4, hedgehog 0–1, game-engine-fast 0–4. Other drivers ignore it and warn |

An `xg` side needs eXtreme Gammon 2 and its host sidecar running first ([docs/domain/xg.md](docs/domain/xg.md)).

Help: add `--help` after `--`.

## IDE deps (optional)

After clone, so the editor can see types. From each TypeScript package and from `training-ground/`:

```sh
docker compose --profile install-host run --rm install-host
```

Do not use these trees to run dumps, tests, Vite, or training.
