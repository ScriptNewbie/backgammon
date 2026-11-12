# 0023 Any driver versus any driver

- Status: accepted
- Date: 2026-10-25
- Supersedes: the fixed engine-vs-opponent pairing in [0019](0019-battle-arena.md) and the `--opponent` flag in [0022](0022-hedgehog-external.md)

## Context

Battle-arena played our game-engine against one opponent (`teacher` or `hedgehog`). Comparing other pairs — hedgehog against the teacher, or two Hedgehog settings — uses the same loop with a driver on each side. Hedgehog is the only driver with a search-depth parameter (`ply`).

## Decision

- Each match is two drivers, side `a` and side `b`. Each side is `game-engine`, `teacher`, or `hedgehog`. The same driver may sit on both sides.
- Default remains `game-engine` vs `teacher`. Seats still alternate: even matches a=`p1` / b=`p2`, odd matches swapped.
- CLI: `--a`, `--b`, `--a-url`, `--b-url`, `--a-ply`, `--b-ply`. Each side's URL defaults from `ENGINE_BASE_URL`, `BGWEB_BASE_URL`, or `HEDGEHOG_BASE_URL` by that side's driver.
- A parameter is applied only when that driver supports it. `ply` (GnuBG 0 or 1, default 1) is supported by hedgehog only. Any other side discards `ply` and prints a warning. Health-check only the sides that play.
- Checker rank stays mover MWC. Cube stays the shared infallible heuristic (`--no-cube` disables it). Hedgehog stays an external sidecar and is not a dump source ([0022](0022-hedgehog-external.md)).

## Consequences

[0025](0025-xg-gui-sidecar.md) adds the `xg` driver and lets that side play eXtreme Gammon's own cube. [0030](0030-hedgehog-plays-itself.md) does the same for `hedgehog` (its own checker ranking and cube). Every other driver keeps MWC ranking and the shared heuristic.

`--opponent`, `--ply`, `--engine-url`, `--teacher-url`, and `--hedgehog-url` are removed. `cubeless.onnx` is required only when a side is `game-engine`. Spec: [battle-arena.md](../domain/battle-arena.md).

[0031](0031-gnubg-cli-sidecar.md) renames `teacher` to `gnubg` (alias kept), gives it `ply` 0-4, and lets that side play GNU Backgammon's own checker ranking and cube.

[0032](0032-engines-own-decisions.md) does the same for `game-engine` and `game-engine-fast`: they play their engine's `moves[0]` and its own `/cube`. The shared heuristic and the arena re-rank are gone.
