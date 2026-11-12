# 0031 The teacher is the GNU Backgammon CLI in a sidecar

- Status: accepted
- Date: 2026-11-12
- Supersedes: [0006](0006-teacher-bgweb-api.md)
- Amends: the `teacher` driver and shared cube in [0023](0023-arena-any-driver.md)

## Context

The teacher was [foochu/bgweb-api](https://github.com/foochu/bgweb-api), a REST service built on GNU Backgammon (gnubg). It has no ply setting, no match score, and no cube decisions. So the arena's `teacher` side re-ranked its plays by our mover MWC and used our infallible cube heuristic, instead of playing gnubg. Checking it against the real gnubg 1.07 CLI showed three more problems:

- It labels at GnuBG **world class** (2-ply with gnubg's move filter: top candidates at 2-ply, the rest at 0-ply). Its `plies` field uses its own numbering (3 = GnuBG 2-ply, 1 = 0-ply). Manifests that say `"plies": 1` only report the last play's depth.
- It rounds every number to 3 decimals.
- **Concurrent requests change its answers.** Under 16 parallel requests, 75 of 660 plays (11%) differed from the same request sent alone. The old dumper sent only two at once (cubeless and cubeful), so the effect on existing dumps is small: re-asking bgweb one request at a time for 272 sampled records (4,248 plays) of the 750k-record batch reproduced every move list, and changed 5 plays (0.12%; 4 records, 1.5%) by more than rounding (typically 0.002-0.003, worst 0.036 in win probability).

## Decision

- The teacher for dumps and the arena `gnubg` side is GNU Backgammon itself: the Debian `gnubg` 1.07 binary, driven through its text command line by a sidecar in [docs/integrations/gnubg/](../integrations/gnubg/). Compose builds it as the `gnubg` service on port 8080 in `move-dumper/` and `battle-arena/`, replacing `bgweb-api`.
- **GPL boundary.** gnubg is GPL-3.0-or-later. It is installed from Debian at image build time and never copied into the repo. The sidecar (`server.mjs`, ours) runs gnubg as a separate process and talks to it only through its command line over pipes. It does not link gnubg, load its libraries, or use its embedded Python. It sends only commands it builds from a validated XGID, kind, ply, and filter. Build the image locally and do not publish it.
- **Wire.** `POST /v1/query {xgid, kind: checker|cube, ply: 0-4, filter: gnubg|all}` returns gnubg's `hint` text, which `ts-core/gnubg` parses. XGID is the existing representation 3 ([0002](0002-board-representations.md)); no new encoding. Each filter has its own pool of gnubg processes. Each process answers one request at a time, so answers do not depend on load.
- **Ply** is GnuBG's: 0 is the net, 1 is one roll, and so on. The sidecar sets it for checker play and cube decisions. Jacoby is off and output has 6 decimals.
- **Arena.** The driver is renamed `gnubg`; `teacher` stays as an accepted alias with a warning. `--a-ply` / `--b-ply` are 0-4, default 2 (world class, the depth the old teacher effectively played at). The `gnubg` side plays gnubg's own top move (`hint` with gnubg's move filter, at the real cube, score, and Crawford state) and gnubg's own offer and take ("Proper cube action", with the doubler on roll). It does not re-rank by MWC or use `cubeEval.infallible*`. "Optional double" counts as a double. "You cannot double" is no-double, and answering a take there fails the match.
- **Dumper.** `move-dumper` labels through the same sidecar. Defaults are `--ply 2 --label-filter gnubg`, which is how bgweb-api labelled. `--label-filter all` searches every play at `--ply`. gnubg leaves forced plays and finished games at its own depth either way. Labels still price a money game with a live centered cube, whatever the dumped position's cube says, as before. Manifest `engine.name` is `"gnubg"`, `engine.version` is gnubg's own banner, and `settings.ply` and `settings.labelFilter` record the depth. Eval `source` is `"gnubg"`. Batch ids end `-gnubg`.
- `ts-core/bgweb` is removed. Shared HTTP retry moves to `ts-core/http`, notation matching to `ts-core/notation`, and `LegalPlay` to the core types.

## Consequences

- At the same settings, gnubg and bgweb-api agree on win probabilities for 93% of plays within bgweb's rounding (200 positions checked against bgweb answering one request at a time). The remaining plays mostly differ because bgweb's cubeless request picks its 2-ply candidates by cubeless equity, while one cubeful `hint` picks them by cubeful equity.
- `cubefulEquity` labels differ more: about a third of plays move by more than 0.01, because bgweb's port computes cubeful equity differently from gnubg 1.07. Training reads only `cubeless.*`, so no net is affected.
- Old batches stay readable and keep `engine.name: "bgweb-api"` and `source: "bgweb-api"`. Their labels include the small concurrency noise above, plus 11 of roughly 11M plays whose probabilities are impossible (for example losing a gammon more often than losing at all); most are 0.001-0.007 rounding artifacts and 2-3 are grossly wrong. No moves are missing. Re-dumping removes both, but the old batch is not unusable.
- 2-ply world class labels about 35 records/s, and 0-ply about 75 records/s, on one dumper process. The sidecar defaults to one gnubg process per CPU per filter (`GNUBG_WORKERS`).
- Nothing GPL is linked into or vendored by this repo, and no gnubg code reaches `ts-core`. Trained nets learn from gnubg's evaluations (numbers produced by a separate program), as they did with bgweb-api, which also ran gnubg's nets.
