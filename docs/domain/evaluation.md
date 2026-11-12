# Evaluation semantics

Dump labels, training targets, and `game-engine` outputs share this schema. Cube support: [ADR 0003](../decisions/0003-doubling-cube.md). Dumper games: [ADR 0020](../decisions/0020-dumper-games-no-cube.md), [move-dumper.md](move-dumper.md). Arena/engine match play: [ADR 0008](../decisions/0008-match-play.md), [match-play.md](match-play.md).

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
  "cubeAction": null,
  "source": "gnubg"
}
```

- `source`: `"gnubg"` | `"bgweb-api"` | `"hedgehog"` | `"model"` | `"heuristic"` | `"unknown"`. `"gnubg"` is the teacher ([gnubg.md](gnubg.md)); `"bgweb-api"` marks teacher evals in batches written before [ADR 0031](../decisions/0031-gnubg-cli-sidecar.md). `"hedgehog"` is an arena opponent eval and stays out of training dumps; those plays leave `cubefulEquity` at 0 ([hedgehog.md](hedgehog.md)).
- `cubefulEquity`: expected **money** points per game **for STM**, with the cube in its current state. Teacher dumps hold gnubg's cubeful money `Eq.` (live centered cube) after the mover→STM flip in [gnubg.md](gnubg.md). The engine uses dead-cube money `cubeless.equity * cube.value` ([ADR 0018](../decisions/0018-cube-wrap-formula.md)). This is **not** match-winning chance.
- `cubeAction`: reserved for STM’s double decision and the opponent’s take/drop. It is always `null` today: **teacher labels never carry cube actions**, and both engines leave it `null` because their cube decisions come from `POST /cube` ([ADR 0032](../decisions/0032-engines-own-decisions.md), [game-engine.md](game-engine.md)). The dumper does not simulate cube actions ([ADR 0020](../decisions/0020-dumper-games-no-cube.md)).

Dumps store cubeless probabilities (and cubeful `eq` when requested). Training the net uses `cubeless.*`. The engines rank by MWC (match) or `cubefulEquity` (money) and decide the cube with the MWC formula on their own evals; nothing uses teacher `cubeAction`.

Do not store MWC on the shared eval object. The engines derive it from cubeless probs + `position.match` + the MET when `match` is set. The dumper samples by negated result cubeless equity; its infallible level plays gnubg’s own first line.

## API

The eval object is always for **STM of the position being scored**.

`game-engine` HTTP: [game-engine.md](game-engine.md). It returns legal **checker moves**, each with the eval of the **resulting** position (opponent is STM there), already ordered best first for the mover: mover MWC in a match, **negated** `cubefulEquity` of the result in money play ([ADR 0032](../decisions/0032-engines-own-decisions.md)). Callers play `moves[0]`; they do not re-rank.

The **dumper** samples simulated checker plays by **negated result cubeless equity**, not MWC; its infallible level plays gnubg’s first line ([move-dumper.md](move-dumper.md)).

Engine cube decisions (double / no-double, take / drop) come from `POST /cube` (doubler on roll, no dice), computed from the engine’s own cubeless probs of that position. Teacher dumps still have `cubeAction: null`. Engine evals set `source` to `"model"`.

## Out of scope until an ADR

Jacoby, beavers.
