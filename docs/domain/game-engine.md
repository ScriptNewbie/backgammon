# Game-engine HTTP API

Locked by [ADR 0004](../decisions/0004-game-engine-typescript-onnx.md), [ADR 0017](../decisions/0017-hono.md), and [ADR 0018](../decisions/0018-cube-wrap-formula.md). Bodies: [board-representation.md](board-representation.md), [evaluation.md](evaluation.md). Tensor: [features.md](features.md).

Hono on Compose port **3000**. From `game-engine/`: `docker compose up` (http://localhost:3000). Host commands: [README.md](../../README.md). Model: `MODEL_PATH` (default `/models/cubeless.onnx`); Compose mounts `training-ground/checkpoints` read-only. Do not commit weights.

## `GET /health`

`200` `{ "ok": true }`.

## `POST /evaluate`

Request body is a position JSON. `dice` must be two integers `1`–`6`. `points` length 24; 15 checkers per player.

```json
{
  "moves": [
    {
      "steps": [{ "from": 8, "to": 5 }, { "from": 6, "to": 5 }],
      "eval": {
        "cubeless": {
          "equity": 0.0,
          "win": 0.5,
          "gammon": 0.0,
          "backgammon": 0.0,
          "loseGammon": 0.0,
          "loseBackgammon": 0.0
        },
        "cubefulEquity": 0.0,
        "cubeAction": { "double": false, "take": true },
        "source": "model"
      }
    }
  ]
}
```

- `moves` are legal checker plays only, sorted best-first for the **mover** (negated `cubefulEquity` of the result). Empty if the player dances.
- Each `eval` is for the **resulting** position (opponent is STM). Terminal 15-off positions skip the net and use exact outcome probabilities.
- `cubefulEquity = cubeless.equity * cube.value`. `cubeAction` from the match MWC formula; `null` when STM cannot double or `match` is `null`.
- `400` on invalid JSON / position / dice. Do not spawn Python per request.
