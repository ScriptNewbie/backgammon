# Game-engine HTTP API

Locked by [ADR 0004](../decisions/0004-game-engine-typescript-onnx.md), [ADR 0017](../decisions/0017-hono.md), [ADR 0018](../decisions/0018-cube-wrap-formula.md), and [ADR 0032](../decisions/0032-engines-own-decisions.md). The engine makes its own decisions: callers play `moves[0]` and ask `/cube`; they do not re-rank or compute the cube. Bodies: [board-representation.md](board-representation.md), [evaluation.md](evaluation.md). Tensor: [features.md](features.md).

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
        "cubeAction": null,
        "source": "model"
      }
    }
  ]
}
```

- `moves` are legal checker plays only, sorted best-first for the **mover** at the position's match state: by mover dead-cube MWC of the result ([match-play.md](match-play.md)) when `match` is set, by negated `cubefulEquity` of the result for money (`match` null). Exact ties break by `stepsKey`. `moves[0]` is the engine's play. Empty if the player dances.
- Each `eval` is for the **resulting** position (opponent is STM). Terminal 15-off positions skip the net and use exact outcome probabilities.
- `cubefulEquity = cubeless.equity * cube.value`. `cubeAction` is always `null`; cube decisions come from `POST /cube`.
- `400` on invalid JSON / position / dice. Do not spawn Python per request.

## `POST /cube`

The engine's cube decision. Body: a position JSON with the **doubler on roll** and `dice: null` (before the roll). The net evaluates that position for the doubler; the dead-cube formula of [match-play.md](match-play.md) ([ADR 0018](../decisions/0018-cube-wrap-formula.md)) turns the probs into the doubler's offer and the taker's answer.

```json
{
  "available": true,
  "offer": "double",
  "take": "take",
  "noDouble": 0.53,
  "doubleTake": 0.57,
  "doubleDrop": 0.56,
  "cubeless": { "equity": 0.31, "win": 0.68, "gammon": 0.22, "backgammon": 0.02, "loseGammon": 0.08, "loseBackgammon": 0.005 }
}
```

- MWCs are for the doubler: no double at the current cube, double and take (dead cube at twice the value), double and drop.
- `available` is `false` when `match` is null (money: no engine cube yet), the player on roll may not double (Crawford game, the opponent owns the cube), or the cube is at 64. Then `offer` is `"no-double"` and `take` and the MWCs are `null`.
- `400` on invalid JSON / position, or when `dice` is not `null`.

Clients: `battle-arena` (`game-engine` driver) and the `gui` Play screen (through the Vite proxy `/api/engine`, [gui.md](gui.md)). Both play `moves[0]` and take the engine's offer and take from `/cube`.
