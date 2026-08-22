# Packages

## ts-core

Shared TypeScript ([ADR 0016](../../docs/decisions/0016-ts-core.md), [ADR 0019](../../docs/decisions/0019-battle-arena.md)). Board types, apply-steps, legal moves, featurizer, GNU checker-move encode/decode (isomorphic). Node: `ts-core/match`, `ts-core/sim`, `ts-core/bgweb`, `ts-core/sgf` (writer).

- Specs: `docs/domain/board-representation.md`, `docs/domain/features.md`, `docs/domain/match-play.md`.
- Golden vectors: `training-ground/fixtures/features.json`.
- Do not add dump CLI, skill sampling, Vite UI, or the SGF **file** parser here.
- Docker only, from `ts-core/`: `npm test`, `npm run install:host`. Do not run `test:inner` on the host.

## move-dumper

TypeScript. Simulate matches between skill levels; dump labelled positions from foochu/bgweb-api.

- Loop / pairing: `docs/domain/move-dumper.md`. Match loop from `ts-core/sim`. Match MWC: `docs/domain/match-play.md`.
- JSON + evals: `docs/domain/board-representation.md`, `docs/domain/evaluation.md`.
- Batches: `docs/domain/dump-format.md` under `move-dumper/dumps/` (`manifest.json` + `records.jsonl.gz` + `replay/*.sgf`).
- Conversion: `docs/domain/gnubg.md`. Rank chosen plays by mover MWC. Do not call the gnubg CLI for labels. Never commit `dumps/`. Fixtures in `move-dumper/fixtures/` may be committed.
- Docker only, from `move-dumper/`: `npm run up`, `npm test`, `npm run dump -- …`, `npm run down`, `npm run install:host`. Do not run `dump:inner` / `test:inner` on the host.

## training-ground

PyTorch. Train cubeless net, export ONNX and ExecuTorch `.pte` ([ADR 0014](../../docs/decisions/0014-export-onnx-and-pte.md)). CUDA image ([ADR 0013](../../docs/decisions/0013-training-cuda.md)).

- JSON + tensor + cubeless labels: `docs/domain/board-representation.md`, `docs/domain/features.md`, `docs/domain/evaluation.md`.
- Teacher: `CubelessNet` (default 206→512→512→512→5, MSE; [ADR 0015](../../docs/decisions/0015-teacher-cubeless-mlp.md)). Featurizer: `src/training_ground/features.py`. Golden vectors: `fixtures/features.json`. Do not commit checkpoints / `cache/` / `*.pt` / `*.onnx` / `*.pte`.
- Data layout: [ADR 0012](../../docs/decisions/0012-training-data-layout.md). Compose mounts `../move-dumper/dumps` read-only at `/data/dumps`. Split by `matchId` sha256-mod-100 (train `0–89`, val `90–94`, test `95–99`). Do not copy dumps into `training-ground/`.
- Docker only, from `training-ground/`: `docker compose run --rm train python -m pytest`; `docker compose run --rm train python -m training_ground.train --dumps /data/dumps --epochs 20 --batch-size 1024 --checkpoint-dir checkpoints` (`gpus: all` on `train`). IDE `.venv`: `docker compose --profile install-host run --rm install-host`. Do not run host `python` / `pip`. Do not list `torch` as a PyPI dependency.

## game-engine

TypeScript + Hono + `onnxruntime-node` ([ADR 0017](../../docs/decisions/0017-hono.md)). No Python per request.

- Bodies and evals: `docs/domain/game-engine.md`, `docs/domain/board-representation.md`, `docs/domain/evaluation.md`, `docs/domain/features.md`.
- Rank checker plays by negated cubeful equity of the resulting position. Cube wrap: [ADR 0018](../../docs/decisions/0018-cube-wrap-formula.md).
- Docker only, from `game-engine/`: `npm run up` (http://localhost:3000), `npm test`, `npm run install:host`. Port 3000 is the Compose publish port only.

## replay-player

Vite + vanilla TypeScript. Debug viewer for GNU Backgammon SGF dumps ([ADR 0010](../../docs/decisions/0010-replay-player.md)).

- Load GNU SGF via file picker from `move-dumper/dumps/<batch>/replay/` or `battle-arena/replays/`. Step with Previous / Next.
- From `replay-player/`: `npm run up` (http://localhost:5173), `npm test`, `npm run install:host`. Do not run `test:inner` / `dev` on the host.
- Reconstruct position JSON from SGF events. Do not parse JSONL. Import `ts-core`, not `move-dumper`. Training ignores SGF.

## battle-arena

TypeScript. Play our game-engine against the bgweb-api teacher at max strength ([ADR 0019](../../docs/decisions/0019-battle-arena.md)).

- Loop: `ts-core/sim`. Drivers: `POST /evaluate` and teacher `getmoves`. Rank checkers by mover MWC. Shared infallible cube heuristic (`--no-cube` disables it).
- SGF under gitignored `battle-arena/replays/`. No training JSONL. Open in replay-player or gnubg.
- Docker only, from `battle-arena/`: `npm run up`, `npm test`, `npm run battle -- --matches 1 --seed 1`, `npm run down`, `npm run install:host`. Do not run `battle:inner` / `test:inner` on the host. Requires `training-ground/checkpoints/cubeless.onnx`.
