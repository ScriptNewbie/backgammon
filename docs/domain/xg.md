# eXtreme Gammon

Arena opponent for `battle-arena`. Locked by [ADR 0025](../decisions/0025-xg-gui-sidecar.md). Position JSON stays the stored form ([board-representation.md](board-representation.md)). XGID exists only on this wire. Training dumps stay on bgweb-api.

eXtreme Gammon 2 (XG) is a licensed Windows program. Its licence forbids reverse engineering, so the sidecar uses it the way a person does: import a position, run Analyze, and copy the analysis text. It never reads XG's binary, memory, files, settings, or registry, and nothing from the install goes into this repo or into Docker. Do not label dumps from XG.

## Run the sidecar

On the Windows host, in the interactive session:

1. Start eXtreme Gammon 2 and close its start dialog. Set the analysis level you want under **Analyze → Set Analyze Level**. The sidecar does not change it.
2. From the repo root, in Windows PowerShell 5.1:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File docs\integrations\xg\xg-sidecar.ps1
   ```

3. Run the arena from `battle-arena/`:

   ```sh
   docker compose --profile arena run --rm -e XG_BASE_URL=http://host.docker.internal:8091 arena npm run battle:inner -- --a game-engine --b xg --matches 1 --seed 1 --length 1
   ```

The sidecar listens on `127.0.0.1:8091` (`-Port`, `-BindAddress`). The arena service maps `host.docker.internal` to the host gateway. Docker Desktop forwards that to the host's loopback.

Keep XG open with the desktop unlocked. XG can stay behind other windows: the sidecar posts menu commands to its window and does not take focus or send keys. It does use the clipboard. Your clipboard text is restored after each query, but do not copy and paste while a match is running. One query runs at a time, so both sides may be `xg` on the same window. Each decision takes about 2–4 seconds, so prefer short matches. `-DebugLog` prints each import attempt.

## HTTP

| Request | Response |
| --- | --- |
| `GET /health` | `{"ok":true,"version":"eXtreme Gammon 2.10 …","pid":…}`, or 503 if XG is not running |
| `POST /v1/query` `{"xgid":"XGID=…","kind":"checker"}` | `{"ok":true,"text":"…"}`: XG's position text after **Analyze → Position** |
| `POST /v1/query` `{"xgid":"XGID=…","kind":"cube"}` | Same, after **Analyze → Double Action** |
| any failure | 422 `{"ok":false,"error":"…"}` |

A query:

1. Answers a leftover "Save Game" prompt with No. Closes any other XG dialog.
2. Puts the XGID on the clipboard and sends **File → Import → Position from Clipboard**. If XG asks "Save Game", it answers No; XG then reads the clipboard. Any other dialog fails the query with the dialog's text: for example, `Invalid position: The position cannot be imported: …`.
3. Reads **File → Export → XGID to Clipboard** and requires the exact XGID it sent. For a few seconds after an analysis, XG ignores an import without any message. The sidecar retries for up to 30 seconds.
4. Posts the Analyze command, then reads **File → Export → Position to Clipboard** until it has this XGID, contains the analysis, and is the same text three times in a row.

Menu command ids default to XG 2.10's numbering (`-CmdImportClipboard 123`, `-CmdExportText 130`, `-CmdExportXgid 132`, `-CmdAnalyzeCube 265`, `-CmdAnalyzePosition 266`). The sidecar warns if the window title is not 2.10.

## XGID

`XGID=<26 chars>:<cube>:<owner>:<turn>:<dice>:<score1>:<score2>:<crawford>:<length>:<maxcube>`. Checked against XG's own export.

| Our JSON | XGID |
| --- | --- |
| `bar.p2` | char 0, lowercase |
| `points[0..23]` (point 1..24) | chars 1..24: `p1` uppercase `A`=1 …, `p2` lowercase, `-` empty |
| `bar.p1` | char 25, uppercase |
| `cube.value` | log2(value) |
| `cube.owner` | `1` p1, `-1` p2, `0` centered |
| `onRoll` | `1` p1, `-1` p2. The checker string does not flip |
| `dice` | two digits; `null` is `00` (to roll or double) |
| `match.score.p1` / `.p2` | score1 / score2 |
| `match.crawford` | `1` / `0` |
| `match.length` | length (`match: null` is `0`) |
| nobody may double, not Crawford | maxcube = current cube exponent (XG has no dead-cube flag) |
| otherwise | maxcube `6` (64) |

p1 is XG's bottom player and bears off toward 1. The pending-double dice field (`D`) is not used: XG does not import it.

## Analysis text

XG writes from the side on roll ("Player"), with points numbered from that side. `ts-core/xg` parses:

- Checker: lines `N. <level> <move> eq:<equity>` followed by `Player: W% (G:g% B:b%)` and `Opponent: …`. The level is a free label (`3-ply`, `XG Roller++`, `Book¹`). Move tokens are `from/to` chains with `*` for a hit and `(n)` for repeats, `Bar` and `Off` in any case, or `Cannot Move`.
- Cube: `Best Cube action: <offer> / <response>`. Offer: `No double`, `No redouble`, `Too good to double`, `Too good to redouble` → `no-double`; `Double`, `Redouble` → `double`. Response: `Take` → `take`, `Pass` → `drop`.
- Numbers use a decimal comma or point.

Any other wording throws. There is no closest-match guess.

## Our client

- `positionToXgid(position)`.
- `matchXgPlay(position, notation)` replays the notation on our board (a chain without `*` jumps to its end, which leaves the same board) and returns the legal play that leaves the same board, choosing the smallest `stepsKey` among equals. `Cannot Move` must match an empty legal-play list.
- `xgResultCubeless(line)` turns the best line's `Player` / `Opponent` percentages into mover cubeless probabilities and flips them to the player about to move, the same as Hedgehog.
- `XgClient.cubeAction(position)` queries with the doubler on roll and dice cleared. Offer and take use the same analysis, and the last one is cached by XGID, so XG against XG asks once.

The arena driver (`battle-arena/src/drivers/xg.ts`) returns XG's top play without re-ranking it by MWC, and uses XG's offer and take on its side only.
