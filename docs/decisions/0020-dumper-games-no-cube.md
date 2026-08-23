# 0020 Dumper plays money games without a cube

- Status: accepted
- Date: 2026-08-23
- Supersedes: [0008](0008-match-play.md) for `move-dumper` only

## Context

ADR 0008 made training dumps **match play**: sampled odd match lengths, Crawford, dead-cube MWC ranking, and noisy cube offers/takes persisted as `decision: "cube"` rows. Training the cubeless net already ignores cube rows and splits only by `matchId`. Cube wrap for the engine and match play in battle-arena do not need the dumper to simulate matches or cube actions. Playing full matches with a cube heuristic made the dumper heavier than the training data requires.

Dumps are an unpublished working set. There is no public dump contract to version separately.

## Decision

- `move-dumper` simulates independent **money games** to bear-off. CLI `--games N` replaces `--matches`. There is no `--length`. SIGINT/SIGTERM finish after the **current game**.
- **No cube policy.** Call `playGame({ allowCube: false })`. Never offer, take, or drop. Do not write `decision: "cube"` records. Delete the dumper cube sampler.
- Rank/sample checker plays by **negated result cubeless equity** (`-play.eval.cubeless.equity`), not mover MWC. Store that value in `RankedPlay.rankScore` (higher is better; arena uses the same field for mover MWC). Softmax τ stays `0.08 / 0.025 / 0.008`. Infallible still tie-breaks on teacher `diff` then stable `steps`. Noob stays uniform. Keep fetching teacher cubeful `eq` (`cubefulLabels: true`); do not rank on it.
- Keep record `"v": 1`. Set `matchId` **equal to** `gameId` so [ADR 0012](0012-training-data-layout.md) split-by-`matchId` stays valid.
- Position JSON still includes `cube` ([ADR 0003](0003-doubling-cube.md)). Dumps always emit a dead cube: `value: 1`, `owner: "centered"`, `mayDouble` both false.
- `Position.match` is `MatchInfo | null`. The key is required. **Dumper / money JSON:** `match: null`. Do not emit a fake Crawford or 1-point match. **Arena / engine match play:** always set `match`.
- Cube wrap still computes `cubefulEquity = cubeless.equity * cube.value` when `match` is null. `cubeAction` is `null` when `match` is null — do not run the MWC heuristic without match state ([ADR 0018](0018-cube-wrap-formula.md)).
- Manifest `engine.settings.play` is `"game"`. Drop `matchLengths` and `met`. Gzip member + GNU SGF (`GM[6]`) **per game** at `replay/<gameId>.sgf` (no cube events). GNU SGF may still use a 1-point `MI` header so gnubg can open the file; that header is replay-only, not `Position.match`.
- Battle-arena match play and the engine cube wrap are unchanged ([ADR 0018](0018-cube-wrap-formula.md), [ADR 0019](0019-battle-arena.md)).

## Consequences

Do not sample match length or rank dumper checker plays by MWC. Do not treat dumper SGF as a multi-game match file. Do not invent Crawford or 1-away training signal from dumps. Further unpublished dump-internal cleanup amends this ADR and `docs/domain/`; do not mint a new ADR for it. Jacoby / beavers / raccoons stay open and unused. Specs: [move-dumper.md](../domain/move-dumper.md), [dump-format.md](../domain/dump-format.md), [board-representation.md](../domain/board-representation.md).
