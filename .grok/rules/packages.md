# Packages

## ts-core

Shared TypeScript ([ADR 0016](../../docs/decisions/0016-ts-core.md), [ADR 0019](../../docs/decisions/0019-battle-arena.md)). Board types, apply-steps, legal moves, featurizer, GNU checker-move encode/decode (isomorphic). Node: `ts-core/match`, `ts-core/sim`, `ts-core/bgweb`, `ts-core/hedgehog`, `ts-core/xg` (eXtreme Gammon sidecar client), `ts-core/sgf` (writer).

- Specs: `docs/domain/board-representation.md`, `docs/domain/features.md`, `docs/domain/match-play.md`.
- Golden vectors: `training-ground/fixtures/features.json`.
- Do not add dump CLI, skill sampling, Vite UI, or the SGF **file** parser here.
- Docker only, from `ts-core/`. Host commands: [README.md](../../README.md). Do not run `test:inner` on the host.

## move-dumper

TypeScript. Simulate money games (no cube) between skill levels; dump labelled checker positions from foochu/bgweb-api ([ADR 0020](../../docs/decisions/0020-dumper-games-no-cube.md)).

- Loop / pairing: `docs/domain/move-dumper.md`. Game loop from `ts-core/sim` `playGame({ allowCube: false })`.
- JSON + evals: `docs/domain/board-representation.md`, `docs/domain/evaluation.md`.
- Batches: `docs/domain/dump-format.md` under `move-dumper/dumps/` (`manifest.json` + `records.jsonl.gz` + `replay/*.sgf`). Manifest `play` is `"game"`. Records have `gameId`; do not write `matchId`.
- Conversion: `docs/domain/gnubg.md`. Rank chosen plays by negated result cubeless equity (`RankedPlay.rankScore`, not `moverMwc`). Loop lives in `src/games.ts`. Do not call the gnubg CLI for labels. Never commit `dumps/`. Fixtures in `move-dumper/fixtures/` may be committed.
- Docker only, from `move-dumper/`. Host commands: [README.md](../../README.md). Do not run `dump:inner` / `test:inner` on the host.

## training-ground

PyTorch. Train cubeless net, export ONNX and ExecuTorch `.pte` ([ADR 0014](../../docs/decisions/0014-export-onnx-and-pte.md)). CUDA image ([ADR 0013](../../docs/decisions/0013-training-cuda.md)).

- JSON + tensor + cubeless labels: `docs/domain/board-representation.md`, `docs/domain/features.md`, `docs/domain/evaluation.md`.
- Teacher: `CubelessNet` (default 206→512→512→512→5, MSE; [ADR 0015](../../docs/decisions/0015-teacher-cubeless-mlp.md)). Featurizer: `src/training_ground/features.py`. Golden vectors: `fixtures/features.json`. Do not commit checkpoints / `cache/` / `*.pt` / `*.onnx` / `*.pte`.
- Data layout: [ADR 0012](../../docs/decisions/0012-training-data-layout.md), featurized cache [ADR 0021](../../docs/decisions/0021-featurized-tensor-cache.md). Compose mounts `../move-dumper/dumps` read-only at `/data/dumps`. Split by `gameId` sha256-mod-100 (train `0–89`, val `90–94`, test `95–99`); fall back to `matchId` if `gameId` is missing. New dumps are cubeless games with `gameId` only. `position.match` is `null`; do not treat the dead cube as live cube labels. Do not copy dumps into `training-ground/`. Tensor cache: `training-ground/cache/` (content-hash invalidation; do not commit).
- Docker only, from `training-ground/`. Host commands: [README.md](../../README.md) (`gpus: all` on `train`). Do not run host `python` / `pip`. Do not list `torch` as a PyPI dependency.

## game-engine

TypeScript + Hono + `onnxruntime-node` ([ADR 0017](../../docs/decisions/0017-hono.md)). No Python per request.

- Bodies and evals: `docs/domain/game-engine.md`, `docs/domain/board-representation.md`, `docs/domain/evaluation.md`, `docs/domain/features.md`.
- Rank checker plays by negated cubeful equity of the resulting position. Cube wrap: [ADR 0018](../../docs/decisions/0018-cube-wrap-formula.md).
- Docker only, from `game-engine/`. Host commands: [README.md](../../README.md) (http://localhost:3000). Port 3000 is the Compose publish port only.

## gui

Vite + vanilla TypeScript + Tailwind CSS. **Play** a match against `game-engine` and **Replay** GNU SGF ([ADR 0027](../../docs/decisions/0027-gui-play-vs-engine.md), spec [gui.md](../../docs/domain/gui.md)).

- From `gui/`. Host commands: [README.md](../../README.md) (http://localhost:5173). Do not run `test:inner` / `dev` on the host.
- Play: human `p1` vs engine `p2`, live cube, random dice; engine via Vite proxy `/api/engine/evaluate`; cube decisions from eval `cubeAction`. Click a checker → first legal die; Swap dice / Undo / Done.
- Replay: GNU SGF via file picker from `move-dumper/dumps/<batch>/replay/` or `battle-arena/replays/`. Step with Previous / Next. Do not parse JSONL.
- Tailwind utilities, solid colors, no gradients. Dice roll in 3D and land flat. Animations ignore the OS reduce-motion setting.
- Import `ts-core` (browser exports only), not `move-dumper`. Training ignores SGF and play results.

## battle-arena

TypeScript. Play any driver against any driver at max strength ([ADR 0019](../../docs/decisions/0019-battle-arena.md), [ADR 0023](../../docs/decisions/0023-arena-any-driver.md)). Default is game-engine vs the bgweb-api teacher.

- Loop: `ts-core/sim`. Drivers: `POST /evaluate`, teacher `getmoves`, the Hedgehog sidecar (`docs/domain/hedgehog.md`), and the eXtreme Gammon GUI sidecar (`docs/domain/xg.md`, [ADR 0025](../../docs/decisions/0025-xg-gui-sidecar.md); XG plays its own top move and its own cube). Do not vendor Hedgehog or `.ogxf` weights, do not touch the XG binary, memory, or settings, and do not label dumps from either. The same driver may sit on both sides. `ply` is GnuBG 0 or 1 (default 1) per side and hedgehog only; other drivers drop it and warn. Rank checkers by mover MWC. Shared infallible cube heuristic (`--no-cube` disables it).
- SGF under gitignored `battle-arena/replays/`. No training JSONL. Open in `gui` or gnubg.
- Docker only, from `battle-arena/`. Host commands: [README.md](../../README.md). Do not run `battle:inner` / `test:inner` on the host. A game-engine side requires `training-ground/checkpoints/cubeless.onnx`.
