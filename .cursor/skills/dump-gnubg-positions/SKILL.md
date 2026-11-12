---
name: dump-gnubg-positions
description: Workflow for simulating backgammon games in move-dumper and dumping checker plays labelled by the GNU Backgammon CLI sidecar, including ply and label filter, skill-level pairing, cubeless-equity sampling, and GNU SGF replay. Use when implementing or running move-dumper, querying the gnubg sidecar, or creating training dumps.
---

# Dump positions labelled by GNU Backgammon

The teacher is GNU Backgammon 1.07 run as a command-line sidecar ([ADR 0031](docs/decisions/0031-gnubg-cli-sidecar.md), [docs/domain/gnubg.md](docs/domain/gnubg.md)). Simulation: [docs/domain/move-dumper.md](docs/domain/move-dumper.md). Game loop: `ts-core/sim` `playGame`. Teacher client: `ts-core/gnubg`. Docker only ([ADR 0011](docs/decisions/0011-docker-only.md)). Dumps are money **games with no cube** ([ADR 0020](docs/decisions/0020-dumper-games-no-cube.md)).

## Steps

1. Read [docs/domain/move-dumper.md](docs/domain/move-dumper.md), [docs/domain/gnubg.md](docs/domain/gnubg.md), [docs/domain/dump-format.md](docs/domain/dump-format.md), [docs/domain/board-representation.md](docs/domain/board-representation.md), and [docs/domain/evaluation.md](docs/domain/evaluation.md). Match math in [match-play.md](docs/domain/match-play.md) is for arena/engine, not dumper policy.
2. From `move-dumper/`, use Compose — never run `dump:inner` / `test:inner` or `gnubg` on the host. Commands: [README.md](README.md). Sidecar: `docker compose up -d` builds and starts the `gnubg` service (`http://127.0.0.1:8080` on the host, `http://gnubg:8080` for the dumper). Tests: `docker compose --profile test run --rm test`. Dump: `docker compose --profile dumper run --rm dumper npm run dump:inner -- --games 1 --seed 1`. If the sidecar blips, the client retries with backoff. SIGINT/SIGTERM finish after the current game. Do not label dumps from Hedgehog or XG.
3. **GPL boundary.** gnubg is GPL. It lives only inside the sidecar image (Debian package, installed at build time). Talk to it only through `docs/integrations/gnubg/server.mjs` and `ts-core/gnubg`. Never link it, vendor its code, nets, or tables, script it from inside (`gnubg -p`), or publish the image.
4. Per game: sample a level pair (default weights; noob–noob weight 0), assign `p1`/`p2`. Play one game to bear-off via `playGame({ allowCube: false })`. No match length, no Crawford cycle, no cube offer/take/drop.
5. Each checker ply: `GnubgClient.getMoves` sends the position as an XGID (money game, live centered cube, whatever the position's cube says) and parses gnubg's `hint` for **every** legal play. Labels are at `--ply` (default 2) under `--label-filter` (default `gnubg`: gnubg's own move filter, as bgweb-api labelled; `all`: every play at `--ply`). Each gnubg line must match one of our legal plays, and gnubg must list them all. A dance skips the sidecar. Flip mover evals to result-STM. `xgid` stays null.
6. Rank/sample the chosen play by **negated result cubeless equity** (`-eval.cubeless.equity`), stored as `RankedPlay.rankScore` (higher is better). Do not put MWC in that field. Do not import `ts-core/match`. `cubeAction` on teacher evals is always null. Loop: `move-dumper/src/games.ts`.
7. Do not simulate cube. Position JSON still has a dead cube (`value` 1, centered, `mayDouble` both false) and `match: null` ([ADR 0020](docs/decisions/0020-dumper-games-no-cube.md)). Write only `decision: "checker"` records with `gameId`. Do not write `matchId`.
8. Write `manifest.json` (`engine.name`: `"gnubg"`, `version`: gnubg's banner, `settings.ply`, `settings.labelFilter`, `play`: `"game"`) + `records.jsonl.gz` + `replay/<gameId>.sgf` (GNU Backgammon `GM[6]`, no cube events) under `move-dumper/dumps/`. Older batches say `"bgweb-api"`. Training ignores SGF. Open SGF in `gui` (`docker compose up --build` in `gui/`) or gnubg.
9. Keep tiny git-tracked examples in `move-dumper/fixtures/`. Never commit `move-dumper/dumps/`.
10. Have the `backgammon-rules` subagent check sample positions and chosen `steps` (bar, hits, bear-off, gammon/BG).
