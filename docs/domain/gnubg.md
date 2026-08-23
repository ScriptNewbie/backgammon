# Teacher engine (bgweb-api)

`move-dumper` talks to [foochu/bgweb-api](https://github.com/foochu/bgweb-api), a REST wrapper around GNU Backgammon nets. Not the gnubg CLI. Locked by [ADR 0006](../decisions/0006-teacher-bgweb-api.md).

On-disk dumps: [dump-format.md](dump-format.md). Dumper simulation (independent games, no cube, SGF): [move-dumper.md](move-dumper.md). Arena/engine match math: [match-play.md](match-play.md). The API has **no match score and no cube-action endpoint**.

## Run

From `move-dumper/` (Docker only — [ADR 0011](../decisions/0011-docker-only.md)):

```sh
npm run up
```

That starts [foochu/bgweb-api](https://github.com/foochu/bgweb-api) via [docker-compose.yml](../../move-dumper/docker-compose.yml). Stop with `npm run down`. Dump games with `npm run dump -- --games 1 --seed 1` (Compose sets `BGWEB_BASE_URL` to the `bgweb-api` service). Tests: `npm test`. IDE `node_modules` on the host: `npm run install:host`.

Default host base URL: `http://127.0.0.1:8080`. Endpoint: `POST /api/v1/getmoves`. Confirm with a getmoves request (or open `/`); if the server is down, stop and tell the user.

## Request (dumper → API)

Omit `max-moves` (all legal plays). `score-moves: true`.

| Our JSON | bgweb-api |
| --- | --- |
| `p1` | player `x` |
| `p2` | player `o` |
| `onRoll` | `player`: `"x"` or `"o"` |
| `dice` | `dice` `[d1, d2]` |
| cubeless pass | `cubeful: false` |
| cubeful-eq pass | `cubeful: true` |

Each side’s `board.x` / `board.o` is **that player’s own 1–24** (their bear-off is point 1), sparse counts plus `bar`.

- `board.x[n]` = p1 checkers on **our** point `n`
- `board.o[n]` = p2 checkers on **our** point `25-n`

Opening (both homes look the same in bgweb): each of `x` and `o` has `6:5`, `8:3`, `13:5`, `24:2`.

## Response → our dump

`play[]` `from`/`to` are strings: `"1"`–`"24"`, `"bar"`, `"off"`, **from the player on roll’s view**.

- If `onRoll` is `p1`: numbers are already our point ids.
- If `onRoll` is `p2`: point `k` → our `25-k`. `"bar"` / `"off"` unchanged.

bgweb `evaluation` is **for the mover** (higher `eq` is a better play). Our eval object is **for STM of the resulting position** (opponent to move). Flip at the boundary:

| bgweb (mover) | our `moves[].eval` (result STM) |
| --- | --- |
| `probability.win` | `cubeless.win` ← mover `lose` |
| `winG` / `winBG` | `loseGammon` / `loseBackgammon` |
| `loseG` / `loseBG` | `gammon` / `backgammon` |
| `eq` with `cubeful: false` | negate → `cubeless.equity` |
| `eq` with `cubeful: true` | negate → `cubefulEquity` |

`cubeAction` is always `null` (API to-do). `source` is `"bgweb-api"`. Record-level `position.eval` is usually `null`; labels live on `moves[]`. The dumper does not compute MWC or cube actions ([ADR 0020](../decisions/0020-dumper-games-no-cube.md)). Arena/engine MWC lives in `ts-core` ([match-play.md](match-play.md)).

Store `evaluation.info.plies` (and cubeful flag) on the batch manifest settings, not as a second eval schema.

## Do not

- Call the gnubg CLI, scrape gnubg UI, or parse gnubg save files **for labels**. Writing GNU Backgammon SGF for **debug replay** is allowed ([dump-format.md](dump-format.md)).
- Feed bgweb `x`/`o` boards, XGID, or SGF into training.
- Put heuristic cube double/take/drop on teacher `eval.cubeAction`.
- Truncate the move list with `max-moves` on training dumps.
- Send match score or Crawford to getmoves — the OpenAPI has no such fields.
