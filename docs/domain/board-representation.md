# Board representation

Locked by [ADR 0001](../decisions/0001-player-labels.md), [ADR 0002](../decisions/0002-board-representations.md), and [ADR 0008](../decisions/0008-match-play.md). Change only via a new ADR.

Three representations only:

1. **Position JSON** — source of truth (this file)
2. **Feature tensor** — train/infer input ([features.md](features.md))
3. **XGID** — optional human/gnubg interchange; not produced by bgweb-api. Never the net’s input.

## Players and geometry

- `"p1"` bears off toward point **1** (home: 1–6).
- `"p2"` bears off toward point **24** (home: 19–24).
- `points` is length 24. Index `0` is point 1. **Positive = p1 checkers, negative = p2**, even when p2 is on roll.
- Point **ids** in moves are `1`–`24` (or `"bar"` / `"off"`). Do not use 0-based ids in move lists.

Opening (p1 on roll, standard): p1 has 2 on 24, 5 on 13, 3 on 8, 5 on 6; p2 mirrored.

## Position JSON

```json
{
  "points": [-2, 0, 0, 0, 0, 5, 0, 3, 0, 0, 0, -5, 5, 0, 0, 0, -3, 0, -5, 0, 0, 0, 0, 2],
  "bar": { "p1": 0, "p2": 0 },
  "off": { "p1": 0, "p2": 0 },
  "onRoll": "p1",
  "dice": [3, 1],
  "cube": {
    "value": 1,
    "owner": "centered",
    "mayDouble": { "p1": true, "p2": true }
  },
  "match": {
    "length": 7,
    "score": { "p1": 0, "p2": 0 },
    "crawford": false
  }
}
```

| Field | Meaning |
| --- | --- |
| `points` | Length 24. Index 0 = point 1. Signed: p1 positive, p2 negative. |
| `bar.p1` / `bar.p2` | Checkers on the bar. |
| `off.p1` / `off.p2` | Checkers borne off. |
| `onRoll` | `"p1"` or `"p2"`. |
| `dice` | Two ints `1`–`6`; doubles `[n, n]`. `null` if not rolled. |
| `cube.value` | 1, 2, 4, … |
| `cube.owner` | `"centered"`, `"p1"`, or `"p2"`. |
| `cube.mayDouble.p1/p2` | Whether that player may offer a double. Centered cube ⇒ both true unless Crawford (both false) or a later money-play ADR says otherwise. |
| `match` | Match play ([match-play.md](match-play.md)). v1 dumps always set this. Money play later may use `null`. |
| `match.length` | Points to win. Dumper samples from `{1, 3, 5, 7, 9, 11, 13, 15}`. |
| `match.score.p1/p2` | Points already won. Match over at `>= length`. |
| `match.crawford` | `true` for the Crawford game (cube dead). Post-Crawford games use `false` with a live cube. |

Checker counts must sum to 15 per player (points + bar + off).

## Moves

Ordered checker steps: `{ "from": <1-24|"bar">, "to": <1-24|"off"> }`. Hits are implied (blot to bar).

Convert bgweb-api `play` (and XGID, if used) at the dumper boundary only. See [gnubg.md](gnubg.md).

## Forbidden

- A fourth representation (CNN grid, training-only JSON, FIBS as a stored format). GNU Backgammon SGF is a **game record** for replay, not a position encoding ([dump-format.md](dump-format.md)).
- Encoding the JSON from the on-roll player’s view by flipping signs (that flip belongs in the **tensor** only).
- `"O"` / `"X"` / color names as player ids.
