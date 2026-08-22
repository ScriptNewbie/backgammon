# Evaluation semantics

Dump labels, training targets, and `game-engine` outputs share this schema. Cube support: [ADR 0003](../decisions/0003-doubling-cube.md). Match play: [ADR 0008](../decisions/0008-match-play.md), [match-play.md](match-play.md).

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

Store the probabilities **and** `equity`; do not store equity alone. The trained net emits the five probabilities in that table order (not equity); see [features.md](features.md) and [ADR 0015](../decisions/0015-teacher-cubeless-mlp.md).

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

- `source`: `"bgweb-api"` | `"model"` | `"heuristic"` | `"unknown"`.
- `cubefulEquity`: expected **money** points per game **for STM**, with the cube in its current state. Teacher dumps match bgweb-api `eq` after the mover→STM flip in [gnubg.md](gnubg.md). The engine uses dead-cube money `cubeless.equity * cube.value` ([ADR 0018](../decisions/0018-cube-wrap-formula.md)). This is **not** match-winning chance.
- `cubeAction`: STM’s double decision and opponent’s take/drop if STM doubled. Use `null` when unknown or not applicable. **bgweb-api does not emit cube actions** — teacher evals leave this `null`. The engine fills this from the dumper MWC heuristic when STM may double. Dumper cube *policy* for simulation is still metadata (`decision: "cube"`), not this field.

Dumps store cubeless probabilities (and cubeful `eq` when requested). Training the net uses `cubeless.*`. The cube wrapper uses `cubefulEquity` for ranking and the MWC formula for `cubeAction`; it cannot use teacher `cubeAction`.

Do not store MWC on the shared eval object. Derive it from cubeless probs + `position.match` + the MET when ranking simulated plays.

## API

The eval object is always for **STM of the position being scored**.

`game-engine` HTTP: [game-engine.md](game-engine.md). It returns legal **checker moves**, each with the eval of the **resulting** position (opponent is STM there). To rank plays for the mover in **money** play, use **negated** `cubefulEquity` of that result (higher is better for the mover). Also return cubeless probs.

The **dumper** ranks simulated checker plays by **mover MWC**, not money equity ([match-play.md](match-play.md)).

Cube decisions (double / no-double, take / drop) use the same eval object, not a second encoding. Teacher dumps still have `cubeAction: null`. Engine evals set `source` to `"model"`.

## Out of scope until an ADR

Jacoby, beavers.
