# 0018 Cube wrap is a formula

- Status: accepted
- Date: 2026-08-22

## Context

The net predicts cubeless outcome probabilities ([ADR 0003](0003-doubling-cube.md), [ADR 0015](0015-teacher-cubeless-mlp.md)). Cubeful equity and `cubeAction` on the API were still open: formula vs a learned cube head. bgweb-api does not emit cube actions. Dead-cube MWC lives in `ts-core` (`evaluateCube`); battle-arena and the engine wrap use it. The dumper does not simulate cube ([ADR 0020](0020-dumper-games-no-cube.md)).

## Decision

- The main net stays cubeless. No cube head in v1.
- **Money cubeful equity:** `cubefulEquity = cubeless.equity * cube.value` (dead-cube money).
- **`cubeAction`:** `evaluateCube` in `ts-core` mapped to `{ double, take }` for STM of the scored position. `null` when STM cannot double (`mayDouble` false or cube value 64) or when `position.match` is `null` ([ADR 0020](0020-dumper-games-no-cube.md)).
- Checker ranking in `game-engine` uses **negated** `cubefulEquity` of the resulting position, not MWC.
- `source` on model evals is `"model"`. Teacher dumps still leave `cubeAction` null.

## Consequences

A learned cube head needs a later ADR. Jacoby / beavers stay open. Dumper checker sampling stays in `move-dumper` (cubeless equity, [ADR 0020](0020-dumper-games-no-cube.md)). The infallible cube formula lives in `ts-core`. Spec: [evaluation.md](../domain/evaluation.md), [game-engine.md](../domain/game-engine.md).
