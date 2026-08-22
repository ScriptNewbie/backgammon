# 0015 Teacher cubeless MLP

- Status: accepted
- Date: 2026-08-22

## Context

`training-ground` already has a 206-float STM featurizer and ONNX / ExecuTorch export ([ADR 0002](0002-board-representations.md), [ADR 0014](0014-export-onnx-and-pte.md)). Dumps from bgweb-api label every legal checker play with cubeless outcome probabilities for the **resulting** side to move ([dump-format.md](../domain/dump-format.md), [evaluation.md](../domain/evaluation.md)). The remaining choice was the teacher architecture, output vector order, and loss — needed before a training loop, and before a later smaller student for phones.

A cubeful head, self-play / TD-Gammon, and distillation are separate problems. The cube wrapper stays open in [0000](0000-open-questions.md).

## Decision

- Train a **teacher** `CubelessNet`: feedforward MLP, `Linear` + `ReLU` hidden layers, **sigmoid** on the five cubeless probabilities. No BatchNorm or Dropout (keeps ONNX / `.pte` export simple).
- Default size **206 → 512 → 512 → 512 → 5**. Width and depth are CLI overrides; they are not a second encoding.
- ONNX output name `cubeless`. Vector order is `win`, `gammon`, `backgammon`, `loseGammon`, `loseBackgammon` (length 5, STM of the featurized position). Do not emit `equity` as a sixth head; derive it from the five probs when logging metrics.
- Loss is **MSE** on those five teacher probabilities. Do not train the teacher on `cubefulEquity`, `cubeAction`, `xgid`, SGF, bgweb `x`/`o` boards, or `decision == "cube"` rows.
- A distilled student for mobile is a later ADR, not this net.

## Consequences

`game-engine` can bind ONNX `cubeless` to the shared eval object in that field order. Changing hidden size does not change the feature tensor or dump schema. Distillation must consume this teacher (or a later ADR that replaces it). Spec: [features.md](../domain/features.md).
