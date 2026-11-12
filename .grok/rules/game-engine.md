# game-engine

TypeScript HTTP API (Hono, [ADR 0017](../../docs/decisions/0017-hono.md)). Cube wrap is a formula ([ADR 0018](../../docs/decisions/0018-cube-wrap-formula.md)). ONNX inference (`onnxruntime-node`) lives here. Board, legal moves, and featurizer come from `ts-core`. Do not spawn Python per request.

- Bodies: `docs/domain/game-engine.md`, `docs/domain/board-representation.md`, `docs/domain/evaluation.md`.
- Tensor: `docs/domain/features.md` (must match Python; implemented in `ts-core`).
- Legal moves only. The engine decides (ADR 0032): `/evaluate` orders plays best first for the mover at the match state (mover MWC via `ts-core/match` `sortForMover` in a match, negated cubeful equity for money), and `POST /cube` (doubler on roll, no dice) returns its own offer and take via `cubeDecision`. `eval.cubeAction` stays null.
- Docker only, from `game-engine/`. Host commands: [README.md](../../README.md) (http://localhost:3000). Port 3000 is the Compose publish port, not an HTTP-framework decision. Do not run host `tsx`.
