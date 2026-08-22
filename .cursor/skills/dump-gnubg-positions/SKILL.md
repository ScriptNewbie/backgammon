---
name: dump-gnubg-positions
description: Workflow for simulating backgammon matches in move-dumper and dumping labelled plays from foochu/bgweb-api, including skill-level pairing, MWC sampling, cube heuristic, and GNU SGF replay. Use when implementing or running move-dumper, calling getmoves, or creating training dumps.
---

# Dump positions via bgweb-api

Teacher is [foochu/bgweb-api](https://github.com/foochu/bgweb-api), not the gnubg CLI. Simulation: [docs/domain/move-dumper.md](docs/domain/move-dumper.md). Docker only ([ADR 0011](docs/decisions/0011-docker-only.md)).

## Steps

1. Read [docs/domain/move-dumper.md](docs/domain/move-dumper.md), [docs/domain/match-play.md](docs/domain/match-play.md), [docs/domain/gnubg.md](docs/domain/gnubg.md), [docs/domain/dump-format.md](docs/domain/dump-format.md), [docs/domain/board-representation.md](docs/domain/board-representation.md), and [docs/domain/evaluation.md](docs/domain/evaluation.md).
2. From `move-dumper/`, wrap Compose with npm — never run `dump:inner` / `test:inner` or `gnubg` on the host. Teacher API: `npm run up` (default `http://127.0.0.1:8080` on the host; dumper service uses `http://bgweb-api:8080`). Tests: `npm test`. Dump: `npm run dump -- --matches 1 --seed 1`. If `npm` is missing, use the `docker compose` lines in `move-dumper/package.json`. If the API blips, the dumper retries getmoves (backoff, no gnubg CLI). SIGINT/SIGTERM finish the batch after the current match. Do not call `gnubg` for labels.
3. Per match: sample a level pair (default weights; noob–noob weight 0), assign `p1`/`p2`, sample length uniformly from `{1,3,5,7,9,11,13,15}`.
4. Convert our position JSON ↔ bgweb `board` / `player` / `play` at the dumper boundary (p1=`x`, p2=`o`, flip p2 points). Flip mover evals to result-STM. `xgid` stays null. Do not send match score to getmoves (API has no field).
5. Each checker ply: `POST /api/v1/getmoves` with `score-moves: true`, **no** `max-moves`. Cubeless pass `cubeful: false`; cubeful equity pass `cubeful: true`. Dump **all** legal plays. Rank/sample the chosen play by **mover MWC**, not money equity. `cubeAction` on teacher evals is always null.
6. Cube: dead-cube MWC heuristic with skill noise ([match-play.md](docs/domain/match-play.md)). Skip cube on the opening roll of a game. Max `cube.value` is **64**; at 64 both `mayDouble` are false. Persist `decision: "cube"` records; do not label `eval.cubeAction`.
7. Write `manifest.json` (`engine.name`: `"bgweb-api"`, `play`: `"match"`) + `records.jsonl.gz` + `replay/<matchId>.sgf` (GNU Backgammon `GM[6]`) under `move-dumper/dumps/`. Cubeless training ignores `decision != "checker"` and ignores SGF. Open SGF in `replay-player` (`npm run up` in `replay-player/`) or gnubg.
8. Keep tiny git-tracked examples in `move-dumper/fixtures/`. Never commit `move-dumper/dumps/`.
9. Have the `backgammon-rules` subagent check sample positions and chosen `steps` (Crawford `mayDouble`, gammon/BG).
