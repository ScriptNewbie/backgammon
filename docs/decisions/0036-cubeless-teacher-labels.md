# 0036 Teacher labels are cubeless all the way down

- Status: accepted
- Date: 2026-11-14
- Amends: the dumper labels of [0031](0031-gnubg-cli-sidecar.md) (money game with a live centered cube, cubeful `Eq.` → `cubefulEquity`)

## Context

The net is cubeless ([0003](0003-doubling-cube.md), [0015](0015-teacher-cubeless-mlp.md)) and dumper games have no cube ([0020](0020-dumper-games-no-cube.md)). gnubg's printed probabilities are cubeless, but the dumper asked for them with cubeful checker-play evaluation and a live centered cube (as bgweb-api did). At ply 1 and up, gnubg then picks the replies inside its search, and orders the plays, by cubeful money equity, so the cube leaks a little into the labels and into the infallible level's choice. The leak is small and the same in every sample, but it has no place in cubeless labels.

gnubg also rounds each printed probability on its own, so a label can break `gammon <= win` or `loseGammon <= 1 - win` by about 1e-6. Each of the six exclusive outcomes (single, gammon, backgammon win or loss) should be a non-negative probability.

## Decision

- The gnubg sidecar query takes a required `cubeful` flag. `cubeful: false` runs `set evaluation chequerplay evaluation cubeful off` in its own process pool.
- `GnubgClient.getMoves` (teacher labels) always sends `cubeful: false` and accepts only `Cubeless` lines. `chooseChecker` and `cubeAction` (gnubg as an arena player) stay cubeful at the real cube and score.
- Labels carry no cubeful equity: `moves[].eval.cubefulEquity` is 0. The manifest says `cubefulLabels: false`.
- The dumper clamps each play's probabilities to a consistent set before it samples or stores them: `0 <= backgammon <= gammon <= win <= 1`, `0 <= loseBackgammon <= loseGammon <= 1 - win`, equity recomputed.
- Training drops a play when it builds the tensor cache if any exclusive outcome of its label is below `-1e-5` (gnubg's 6-digit rounding plus float32 storage stays well inside that). In existing data that is exactly the 11 impossible plays of the old bgweb-api batch (off by 0.001 to 0.41, of 11.7 million); clamped labels never trip it.

## Consequences

Old batches stay valid training data: their probabilities are cubeless and differ from new labels only through the replies chosen in the search. Training does not read `cubefulEquity` or `cubefulLabels`. The infallible level now plays gnubg's best play by cubeless equity. Both Compose files build the same sidecar image, so rebuild it (`docker compose build gnubg`) before dumping or running the arena; an old sidecar ignores `cubeful` and returns cubeful lines, which the dumper refuses. Specs: [gnubg.md](../domain/gnubg.md), [move-dumper.md](../domain/move-dumper.md), [dump-format.md](../domain/dump-format.md), [evaluation.md](../domain/evaluation.md).
