# Domain overview

Pipeline:

```
foochu/bgweb-api (GNU Backgammon nets over HTTP)
        │  getmoves: legal plays + cubeless / money cubeful eq
        ▼
  move-dumper          TypeScript — simulate matches, dump labelled JSON + SGF
        │
        ├──────────────────────────────┐
        ▼                              ▼
  training-ground                replay-player
  PyTorch — cubeless net,        Vite — debug SGF stepper
  export ONNX                    (not a training input)
        │
        ▼
  game-engine          TypeScript HTTP + onnxruntime-node
                       board + dice → legal moves + cubeful evals
```

The **net** predicts cubeless outcome probabilities. Cubeful equity and cube action are wrapped on top ([ADR 0003](../decisions/0003-doubling-cube.md)). **v1 dumps are match play** ([ADR 0008](../decisions/0008-match-play.md)): the dumper tracks score, Crawford, and dead-cube MWC locally because bgweb-api does not.

Canonical specs:

- Position JSON + XGID: [board-representation.md](board-representation.md)
- Feature tensor: [features.md](features.md)
- Evaluations: [evaluation.md](evaluation.md)
- Dump files: [dump-format.md](dump-format.md)
- Teacher (bgweb-api): [gnubg.md](gnubg.md)
- Simulation: [move-dumper.md](move-dumper.md)
- Match play / MET: [match-play.md](match-play.md)
