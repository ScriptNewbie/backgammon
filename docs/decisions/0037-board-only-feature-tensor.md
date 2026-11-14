# 0037 The feature tensor is the board only (196 floats)

- Status: accepted
- Date: 2026-11-14
- Supersedes: [0029](0029-fixed-cube-features.md)
- Amends: the tensor layout of [0002](0002-board-representations.md) / [features.md](../domain/features.md), the 206-float input in [0015](0015-teacher-cubeless-mlp.md), [0021](0021-featurized-tensor-cache.md) and [0028](0028-game-engine-fast.md)

## Context

[0029](0029-fixed-cube-features.md) froze the 10-float cube block (indices 196–205) at the dead-cube values `[0, 1, 0, …]` because the net is cubeless and dumps only hold a dead cube. That kept the 206-float input of the exported nets, but the block does nothing: index 197 is a constant 1 that duplicates the first layer's bias, and the other nine are always 0. It made the input contract look cube-aware, and every featurizer (TypeScript, Python, CUDA) had to carry it. Folding the constants into the first layer's bias would give an exactly equivalent 196-input net without training, but the net is being retrained anyway (for a new output head), so the block is removed for real and the next net is trained without it.

TD-Gammon, gnubg, and XG nets do not take cube or score inputs either; the cube is handled outside the net.

## Decision

- The feature tensor is **196** floats: points (192) and bar/off (4), as before. No cube block.
- The featurizer ignores `position.cube`, `position.match`, and `position.dice`. A cube-aware or score-aware net would need a new ADR.
- Applies to every featurizer: `ts-core`, `training-ground`, and `game-engine-fast`. The golden vectors in `training-ground/fixtures/features.json` drop their last 10 entries (they were the fixed `[0, 1, 0, …]` in every case).

## Consequences

Every exported net (`cubeless.onnx`, `cubeless-fast.onnx`, `cubeless.pte`) now has input `features` `[N, 196]`. Nets and checkpoints from before this ADR (206 inputs) no longer load in `game-engine`, `game-engine-fast`, or `--resume`; train a new net. The project outside this repo that consumes `cubeless.onnx` must move to the 196-float input. The `features.py` digest changes, so the next training run rebuilds the tensor cache ([0021](0021-featurized-tensor-cache.md)). Spec: [features.md](../domain/features.md).
