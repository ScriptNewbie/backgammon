---
name: dump-gnubg-positions
description: Workflow for dumping labelled backgammon positions and moves from foochu/bgweb-api (GNU Backgammon nets over HTTP). Use when implementing or running move-dumper, calling getmoves, or creating training dumps.
---

# Dump positions via bgweb-api

`move-dumper` is not scaffolded. Teacher is [foochu/bgweb-api](https://github.com/foochu/bgweb-api), not the gnubg CLI.

## Steps

1. Read [docs/domain/gnubg.md](docs/domain/gnubg.md), [docs/domain/dump-format.md](docs/domain/dump-format.md), [docs/domain/board-representation.md](docs/domain/board-representation.md), and [docs/domain/evaluation.md](docs/domain/evaluation.md).
2. Ensure the API is up (`docker run -p 8080:8080 -d foochu/bgweb-api:latest` if needed). Default `http://127.0.0.1:8080`. If it is down, stop and tell the user. Do not call `gnubg`.
3. Convert our position JSON ↔ bgweb `board` / `player` / `play` at the dumper boundary (p1=`x`, p2=`o`, flip p2 points). Flip mover evals to result-STM. `xgid` stays null.
4. `POST /api/v1/getmoves` with `score-moves: true`, **no** `max-moves`. Cubeless pass `cubeful: false`; cubeful equity pass `cubeful: true`. `cubeAction` is always null.
5. Write `manifest.json` (`engine.name`: `"bgweb-api"`) + `records.jsonl.gz` under `move-dumper/dumps/`. Record `eval` is usually null; labels are on `moves[]`.
6. Keep a tiny git-tracked example in `move-dumper/fixtures/`. Never commit `move-dumper/dumps/`.
