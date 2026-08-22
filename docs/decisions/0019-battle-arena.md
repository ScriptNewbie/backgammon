# 0019 Battle-arena package

- Status: accepted
- Date: 2026-08-22
- Supersedes: package-count lines in [0016](0016-ts-core.md) and [0011](0011-docker-only.md); “do not share SGF / bgweb-api” in [0016](0016-ts-core.md)

## Context

[ADR 0016](0016-ts-core.md) locked five top-level packages and kept the match loop, teacher HTTP client, and GNU SGF writer in `move-dumper`. We need a place to play our ONNX game-engine against other engines (starting with the bgweb-api teacher) at full strength, print who won, and keep debug replays. That is not dumping, training, or the HTTP eval API. The dumper’s match loop is the same simulation.

## Decision

- Add TypeScript package `battle-arena`. Docker + Compose from that directory, `file:../ts-core`, same as the other TS packages ([ADR 0011](0011-docker-only.md)).
- **Drivers** live in `battle-arena` (HTTP adapters). v1 drivers: our `game-engine` (`POST /evaluate`) and the teacher (`foochu/bgweb-api` `POST /api/v1/getmoves`).
- v1 plays **engine vs teacher** for `--matches N`. Both sides are **max strength**: argmax mover MWC for checkers (engine results re-ranked; teacher also uses `teacherDiff` then `stepsKey`); infallible cube from `evaluateCube`. No skill levels, temperatures, or pairing. Cube is the shared dead-cube heuristic (teacher has no cube API). Skip cube on the opening roll of a game; skip at cube 64.
- Alternate seats each match. CLI: `--matches`, `--seed`, `--length` (odd 1–15, default 7).
- Write GNU Backgammon SGF (`FF[4]` `GM[6]`) per match under gitignored `battle-arena/replays/`. Open in `replay-player` or gnubg. No training JSONL from the arena. Training-ground must not read that directory.
- Move shared simulation into `ts-core`: Node exports `./sim` (RNG, opening roll, `playMatch` / `MatchPlayer`), `./bgweb` (teacher client + board conversion), `./sgf` (writer only; `p1`/`p2` labels are strings; parameterized `AP`). Replay-player keeps the SGF **parser**. Dump CLI, gzip JSONL, skill sampling, and Vite stay out of `ts-core`. `move-dumper` uses the shared sim and still samples skill levels for dumps.

## Consequences

Allowed top-level packages: `ts-core`, `move-dumper`, `training-ground`, `game-engine`, `replay-player`, `battle-arena`. Do not add a seventh. Spec: [battle-arena.md](../domain/battle-arena.md). Replay-player file picker accepts GM[6] from dumper dumps or arena replays. Never commit `battle-arena/replays/`.
