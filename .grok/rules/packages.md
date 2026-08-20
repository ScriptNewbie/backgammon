# Packages

## move-dumper

TypeScript (not scaffolded). Simulate matches between skill levels; dump labelled positions from foochu/bgweb-api.

- Loop / pairing: `docs/domain/move-dumper.md`. Match MWC: `docs/domain/match-play.md`.
- JSON + evals: `docs/domain/board-representation.md`, `docs/domain/evaluation.md`.
- Batches: `docs/domain/dump-format.md` under `move-dumper/dumps/` (`manifest.json` + `records.jsonl.gz` + `replay/*.sgf`).
- Conversion: `docs/domain/gnubg.md`. Rank chosen plays by mover MWC. Do not call the gnubg CLI for labels. Never commit `dumps/`. Fixtures in `move-dumper/fixtures/` may be committed.

## training-ground

PyTorch (not scaffolded). Train cubeless net, export ONNX.

- JSON + tensor + cubeless labels: `docs/domain/board-representation.md`, `docs/domain/features.md`, `docs/domain/evaluation.md`.
- Same 206-float featurizer as TypeScript; golden fixtures. Do not commit checkpoints / `*.pt` / `*.onnx`.

## game-engine

TypeScript + `onnxruntime-node` (not scaffolded). No Python per request.

- Bodies and evals: `docs/domain/board-representation.md`, `docs/domain/evaluation.md`, `docs/domain/features.md`.
- Rank checker plays by negated cubeful equity of the resulting position. HTTP framework is still open.

## replay-player

Vite + vanilla TypeScript. Debug viewer for GNU Backgammon SGF dumps ([ADR 0010](../../docs/decisions/0010-replay-player.md)).

- Load `move-dumper/dumps/<batch>/replay/<matchId>.sgf` via file picker. Step with Previous / Next.
- Start with `docker compose up` in `replay-player/` (http://localhost:5173).
- Reconstruct position JSON from SGF events. Do not parse JSONL. Do not import `move-dumper`. Training ignores SGF.
