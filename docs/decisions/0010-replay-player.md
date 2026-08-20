# 0010 Debug replay player package

- Status: accepted
- Date: 2026-08-20

## Context

`move-dumper` writes GNU Backgammon SGF for debug replay ([ADR 0009](0009-dump-metadata-and-sgf.md)). Opening those files in gnubg works, but we want a small in-repo viewer. The monorepo was three packages (`move-dumper`, `training-ground`, `game-engine`). A fourth package is needed so the viewer can be a Vite web app without mixing UI into the dumper.

## Decision

- Add top-level package `replay-player`: Vite + vanilla TypeScript in the browser.
- Input is GNU Backgammon SGF only (`FF[4]`, `GM[6]`), the files under `move-dumper/dumps/<batch>/replay/`. Not JSONL, not XGID, not a fourth board encoding ([ADR 0002](0002-board-representations.md)).
- Reconstruct position JSON by applying SGF events (checker steps and cube double / take / drop) from the standard opening. Same geometry as [board-representation.md](../domain/board-representation.md).
- Step with Previous / Next buttons. No backend, no React.
- Do not import `move-dumper` from the browser. A thin local apply-steps copy is allowed. Training still ignores SGF.

## Consequences

The allowed top-level packages are `move-dumper`, `training-ground`, `game-engine`, and `replay-player`. Do not add a fifth. Do not parse SGF in `training-ground`. Spec: [dump-format.md](../domain/dump-format.md).
