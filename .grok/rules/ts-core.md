# ts-core

Shared TypeScript library ([ADR 0016](../../docs/decisions/0016-ts-core.md), [ADR 0019](../../docs/decisions/0019-battle-arena.md)). Isomorphic export: types, board, legal moves, featurizer, GNU checker-move encode/decode. Node exports: `ts-core/match` (MET, MWC, cube), `ts-core/sim` (match loop, RNG), `ts-core/bgweb` (teacher client), `ts-core/sgf` (GNU SGF writer).

- Specs: `docs/domain/board-representation.md`, `docs/domain/features.md`, `docs/domain/match-play.md`.
- Golden feature vectors: `training-ground/fixtures/features.json`.
- Do not add dump CLI, skill sampling, Vite UI, or the SGF **file** parser here. Replay-player must not import Node exports.
- Docker only, from `ts-core/`. Host commands: [README.md](../../README.md). Do not run `test:inner` on the host.
