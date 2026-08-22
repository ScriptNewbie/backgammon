# 0016 Shared `ts-core` TypeScript package

- Status: accepted
- Date: 2026-08-22
- Supersedes: package-count lines in [0010](0010-replay-player.md) and [0011](0011-docker-only.md)

## Context

`move-dumper` and `replay-player` duplicated position/cube/step types and `applySteps` / opening / cube-take. `game-engine` needs the same board code plus legal-move generation and a TypeScript featurizer. A thin apply-steps copy in the replay player was allowed by [ADR 0010](0010-replay-player.md), which also forbade a fifth package. That duplication is now the wrong trade.

## Decision

- Add top-level package `ts-core`: shared TypeScript (source, no emit). Docker test + `install:host` like the other TS packages.
- Consumers depend on `"ts-core": "file:../ts-core"`. Compose mounts the repo root so `file:` resolves.
- **Isomorphic** export (`.`, safe in the browser): board types, apply/opening/`gameResult`, legal moves, featurizer.
- **Node** export (`./match`): MET, dead-cube MWC, cube-action formula (`node:fs`). Replay-player must not import this.
- Do not share SGF (writer vs parser), bgweb-api, dump CLI, skill sampling, or Vite UI.
- Replay-player imports `ts-core`, not `move-dumper`. Training still ignores SGF.

## Consequences

Allowed top-level packages: `ts-core`, `move-dumper`, `training-ground`, `game-engine`, `replay-player`. Do not add a sixth. Spec: [board-representation.md](../domain/board-representation.md), [features.md](../domain/features.md). Run tests from `ts-core/` with `npm test` ([ADR 0011](0011-docker-only.md)).
