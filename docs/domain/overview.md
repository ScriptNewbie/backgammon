# Domain overview

Pipeline:

```
foochu/bgweb-api (GNU Backgammon nets over HTTP)
        │  getmoves: legal plays + cubeless / money cubeful eq
        ▼
  move-dumper          TypeScript — simulate games (no cube), dump labelled JSON + SGF
        │
        ├──────────────────────────────┐
        ▼                              ▼
  training-ground                replay-player
  PyTorch — cubeless net,        Vite — debug SGF stepper
  export ONNX                    (dumper dumps or arena replays)
        │
        ▼
  game-engine          TypeScript HTTP (Hono) + onnxruntime-node
                       board + dice → legal moves + cubeful evals
                       shared board/featurizer: ts-core
        │
        ▼
  battle-arena         TypeScript — engine vs teacher (max strength),
                       win summary + GNU SGF replays
                       shared match loop: ts-core/sim
```

The **net** predicts cubeless outcome probabilities. Cubeful equity and cube action are wrapped on top ([ADR 0003](../decisions/0003-doubling-cube.md)). **Dumper dumps are money games without a cube** ([ADR 0020](../decisions/0020-dumper-games-no-cube.md)). Battle-arena still plays matches ([ADR 0019](../decisions/0019-battle-arena.md)).

Run everything with Docker Compose from the package directory ([ADR 0011](../decisions/0011-docker-only.md)). Commands: [README.md](../../README.md).

Canonical specs:

- Position JSON + XGID: [board-representation.md](board-representation.md)
- Feature tensor: [features.md](features.md)
- Evaluations: [evaluation.md](evaluation.md)
- Dump files: [dump-format.md](dump-format.md)
- Teacher (bgweb-api): [gnubg.md](gnubg.md)
- Simulation: [move-dumper.md](move-dumper.md)
- Match play / MET: [match-play.md](match-play.md)
- Game-engine HTTP: [game-engine.md](game-engine.md)
- Engine vs teacher: [battle-arena.md](battle-arena.md)
