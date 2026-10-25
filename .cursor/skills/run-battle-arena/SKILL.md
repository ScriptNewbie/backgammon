---
name: run-battle-arena
description: Workflow for playing any driver against any driver in battle-arena, including Compose, CLI flags, per-side ply, MWC ranking, cube policy, and GNU SGF replays. Use when implementing or running battle-arena, driver versus driver matches, or arena summaries.
---

# Run a driver versus a driver

TypeScript. Docker only ([ADR 0011](docs/decisions/0011-docker-only.md), [ADR 0019](docs/decisions/0019-battle-arena.md), [ADR 0023](docs/decisions/0023-arena-any-driver.md)). Simulation: [docs/domain/battle-arena.md](docs/domain/battle-arena.md). Match math: [docs/domain/match-play.md](docs/domain/match-play.md).

## Steps

1. Read those domain docs plus [docs/domain/game-engine.md](docs/domain/game-engine.md) and [docs/domain/gnubg.md](docs/domain/gnubg.md). Shared loop is `ts-core/sim`; drivers live in `battle-arena`. Each side (`--a`, `--b`) is `game-engine`, `teacher`, or `hedgehog`, including the same driver twice. Hedgehog is the external sidecar in [docs/domain/hedgehog.md](docs/domain/hedgehog.md). Do not vendor that engine or its `.ogxf` weights, and do not label dumps from it. `ply` is GnuBG 0 or 1 (default 1) per side and hedgehog only; other drivers drop it and warn. Hedgehog's sidecar uses those numbers.
2. From `battle-arena/`, use Compose — never run `battle:inner` / `test:inner` on the host. Commands: [README.md](README.md). `docker compose up -d` starts teacher + game-engine. Tests: `docker compose --profile test run --rm test`. Battle: `docker compose --profile arena run --rm arena npm run battle:inner -- --matches 1 --seed 1 --length 7` (`--no-cube` for checker-only). A `game-engine` side requires `training-ground/checkpoints/cubeless.onnx`.
3. Both sides play **max strength**. Checkers: argmax **mover MWC** (teacher also `teacherDiff` then `stepsKey`). Re-rank game-engine `/evaluate` results; do not use money cubeful order. Cube: infallible `evaluateCube` unless `--no-cube` (checker-only; cube stays 1). Skip cube on the opening roll; skip at cube 64. Alternate seats each match.
4. Write `battle-arena/replays/<batch-id>/<matchId>.sgf` (`FF[4]` `GM[6]`, `AP[battle-arena:1]`). Print match-win summary. Do not write training JSONL. Never commit `replays/`. Open SGF in `replay-player` (`docker compose up --build` in `replay-player/`) or gnubg.
5. Have the `backgammon-rules` subagent check sample positions and chosen `steps` (Crawford `mayDouble`, gammon/BG).
