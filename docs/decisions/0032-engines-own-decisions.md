# 0032 Engines make their own checker and cube decisions

- Status: accepted
- Date: 2026-11-12
- Amends: the checker ranking in [0018](0018-cube-wrap-formula.md), the shared cube in [0019](0019-battle-arena.md) and [0023](0023-arena-any-driver.md), "no cube logic" in [0028](0028-game-engine-fast.md), the infallible level in [0007](0007-skill-levels-and-pairing.md) and [0020](0020-dumper-games-no-cube.md)

## Context

After [0025](0025-xg-gui-sidecar.md), [0030](0030-hedgehog-plays-itself.md), and [0031](0031-gnubg-cli-sidecar.md), the `xg`, `hedgehog`, and `gnubg` arena sides play their engine's own moves and cube. Our two engines did not:

- `game-engine` and `game-engine-fast` sorted `/evaluate` by money equity. The arena re-ranked their plays by mover MWC at the score; the `gui` played the money order even in a match.
- Their cube came from the arena's shared infallible heuristic, fed with the cubeless probs of the **previous** play. That play was the opponent's, so against gnubg our side doubled and took on gnubg's evaluation.
- The dumper's infallible level re-ranked gnubg's labels by cubeless equity instead of playing gnubg's choice.

## Decision

Every engine decides for itself. Callers (arena, `gui`, dumper) only play what the engine chose.

- **Checker play.** `POST /evaluate` on `game-engine` and `game-engine-fast` returns plays best first **at the position's match state**: by mover dead-cube MWC (`moverMwc`, Kazaross XG2 MET, [match-play.md](../domain/match-play.md)) when `match` is set, by negated `cubefulEquity` (money) when `match` is null. Ties break by `stepsKey`. `moves[0]` is the engine's play. `game-engine-fast`'s search and move filters stay on cubeless money equity; only the final order of the returned plays uses MWC.
- **Cube.** New `POST /cube` (`?ply=N` on `game-engine-fast`) on both engines. The body is a position with the doubler on roll and `dice: null`. The engine evaluates that position itself (`game-engine`: the net; `game-engine-fast`: its search at `ply`), applies the dead-cube formula of [0018](0018-cube-wrap-formula.md), and returns the doubler's offer and the taker's answer. `available` is false (no offer, no take) when `match` is null, the player on roll may not double, or the cube is at 64.
- `eval.cubeAction` stays in the eval schema but both engines now leave it `null`, like teacher labels. Cube decisions come only from `/cube`.
- **Arena.** The `game-engine` and `game-engine-fast` drivers play `moves[0]` and answer cube questions from `/cube` (the taker asks its own engine). `ts-core/sim` no longer evaluates the cube or carries the previous play's probabilities: `MatchPlayer.chooseOffer` and `chooseTake` take only the position. The loop still decides *when* a cube question is asked (not on the opening roll, not in the Crawford game, not at cube 64, never with `--no-cube`) and applies the result.
- **GUI.** Plays `moves[0]` and gets the engine's offer and take from `/cube`.
- **Dumper.** The infallible level plays gnubg's own first line (`plays[0]`, gnubg's order). noob, beginner, midwit, and genius are unchanged (softmax over negated result cubeless equity, same temperatures). Labels and the dump format are unchanged.
- `game-engine-fast` reads the MET from `MET_PATH` (default `/repo/docs/domain/data/kazaross-xg2-met.json`, the repo mount). The MET JSON stays the single copy.

## Consequences

The arena now measures each engine as it plays, including ours: our cube is our net's (or search's) own call, not the opponent's evaluation under our formula. `battle-arena/src/rank.ts`, `infallibleCube`, and `pickBestPlayIndex` are removed. `game-engine-fast` gains match code (MET lookup, dead-cube MWC, cube formula) in C++, kept equal to `ts-core/match` by tests on the same MET.

Cube decisions on `game-engine-fast` at `ply >= 1` cost a search of the pre-roll position. Money play still has no engine cube (Jacoby and beavers stay open). Spec: [game-engine.md](../domain/game-engine.md), [game-engine-fast.md](../domain/game-engine-fast.md), [evaluation.md](../domain/evaluation.md), [match-play.md](../domain/match-play.md), [battle-arena.md](../domain/battle-arena.md), [move-dumper.md](../domain/move-dumper.md), [gui.md](../domain/gui.md).
