# Board widget

Locked by [ADR 0033](../decisions/0033-board-package.md). Vanilla TypeScript in `board/`. Run the demo with `docker compose up --build` from `board/` (http://localhost:5174). Host commands: [README.md](../../README.md).

An embeddable backgammon board. `gui` mounts the custom element and does not draw checkers or dice itself ([gui.md](gui.md)).

## Position

The position is an **XGID** string (representation 3, [board-representation.md](board-representation.md)). `positionFromXgid` in isomorphic `ts-core` parses it at this boundary. Invalid text paints an error inside the board and does not throw out of the custom element. The first paint does not animate.

`usedDice`, `movable`, and `swap` are not part of the XGID. They are the partial-turn extras play mode needs: dim spent dice, ring checkers the user can move, and show **Swap dice**. Changing only those patches the existing nodes. It does not roll dice or fly checkers.

## Custom element

`<backgammon-board xgid="XGID=...">`. `xgid` is the observed attribute. `usedDice`, `movable`, and `swap` are JavaScript properties. `movable` entries are `1`–`24` or `"bar"` (the `p1` bar). Events bubble out of the shadow root:

| Event | Detail |
| --- | --- |
| `point` | `{ point: number \| "bar" }` |
| `swap` | none |
| `settled` | none; the latest XGID has finished animating (or there was nothing to animate) |

The element adopts the board stylesheet in an open shadow root, so the host page does not need Tailwind.

## Motion

Diff the previous position with the next one. The board is one DOM tree. A new position updates the stacks in place: checkers that stay are the same nodes, and arriving checkers are added hidden.

- Dice appeared, or the two faces changed (not merely swapped): replace the dice and play a short 3D spin, landing flat, with no tilt. Same timing idea as the old GUI dice. A later dim or swap does not rebuild the cubes, so a spin is not reset.
- Cube value or owner changed: a short scale pulse.
- Checkers changed: if `generateLegalSequences` on the previous position has a play whose checker layout matches, fly that step order (smallest `stepsKey` when several match), A hit blot is already on the bar; only the checker that hit it flies. Otherwise pair each player’s losses to gains in bearing-off direction (`p1` toward 1, `p2` toward 24, bar then points then off).
- The flyer is removed only after the destination checker is unhidden, in the same turn, so the point does not blink empty.
- A newer XGID cancels an in-flight flight. Animations always run; the OS reduce-motion setting is ignored.

## Look

Solid colors, no gradients, no decorative shadows. `p1` is light checkers on the bottom, bearing off toward point 1. `p2` is dark checkers on the top.
