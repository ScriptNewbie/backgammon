# Feature tensor

Locked by [ADR 0002](../decisions/0002-board-representations.md). This is the only training/inference input layout. Implement identically in Python (`training-ground`) and TypeScript (`ts-core`). Keep golden vectors in a git-tracked fixture.

The net sees **side-to-move (STM)**. Build the tensor from position JSON by treating `onRoll` as STM and the other player as opponent. Do not feed XGID to the net.

## Layout

One `float32` vector, length **196**, in this order. It encodes the board only ([ADR 0037](../decisions/0037-board-only-feature-tensor.md)).

### Points — 192 floats

For STM, then opponent. For each of 24 points (STM’s 1-point first):

Let `n` be that player’s checker count on the point (`n >= 0`).

| Offset | Value |
| --- | --- |
| 0 | `1` if `n >= 1` else `0` |
| 1 | `1` if `n >= 2` else `0` |
| 2 | `1` if `n >= 3` else `0` |
| 3 | `(n - 3) / 2` if `n > 3` else `0` |

STM’s 1-point is JSON point 1 when `onRoll == "p1"`, and JSON point 24 when `onRoll == "p2"` (board flipped so STM always bears off toward the tensor’s point 1).

### Bar and off — 4 floats

| Index | Value |
| --- | --- |
| 192 | STM bar / 2 |
| 193 | Opponent bar / 2 |
| 194 | STM off / 15 |
| 195 | Opponent off / 15 |

### Not inputs

The net is cubeless, so the featurizer ignores `position.cube`, `position.match`, and `position.dice`. Cube state, match score, and Jacoby are **not** net inputs: the cube wrap and MWC are derived outside the net ([evaluation.md](evaluation.md), [match-play.md](match-play.md)). Who is on roll is not an input either, because the tensor is always from STM's side. Nets exported before ADR 0037 took 206 floats (a 10-float cube block, fixed by [ADR 0029](../decisions/0029-fixed-cube-features.md)) and do not load any more.

## Output of the net

Cubeless outcome probabilities for **STM** (see [evaluation.md](evaluation.md)), as a length-**5** `float32` vector. ONNX output name is `cubeless` ([ADR 0015](../decisions/0015-teacher-cubeless-mlp.md)):

| Index | Field |
| --- | --- |
| 0 | `win` |
| 1 | `gammon` |
| 2 | `backgammon` |
| 3 | `loseGammon` |
| 4 | `loseBackgammon` |

Do not emit `equity` as a sixth head; derive it from the five probs. Cube equity is not a net output; it is wrapped from these probs + the position's cube state.

## Tests

Golden vectors live in [`training-ground/fixtures/features.json`](../../training-ground/fixtures/features.json). Python and TypeScript must match those `{ "id", "position", "vector" }` cases within `1e-6`. Do not generate the fixture from the code under test.
