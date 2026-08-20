# Domain overview

Pipeline (not implemented yet):

```
foochu/bgweb-api (GNU Backgammon nets over HTTP)
        │
        ▼
  move-dumper          TypeScript — labelled JSON + evals
        │
        ▼
  training-ground      PyTorch — cubeless net, export ONNX
        │
        ▼
  game-engine          TypeScript HTTP + onnxruntime-node
                       board + dice → legal moves + cubeful evals
```

v1 is **money play with a doubling cube**. The net predicts cubeless outcome probabilities; cubeful equity and cube action are wrapped on top ([ADR 0003](../decisions/0003-doubling-cube.md)).

Canonical specs:

- Position JSON + XGID: [board-representation.md](board-representation.md)
- Feature tensor: [features.md](features.md)
- Evaluations: [evaluation.md](evaluation.md)
- Dump files: [dump-format.md](dump-format.md)
- Teacher (bgweb-api): [gnubg.md](gnubg.md)
