# Packages

## move-dumper

TypeScript. Simulate matches between skill levels; dump labelled positions from foochu/bgweb-api.

- Loop / pairing: `docs/domain/move-dumper.md`. Match MWC: `docs/domain/match-play.md`.
- JSON + evals: `docs/domain/board-representation.md`, `docs/domain/evaluation.md`.
- Batches: `docs/domain/dump-format.md` under `move-dumper/dumps/` (`manifest.json` + `records.jsonl.gz` + `replay/*.sgf`).
- Conversion: `docs/domain/gnubg.md`. Rank chosen plays by mover MWC. Do not call the gnubg CLI for labels. Never commit `dumps/`. Fixtures in `move-dumper/fixtures/` may be committed.
- Docker only, from `move-dumper/`: `npm run up`, `npm test`, `npm run dump -- …`, `npm run down`, `npm run install:host`. Do not run `dump:inner` / `test:inner` on the host.

## training-ground

PyTorch (not scaffolded). Train cubeless net, export ONNX.

- JSON + tensor + cubeless labels: `docs/domain/board-representation.md`, `docs/domain/features.md`, `docs/domain/evaluation.md`.
- Same 206-float featurizer as TypeScript; golden fixtures. Do not commit checkpoints / `*.pt` / `*.onnx`.
- Docker only, from `training-ground/`: `docker compose run --rm train python -m pytest` (when tests exist); `docker compose run --rm train <command>`. IDE `.venv`: `docker compose --profile install-host run --rm install-host` (no-op until deps files exist). Do not run host `python` / `pip`. Data layout is still open.

## game-engine

TypeScript + `onnxruntime-node` (not scaffolded). No Python per request.

- Bodies and evals: `docs/domain/board-representation.md`, `docs/domain/evaluation.md`, `docs/domain/features.md`.
- Rank checker plays by negated cubeful equity of the resulting position. HTTP framework is still open.
- Docker only, from `game-engine/`: `npm run up` (http://localhost:3000), `npm run install:host`. Port 3000 is the Compose publish port only.

## replay-player

Vite + vanilla TypeScript. Debug viewer for GNU Backgammon SGF dumps ([ADR 0010](../../docs/decisions/0010-replay-player.md)).

- Load `move-dumper/dumps/<batch>/replay/<matchId>.sgf` via file picker. Step with Previous / Next.
- From `replay-player/`: `npm run up` (http://localhost:5173), `npm test`, `npm run install:host`. Do not run `test:inner` / `dev` on the host.
- Reconstruct position JSON from SGF events. Do not parse JSONL. Do not import `move-dumper`. Training ignores SGF.
