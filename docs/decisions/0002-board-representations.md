# 0002 Board representations for ML and interchange

- Status: accepted
- Date: 2026-08-20

## Context

PyTorch training wants a dense, fixed-size, side-to-move feature vector. GNU Backgammon talks XGID. The HTTP API and dumps need an explicit, lossless position. One encoding cannot serve all three well. Too many encodings will fork the stack.

## Decision

Exactly **three** representations, no others without a new ADR:

| Name | Role | Canonical? |
| --- | --- | --- |
| **Position JSON** | Wire, dumps, API, move gen | Yes — source of truth |
| **Feature tensor** | PyTorch train + ONNX infer | Derived from JSON |
| **XGID** | gnubg / human interchange only | Derived; parse to JSON at the boundary |

JSON shape and tensor layout live in [docs/domain/board-representation.md](../domain/board-representation.md) and [docs/domain/features.md](../domain/features.md).

The JSON uses absolute p1/p2 geometry (ADR 0001). The tensor is always **side-to-move** (on-roll player’s checkers first). Implement the featurizer in Python (training) and TypeScript (engine) against the same spec and the same golden fixtures. The tensor does not have to round-trip to JSON.

## Consequences

Do not pass XGID into the trainer or the net. Do not invent a training-only JSON. Do not add a second tensor layout (e.g. a CNN grid) unless an ADR replaces or extends `features.md`.
