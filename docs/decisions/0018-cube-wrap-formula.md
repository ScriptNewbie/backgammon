# 0018 Cube wrap is a formula

- Status: accepted
- Date: 2026-08-22

## Context

The net predicts cubeless outcome probabilities ([ADR 0003](0003-doubling-cube.md), [ADR 0015](0015-teacher-cubeless-mlp.md)). Cubeful equity and `cubeAction` on the API were still open: formula vs a learned cube head. bgweb-api does not emit cube actions. `move-dumper` already has a dead-cube MWC cube heuristic for match simulation ([match-play.md](../domain/match-play.md)).

## Decision

- The main net stays cubeless. No cube head in v1.
- **Money cubeful equity:** `cubefulEquity = cubeless.equity * cube.value` (dead-cube money).
- **`cubeAction`:** the existing dumper MWC heuristic (`evaluateCube`) mapped to `{ double, take }` for STM of the scored position. `null` when STM cannot double (`mayDouble` false or cube value 64).
- Checker ranking in `game-engine` uses **negated** `cubefulEquity` of the resulting position, not MWC.
- `source` on model evals is `"model"`. Teacher dumps still leave `cubeAction` null.

## Consequences

A learned cube head needs a later ADR. Jacoby / beavers stay open. Dumper skill noise (logistic / noob sampling) stays in `move-dumper`; the infallible formula lives in `ts-core/match`. Spec: [evaluation.md](../domain/evaluation.md), [game-engine.md](../domain/game-engine.md).
