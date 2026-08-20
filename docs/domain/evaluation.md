# Evaluation semantics

Dump labels, training targets, and `game-engine` outputs share this schema. Cube support: [ADR 0003](../decisions/0003-doubling-cube.md).

## Two layers

1. **Net (trained):** cubeless outcome probabilities for the side to move, plus derived cubeless equity.
2. **Cube wrap (API):** cubeful equity and cube action from those probabilities + cube state on the position JSON.

Do not train the main net on cubeful equity alone.

## Cubeless probabilities (STM)

All in `[0, 1]`. gnubg-style split (win includes gammons and backgammons):

| Field | Meaning |
| --- | --- |
| `win` | P(STM wins the game), including gammons and backgammons |
| `gammon` | P(STM wins a gammon), including backgammons |
| `backgammon` | P(STM wins a backgammon) |
| `loseGammon` | P(STM loses a gammon), including backgammons |
| `loseBackgammon` | P(STM loses a backgammon) |

`lose = 1 - win`. Cubeless money equity (cube = 1, no cube decisions):

`equity = (win + gammon + backgammon) - ((1 - win) + loseGammon + loseBackgammon)`

Store the probabilities **and** `equity`; do not store equity alone.

## Shared eval object

```json
{
  "cubeless": {
    "equity": 0.0,
    "win": 0.5,
    "gammon": 0.0,
    "backgammon": 0.0,
    "loseGammon": 0.0,
    "loseBackgammon": 0.0
  },
  "cubefulEquity": 0.0,
  "cubeAction": {
    "double": false,
    "take": true
  },
  "source": "bgweb-api"
}
```

- `source`: `"bgweb-api"` | `"model"` | `"unknown"`.
- `cubefulEquity`: expected money points per game **for STM**, with the cube in its current state. Match bgweb-api `eq` after the mover→STM flip in [gnubg.md](gnubg.md).
- `cubeAction`: STM’s double decision and opponent’s take/drop if STM doubled. Use `null` when unknown or not applicable. **bgweb-api does not emit cube actions** — dumps leave this `null`.

Dumps store cubeless probabilities (and cubeful `eq` when requested). Training the net uses `cubeless.*`. The cube wrapper can use `cubefulEquity`; it cannot yet use teacher `cubeAction`.

## API

The eval object is always for **STM of the position being scored**.

`game-engine` returns legal **checker moves**, each with the eval of the **resulting** position (opponent is STM there). To rank plays for the mover, use **negated** `cubefulEquity` of that result (higher is better for the mover). Also return cubeless probs.

Cube decisions (double / no-double, take / drop) use the same eval object, not a second encoding.

## Out of scope until an ADR

Match equity, Crawford, Jacoby, beavers.
