# 0004 Game engine in TypeScript with ONNX inference

- Status: accepted
- Date: 2026-08-20

## Context

`game-engine` should be TypeScript as far as possible, but it must run the PyTorch-trained net. There is no first-party “run a `.pt` file in Node” path that we want to depend on. The portable path is export ONNX from PyTorch and infer with ONNX Runtime’s Node binding (`onnxruntime-node`).

## Decision

- `game-engine` is TypeScript: HTTP API, move generation, JSON ↔ tensor featurizer, cube wrap, response assembly.
- `training-ground` trains in PyTorch and **exports ONNX** (plus optional `.pt` for Python parity tests). It also exports ExecuTorch `.pte` ([ADR 0014](0014-export-onnx-and-pte.md)); the engine still loads ONNX.
- Request-time inference in `game-engine` uses **`onnxruntime-node`**. Do not spawn Python per request.
- HTTP framework (Hono / Fastify / etc.) is still open.

## Consequences

Keep the TS and Python featurizers in lockstep ([docs/domain/features.md](../domain/features.md)). Verify ONNX vs PyTorch on a fixture set before shipping a model. Do not add a Python microservice for inference unless a later ADR says the ONNX graph cannot express the model.
