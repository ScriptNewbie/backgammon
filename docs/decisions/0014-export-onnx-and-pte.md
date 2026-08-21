# 0014 Training-ground exports ONNX and ExecuTorch `.pte`

- Status: accepted
- Date: 2026-08-21

## Context

[ADR 0004](0004-game-engine-typescript-onnx.md) has `game-engine` infer with `onnxruntime-node`, so `training-ground` must emit ONNX. We also need an ExecuTorch `.pte` for on-device / edge runtimes. Replacing ONNX would break the TypeScript engine. Emitting only `.pte` would leave the engine without a graph.

## Decision

- `training-ground` exports **both** ONNX (for [ADR 0004](0004-game-engine-typescript-onnx.md)) and ExecuTorch **`.pte`**.
- Optional `.pt` remains for Python parity checks.
- `game-engine` request-time inference stays `onnxruntime-node`. Do not load `.pte` there unless a later ADR says so.
- Do not commit `*.onnx`, `*.pte`, or `*.pt`.
- Do not add `onnx` / `executorch` as PyPI `torch`-pulling dependencies in `pyproject.toml`. Install them in the CUDA image after the cu130 torch pin ([ADR 0013](0013-training-cuda.md)). Pin **`executorch==1.4.1`** with `--no-deps` so a full `pip install executorch` cannot replace the CUDA 2.13 wheel with a PyPI torch.

## Consequences

Export helpers must write both artifacts from the same `nn.Module`. Gitignore `*.pte`. Skills and package rules name both formats. Domain encodings are unchanged.
