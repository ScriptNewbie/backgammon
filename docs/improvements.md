# Possible improvements

Ideas that are understood and worth doing later, but not decided or scheduled. This is not the list of open decisions (that is [decisions/0000-open-questions.md](decisions/0000-open-questions.md)): an item here needs no answer from anyone until someone picks it up. When an item is taken on, write an ADR and remove it here.

Each entry: what, why it would help, rough cost, and where it came from.

## Engines

### Full cubeful search in `game-engine-fast`

- **What:** carry the cube state through the search tree and allow cube actions inside it: at each node the side to roll may double, and the other side takes or drops (gnubg's cubeful n-ply). Leaves get live-cube values (Janowski in money, the live-cube match model in matches); cube decisions at the root then see the next turns' cube actions instead of a formula on the root's averaged probabilities.
- **Why:** the strongest of the cube improvements discussed. It values a reply that lets the opponent double or cash correctly, and makes deeper-ply cube decisions genuinely better rather than the same formula on better probabilities. Gains are mostly in cube timing and close positions where cube leverage matters.
- **Cost:** large. Tree nodes carry cube value and ownership, nodes branch on cube decisions, leaf values depend on cube state, and averaging moves from probabilities to cubeful equities. Expect more evaluations per request and a rewrite of the search's backup and filters.
- **Measure first:** arena runs against gnubg after [ADR 0035](decisions/0035-live-cube-match-and-score-aware-search.md) (live-cube match cube, score-aware search), to see what is left to gain.
- **Origin:** discussion leading to ADR 0035 (2026-11-14).

### Cube efficiency by position type

- **What:** our Janowski money cube and live-cube match model use one cube efficiency, `x = 0.68`, everywhere. Efficiency really depends on the position (higher in long races and contact-free positions, lower in crunched or back-game positions); Hedgehog's commercial engine uses per-class efficiencies ([hedgehog.md](domain/hedgehog.md)).
- **Why:** better cube decisions from the same net, cheaply.
- **Cost:** small to medium: classify the position (race / contact / other) and pick `x`; tune against gnubg rollouts or arena results.
- **Origin:** money play, ADR 0034.
