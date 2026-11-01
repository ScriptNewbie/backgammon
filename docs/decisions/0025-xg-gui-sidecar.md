# 0025 eXtreme Gammon as a GUI sidecar

- Status: accepted
- Date: 2026-11-01
- Amends: the shared-cube rule in [0023](0023-arena-any-driver.md), for the `xg` driver only

## Context

eXtreme Gammon 2 (XG) is installed on the user's Windows machine under its licence. It has no CLI, no API, and no server mode. The licence forbids reverse compiling, disassembling, modifying, or deriving source code, ideas, or algorithms from it. We want it as an arena opponent anyway.

XG can do everything we need through its own menus. **File → Import → Position from Clipboard** reads an XGID. **Analyze → Position** and **Analyze → Double Action** analyse that position at the level the user set in XG. **File → Export → Position to Clipboard** writes the board, the XGID, and that analysis as text. A check against this install (XG 2.10) showed:

- The exported XGID matches what we send, field for field, with p1 as XG's bottom player and the checker string not flipped when p2 is on roll.
- The analysis text is written from the side on roll. Moves use mover-relative notation (`Bar/20`, `6/3*`, `13/7(2)`, `6/Off`, `Cannot Move`), each with `Player` / `Opponent` win, gammon, and backgammon percentages.
- The cube analysis ends in `Best Cube action: <offer> / <response>` (`No double / Take`, `Double / Pass`, `Too good to double / Pass`, `Redouble / Take`, …).
- XG does not import a pending double: the `D` dice field comes back as `00`. Its take decision is the second half of the doubler's cube analysis.
- XG prints numbers in the Windows locale (decimal commas here).

## Decision

- Add the `xg` arena driver. It talks to a host PowerShell sidecar, [docs/integrations/xg/xg-sidecar.ps1](../integrations/xg/xg-sidecar.ps1), that the user starts next to a running XG. It posts XG's own menu commands to its window and reads the clipboard text back. The sidecar does not take focus or send keys, and it answers XG's own "Save Game" prompt with No.
- What the sidecar never does: open, patch, or read the XG binary, its memory, or its `.xg` files, inject code, change XG's settings or registry, start rollouts, or redistribute anything from the install. XG stays out of Docker and out of the repo.
- XGID is built in `ts-core/xg` and used only on this wire. It is still representation 3 ([0002](0002-board-representations.md)), never stored, never fed to the net.
- Checker play is XG's top move, mapped onto our `generateLegalPlays` by the board it leaves (plays that leave the same board collapse to the smallest `stepsKey`). It is not re-ranked by MWC. Unknown notation, or a play that is not one of ours, fails the match. The best move's probabilities become `cubeless`, flipped to the player about to move.
- The cube on the `xg` side is XG's own: offer from the first half of its cube analysis, take from the second half, with the doubler on roll. `cubeEval.infallible*` is ignored on that side. The other side keeps `infallibleCube()`. `--no-cube`, Crawford, the opening roll, and cube 64 still skip the cube in the shared loop. A cube nobody may turn is sent with XG's max-cube field equal to its current value. Unknown cube wording fails the match.
- `ply` does not apply to `xg` and is dropped with a warning. Analysis depth is whatever the user set in XG.
- Do not label training dumps from XG and do not distil its choices into the net. `move-dumper` stays on bgweb-api, the same rule as Hedgehog ([0022](0022-hedgehog-external.md)).

## Consequences

The arena can measure our engine against XG's checker play and cube handling. Each XG decision takes a few seconds of GUI time, so 1- and 3-point matches are the practical size. XG must be open on an unlocked desktop. The sidecar borrows the clipboard during a query and restores its text afterwards.

The menu command ids in the sidecar are the ones XG 2.10 uses. Another XG build may need them passed as parameters. Spec: [docs/domain/xg.md](../domain/xg.md).
