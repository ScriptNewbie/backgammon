# Teacher engine (GNU Backgammon CLI)

`move-dumper` labels checker plays, and the arena `gnubg` side plays, with GNU Backgammon (gnubg) 1.07 through its command line, wrapped by a local sidecar. Locked by [ADR 0031](../decisions/0031-gnubg-cli-sidecar.md), which superseded the bgweb-api teacher of [ADR 0006](../decisions/0006-teacher-bgweb-api.md).

On-disk dumps: [dump-format.md](dump-format.md). Dumper simulation: [move-dumper.md](move-dumper.md). Arena: [battle-arena.md](battle-arena.md). Match math: [match-play.md](match-play.md).

## Licensing (GPL boundary)

| Part | Licence | Rule here |
| --- | --- | --- |
| `gnubg` 1.07 binary, nets, MET | GPL-3.0-or-later | Installed from Debian inside the sidecar image at build time. Never copied into this repo. |
| [server.mjs](../integrations/gnubg/server.mjs), [Dockerfile](../integrations/gnubg/Dockerfile) | this repo | Ours. Runs gnubg as a separate process and speaks only its text command line over pipes. |
| `ts-core/gnubg` | this repo | Builds an XGID and parses gnubg's printed `hint` text. No gnubg code. |

Do not link gnubg, load its libraries, use its embedded Python (`gnubg -p`), copy its source, nets, or tables into the repo, or publish the sidecar image. Talk to it only through the sidecar.

## Run

The sidecar is the `gnubg` Compose service in `move-dumper/` and `battle-arena/` (Docker only, [ADR 0011](../decisions/0011-docker-only.md)). Both build the same `backgammon-gnubg` image from [docs/integrations/gnubg/](../integrations/gnubg/) and publish port 8080, so run one project's stack at a time.

```sh
docker compose up -d          # from move-dumper/ or battle-arena/
docker compose build gnubg    # after the sidecar changes
```

`GNUBG_WORKERS` sets how many gnubg processes each filter's pool runs (default: one per CPU). Default host URL: `http://127.0.0.1:8080`; inside Compose: `http://gnubg:8080` (`GNUBG_BASE_URL`).

## Wire

`GET /health` returns `{"ok":true,"version":"GNU Backgammon 1.07.001 20230103","api":1,"workers":N,"maxPly":4}`. The client refuses any `api` other than 1.

`POST /v1/query` body:

| Field | Values | Meaning |
| --- | --- | --- |
| `xgid` | `XGID=...` | Position, cube, dice, score, Crawford, length (representation 3, built by `positionToXgid`) |
| `kind` | `checker` / `cube` | `hint 999` with dice, or `hint` without dice (the doubler on roll) |
| `ply` | 0-4 | GnuBG ply for checker play and cube decisions: 0 is the net, 1 is one roll, ... |
| `filter` | `gnubg` / `all` | `gnubg`: gnubg's own move filter (top candidates at `ply`, the rest shallower), which is how gnubg plays. `all`: every play searched at `ply`. |

The reply is `{"ok":true,"text":"<gnubg output>"}`. gnubg errors such as `Illegal position.` return 422, because gnubg would otherwise analyse the previous position. Every gnubg process starts with `set display off`, `set output digits 6`, both players human, and Jacoby off.

## Parsing (`ts-core/gnubg`)

gnubg prints moves and probabilities **from the side on roll**, with mover-relative points:

```
    1. Cubeful 2-ply    8/2 6/2                      Eq.: +0.013998
       0.500046 0.151340 0.006960 - 0.499954 0.140902 0.005746
```

- The move notation is matched onto our legal plays by the board it leaves (`ts-core/notation`, shared with XG). A play that is not one of ours fails.
- Probabilities are win, gammon, backgammon, then lose, gammon, backgammon, for the mover. `-0.000000` reads as 0. `There are no legal moves.` is a dance.
- `Eq.` is cubeful: money points in a money game, EMG at a match score.
- Cube: `Proper cube action: <offer>, <take>`. No double / no redouble / too good to (re)double are no-double; double / redouble / optional (re)double are double. Take / beaver are take; pass is drop. `You cannot double.` (Crawford, the opponent owns the cube) is no-double with no take decision. Unknown wording fails.

## Dumper labels

`GnubgClient.getMoves` labels every legal play. The position is sent as a **money game with a live centered cube**, whatever the dumped position's cube says (the dumper turns the cube off). That is what bgweb-api labelled.

| gnubg (mover) | our `moves[].eval` (result STM) |
| --- | --- |
| lose | `cubeless.win` |
| lose gammon / lose backgammon | `gammon` / `backgammon` |
| gammon / backgammon | `loseGammon` / `loseBackgammon` |
| cubeless money equity of the mover probabilities | negate → `cubeless.equity` |
| `Eq.` (cubeful money) | negate → `cubefulEquity` |
| cubeless equity minus the best play's | `teacherDiff` (0 for the best, else negative) |

`cubeAction` is always `null`, and `source` is `"gnubg"`. Defaults are `--ply 2 --label-filter gnubg` (GnuBG world class, as bgweb-api labelled). With `--label-filter all` every play must come back at `--ply`, except forced plays and finished games, which gnubg reports at its own depth. Anything else fails the dump. A dance skips the sidecar and dumps no moves.

## Arena

`GnubgClient.chooseChecker` plays gnubg's top line with the `gnubg` filter at the side's `ply`, at the real cube, score, and Crawford state. `cubeAction` asks once per position (cached) and returns gnubg's offer and the taker's answer. The arena does not re-rank or override either ([battle-arena.md](battle-arena.md)).

## bgweb-api batches

Batches written before ADR 0031 have `engine.name: "bgweb-api"`, `source: "bgweb-api"`, 3-decimal labels, and `settings.plies` in bgweb's numbering (its 3 is GnuBG 2-ply, its 1 is 0-ply; the field only reports the last play). bgweb-api changed its answers under concurrent requests and the old dumper sent two at once: about 0.12% of plays in the 750k-record batch differ from bgweb asked alone (typically 0.002-0.003, worst 0.036), and 11 plays have impossible probabilities. Every move list is complete. `cubefulEquity` also differs from gnubg 1.07 in about a third of plays; training does not read it.

## Do not

- Link, vendor, or script gnubg from inside (`gnubg -p`), or publish the sidecar image.
- Feed XGID, gnubg text, or SGF into training.
- Put cube decisions on teacher `eval.cubeAction`.
- Truncate the move list on training dumps.
