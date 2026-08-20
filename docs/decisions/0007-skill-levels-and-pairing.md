# 0007 Skill levels, pairing, and checker sampling

- Status: accepted
- Date: 2026-08-20

## Context

`move-dumper` must generate training positions by playing games, not by sampling isolated boards. Uniform self-play at one strength (especially random vs random) either lacks diversity or floods the dump with low-quality trajectories. Checker-play labels still come from bgweb-api; the policy only shapes which positions appear.

## Decision

- Simulate **matches** between two of five named levels: `noob`, `beginner`, `midwit`, `genius`, `infallible`.
- At the start of each match, sample an unordered pair from the weights in [docs/domain/move-dumper.md](../domain/move-dumper.md), then randomly assign `p1` / `p2`. Independently sample match length ([ADR 0008](0008-match-play.md)). The same pair plays the whole match.
- Default weights prefer midwit–midwit, midwit–genius, and genius–infallible. **noob–noob is weight 0**.
- Every checker decision dumps **all** legal plays with teacher evals (`score-moves: true`, no `max-moves`), including noob games.
- The on-roll player **samples** a play by level. Ranking uses **mover match-winning chance**, not money equity (see [match-play.md](../domain/match-play.md)):

| Level | Checker policy |
| --- | --- |
| noob | Uniform over legal plays |
| beginner | Softmax on mover MWC, τ = 0.08 |
| midwit | τ = 0.025 |
| genius | τ = 0.008 |
| infallible | Argmax MWC; ties by teacher `diff` then stable `steps` order |

`P(i) ∝ exp(mwc_i / τ)` with τ in MWC units. Weights and temperatures are manifest settings; the table above is the default.

## Consequences

Do not dump only the chosen play. Do not rank simulated checker plays by money cubeful equity. Do not sample noob vs noob under the default weights. Implementation of the sampler is later; this ADR locks names, pairing, and the sampling rule.
