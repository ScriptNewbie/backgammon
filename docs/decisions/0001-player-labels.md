# 0001 Player labels p1 and p2

- Status: accepted
- Date: 2026-08-20

## Context

The draft contract used `"O"` / `"X"`. We needed stable identities that are not colors and not “whoever is on roll.”

## Decision

Players are `"p1"` and `"p2"` everywhere (JSON, evals, cube owner, API).

- **p1** bears off toward point 1 (home board 1–6).
- **p2** bears off toward point 24 (home board 19–24).
- `onRoll` is `"p1"` or `"p2"`.
- Signed checker counts on `points` are **absolute**: positive = p1, negative = p2, regardless of who is on roll.

## Consequences

Featurization for the net must flip the board into side-to-move view. Do not use `"O"`, `"X"`, `"white"`, or `"black"` in new code.
