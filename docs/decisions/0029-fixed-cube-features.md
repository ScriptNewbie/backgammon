# 0029 Cube features are fixed constants

- Status: accepted
- Date: 2026-11-06
- Amends: [0002](0002-board-representations.md) (feature tensor cube block)

## Context

The feature tensor's cube block (indices 196–205) encoded the real cube state. It predates [0003](0003-doubling-cube.md), [0018](0018-cube-wrap-formula.md) and [0020](0020-dumper-games-no-cube.md). The net is cubeless, and cubeless probabilities do not depend on the cube by definition. Dumps always hold a dead cube, so in every training sample the cube block is `[0, 1, 0, 0, 0, 0, 0, 0, 0, 0]`. Weights on 196 and 198–201 never get a gradient (Adam, no weight decay) and stay at their random initial values. `game-engine` featurizes the real cube, so in arena cube matches (and whenever `mayDouble` is true) the net gets inputs it never saw in training. Removing the block would change the 206-float input of `cubeless.onnx`, which a project outside this repo consumes, and would force retraining.

## Decision

- The tensor stays length **206**. The featurizer ignores `position.cube` and always writes the training values: index 197 = `1`, indices 196, 198–205 = `0`.
- Applies to every featurizer: `ts-core`, `training-ground`, and `game-engine-fast` ([0028](0028-game-engine-fast.md)).
- The real cube state is still used outside the net: `cubefulEquity`, `cubeAction`, and the arena cube heuristic.

## Consequences

Spec: [features.md](../domain/features.md). Follow-up implementation: change `featurize` in `ts-core/src/features.ts` and `training-ground/src/training_ground/features.py`, and update the golden vectors in `training-ground/fixtures/features.json` for the cases with a non-default cube. The `features.py` digest changes, so the next training run rebuilds the tensor cache ([0021](0021-featurized-tensor-cache.md)); the cached tensors themselves do not change. The current checkpoint stays valid. A cube-aware net would need a new ADR that reopens this block.
