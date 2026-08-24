---
name: dump-gnubg-positions
description: Workflow for simulating backgammon games in move-dumper and dumping labelled checker plays from foochu/bgweb-api, including skill-level pairing, cubeless-equity sampling, and GNU SGF replay. Use when implementing or running move-dumper, calling getmoves, or creating training dumps.
---

# Dump positions via bgweb-api

Teacher is [foochu/bgweb-api](https://github.com/foochu/bgweb-api), not the gnubg CLI. Simulation: [docs/domain/move-dumper.md](docs/domain/move-dumper.md). Game loop: `ts-core/sim` `playGame`. Teacher client: `ts-core/bgweb`. Docker only ([ADR 0011](docs/decisions/0011-docker-only.md)). Dumps are money **games with no cube** ([ADR 0020](docs/decisions/0020-dumper-games-no-cube.md)).

## Steps

1. Read [docs/domain/move-dumper.md](docs/domain/move-dumper.md), [docs/domain/gnubg.md](docs/domain/gnubg.md), [docs/domain/dump-format.md](docs/domain/dump-format.md), [docs/domain/board-representation.md](docs/domain/board-representation.md), and [docs/domain/evaluation.md](docs/domain/evaluation.md). Match math in [match-play.md](docs/domain/match-play.md) is for arena/engine, not dumper policy.
2. From `move-dumper/`, use Compose — never run `dump:inner` / `test:inner` or `gnubg` on the host. Commands: [README.md](README.md). Teacher API: `docker compose up -d` (default `http://127.0.0.1:8080` on the host; dumper service uses `http://bgweb-api:8080`). Tests: `docker compose --profile test run --rm test`. Dump: `docker compose --profile dumper run --rm dumper npm run dump:inner -- --games 1 --seed 1`. If the API blips, the dumper retries getmoves (backoff, no gnubg CLI). SIGINT/SIGTERM finish after the current game. Do not call `gnubg` for labels.
3. Per game: sample a level pair (default weights; noob–noob weight 0), assign `p1`/`p2`. Play one game to bear-off via `playGame({ allowCube: false })`. No match length, no Crawford cycle, no cube offer/take/drop.
4. Convert our position JSON ↔ bgweb `board` / `player` / `play` via `ts-core/bgweb` (p1=`x`, p2=`o`, flip p2 points). Flip mover evals to result-STM. `xgid` stays null. Do not send match score to getmoves (API has no field).
5. Each checker ply: `POST /api/v1/getmoves` with `score-moves: true`, **no** `max-moves`. Cubeless pass `cubeful: false`; cubeful equity pass `cubeful: true`. Dump **all** legal plays. Rank/sample the chosen play by **negated result cubeless equity** (`-eval.cubeless.equity`), stored as `RankedPlay.rankScore` (higher is better). Do not put MWC in that field. Do not import `ts-core/match`. `cubeAction` on teacher evals is always null. Loop: `move-dumper/src/games.ts`.
6. Do not simulate cube. Position JSON still has a dead cube (`value` 1, centered, `mayDouble` both false) and `match: null` ([ADR 0020](docs/decisions/0020-dumper-games-no-cube.md)). Write only `decision: "checker"` records with `gameId`. Do not write `matchId`.
7. Write `manifest.json` (`engine.name`: `"bgweb-api"`, `play`: `"game"`) + `records.jsonl.gz` + `replay/<gameId>.sgf` (GNU Backgammon `GM[6]`, no cube events) under `move-dumper/dumps/`. Training ignores SGF. Open SGF in `replay-player` (`docker compose up --build` in `replay-player/`) or gnubg.
8. Keep tiny git-tracked examples in `move-dumper/fixtures/`. Never commit `move-dumper/dumps/`.
9. Have the `backgammon-rules` subagent check sample positions and chosen `steps` (bar, hits, bear-off, gammon/BG).
