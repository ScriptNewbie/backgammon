# 0006 Teacher engine is foochu/bgweb-api

- Status: accepted
- Date: 2026-08-20

## Context

`move-dumper` needed labelled moves from GNU Backgammon. Talking to the gnubg CLI / XGID export is heavier than we want. [foochu/bgweb-api](https://github.com/foochu/bgweb-api) exposes the same engine over HTTP (`POST /api/v1/getmoves`). Cube *decisions* are a documented to-do on that API; cubeful *equity* is available via `cubeful: true`.

## Decision

- The teacher for dumps is **bgweb-api**, not the gnubg CLI.
- Run it with Docker Compose from `move-dumper/` (`docker compose up -d`): image `foochu/bgweb-api:latest` on port 8080 (default `http://127.0.0.1:8080`).
- Convert at the dumper boundary: our position JSON ↔ bgweb `board` / `player` / `play` (see [docs/domain/gnubg.md](../domain/gnubg.md)). Do not store bgweb’s `x`/`o` layout as a fourth representation.
- Omit `max-moves` so the API returns **all** legal plays. `score-moves: true`.
- Cubeless labels: `cubeful: false`. Cubeful equity: a second call with `cubeful: true`. `cubeAction` stays `null` until that API can emit cube decisions.
- Manifest `engine.name` is `"bgweb-api"`. `source` on eval objects is `"bgweb-api"`.

## Consequences

Do not shell out to `gnubg`. Do not require XGID for dumps (`xgid` remains optional/null). Do not invent cube-action labels from this teacher.
