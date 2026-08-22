---
name: run-battle-arena
description: Workflow for playing our game-engine against the bgweb-api teacher in battle-arena, including Compose, CLI flags, MWC ranking, cube policy, and GNU SGF replays. Use when implementing or running battle-arena, engine vs teacher matches, or arena summaries.
---

# Run engine vs teacher

TypeScript. Docker only ([ADR 0011](docs/decisions/0011-docker-only.md), [ADR 0019](docs/decisions/0019-battle-arena.md)). Simulation: [docs/domain/battle-arena.md](docs/domain/battle-arena.md). Match math: [docs/domain/match-play.md](docs/domain/match-play.md).

## Steps

1. Read those domain docs plus [docs/domain/game-engine.md](docs/domain/game-engine.md) and [docs/domain/gnubg.md](docs/domain/gnubg.md). Shared loop is `ts-core/sim`; drivers live in `battle-arena`.
2. From `battle-arena/`, wrap Compose with npm — never run `battle:inner` / `test:inner` on the host. `npm run up` starts teacher + game-engine. Tests: `npm test`. Battle: `npm run battle -- --matches 1 --seed 1 --length 7`. If `npm` is missing, use the `docker compose` lines in `battle-arena/package.json`. Requires `training-ground/checkpoints/cubeless.onnx`.
3. Both sides play **max strength**. Checkers: argmax **mover MWC** (teacher also `teacherDiff` then `stepsKey`). Re-rank game-engine `/evaluate` results; do not use money cubeful order. Cube: infallible `evaluateCube`. Skip cube on the opening roll; skip at cube 64. Alternate seats each match.
4. Write `battle-arena/replays/<batch-id>/<matchId>.sgf` (`FF[4]` `GM[6]`, `AP[battle-arena:1]`). Print match-win summary. Do not write training JSONL. Never commit `replays/`. Open SGF in `replay-player` (`npm run up` in `replay-player/`) or gnubg.
5. Have the `backgammon-rules` subagent check sample positions and chosen `steps` (Crawford `mayDouble`, gammon/BG).
