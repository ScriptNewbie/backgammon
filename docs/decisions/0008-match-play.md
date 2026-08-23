# 0008 Match play and cube heuristic

- Status: superseded for `move-dumper` by [0020](0020-dumper-games-no-cube.md). Battle-arena match play remains [0019](0019-battle-arena.md).
- Date: 2026-08-20

The Context and Decision sections below are the original 0008 text (dumper match play + cube heuristic). **`move-dumper` no longer follows them** ([0020](0020-dumper-games-no-cube.md)). Battle-arena still plays matches ([0019](0019-battle-arena.md)); the engine cube wrap still uses the dead-cube MWC formula ([0018](0018-cube-wrap-formula.md)).

## Context

v1 docs were money play with a cube ([ADR 0003](0003-doubling-cube.md)). Match length, Crawford, and match equity were open. At the time of this ADR the dumper played matches. bgweb-api has no match score and no cube-action endpoint; it only returns checker plays plus cubeless probabilities (and money cubeful `eq`). Cube offers in simulation must be derived locally, with weaker levels making noisy cube errors.

## Decision

- Dumps are **match play**. Money-play Jacoby / beavers / raccoons stay open and unused here.
- **Match length** is sampled uniformly per match from `{1, 3, 5, 7, 9, 11, 13, 15}`. Store it on `position.match.length` and in SGF `MI`.
- **Crawford is on.** No Holland rule. No beavers. Gammons and backgammons always count. A **1-point match** is Crawford for its only game (both sides start 1-away; cube dead).
- Position JSON includes a `match` object ([board-representation.md](../domain/board-representation.md)). Money play / dumper dumps use `match: null` ([ADR 0020](0020-dumper-games-no-cube.md)). Arena and the engine still set match.
- Match-winning chance uses the git-tracked **Kazaross XG2** table ([docs/domain/data/kazaross-xg2-met.json](../domain/data/kazaross-xg2-met.json)), covering 15-away and post-Crawford.
- Cube and checker ranking in the dumper use **dead-cube MWC**: expected MET after win / gammon / backgammon / loss at the relevant cube value, scores capped at match length. Live-cube recube value is out of scope for v1.
- Cube timing: before the roll when `mayDouble` is true for the player on roll. **Skip cube on the opening roll of a game** (no prior teacher eval). After that, use the cubeless probs of the play that produced the current position.
- Cube skill noise uses the same τ family as checker play ([ADR 0007](0007-skill-levels-and-pairing.md)). Infallible takes the MWC-best action, including too-good = no-double. Noob: ~10% offer when allowed; take/drop ~50/50.
- Teacher `eval.cubeAction` stays **`null`**. Heuristic cube actions are simulation metadata (`decision: "cube"`), not net labels. Cubeless training ignores `decision != "checker"`.
- The game-engine choice “formula vs learned cube head” remains open. The dumper’s formula is the candidate the engine may reuse.

## Consequences

Do not treat bgweb-api money `eq` as match equity. Do not invent teacher cube-action labels. Update [evaluation.md](../domain/evaluation.md), [match-play.md](../domain/match-play.md), and [0000-open-questions.md](0000-open-questions.md). Tensor slots 202–205 stay reserved zeros; the net remains cubeless.
