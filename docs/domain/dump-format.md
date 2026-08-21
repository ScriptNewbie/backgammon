# Dump format

Locked by [ADR 0005](../decisions/0005-dump-file-format.md), [ADR 0006](../decisions/0006-teacher-bgweb-api.md), [ADR 0007](../decisions/0007-skill-levels-and-pairing.md), [ADR 0008](../decisions/0008-match-play.md), [ADR 0009](../decisions/0009-dump-metadata-and-sgf.md), and [ADR 0012](../decisions/0012-training-data-layout.md). Change only via a new ADR.

On-disk output of `move-dumper`. Position and eval field shapes are not redefined here — use [board-representation.md](board-representation.md) and [evaluation.md](evaluation.md). Teacher conversion: [gnubg.md](gnubg.md). Simulation: [move-dumper.md](move-dumper.md).

## Layout

```
move-dumper/dumps/<batch-id>/     # gitignored
  manifest.json
  records.jsonl.gz
  replay/
    <matchId>.sgf

move-dumper/fixtures/             # git-tracked, tiny
  manifest.example.json
  records.example.jsonl
  replay.example.sgf
```

`<batch-id>` is UTC `YYYY-MM-DDTHHMMSSZ` plus engine name, e.g. `2026-08-20T204600Z-bgweb-api`.

UTF-8. Real dumps: gzip JSONL, one JSON object per line, no pretty-print. Fixtures: uncompressed `.jsonl` so diffs stay readable.

Do not use a JSON array of all records, Parquet, or SQLite as the dumper’s format.

## manifest.json

```json
{
  "v": 1,
  "batchId": "2026-08-20T204600Z-bgweb-api",
  "createdAt": "2026-08-20T20:46:00Z",
  "recordsFile": "records.jsonl.gz",
  "recordCount": 0,
  "engine": {
    "name": "bgweb-api",
    "version": "foochu/bgweb-api:latest",
    "settings": {
      "play": "match",
      "matchLengths": [1, 3, 5, 7, 9, 11, 13, 15],
      "baseUrl": "http://127.0.0.1:8080",
      "cubefulLabels": true,
      "plies": 1,
      "seed": 1,
      "met": "kazaross-xg2",
      "levels": ["noob", "beginner", "midwit", "genius", "infallible"],
      "pairingWeights": {
        "midwit-midwit": 8,
        "genius-midwit": 7,
        "genius-infallible": 6
      },
      "temperatures": {
        "beginner": 0.08,
        "midwit": 0.025,
        "genius": 0.008
      }
    }
  }
}
```

- `engine.name` is `"bgweb-api"`. `version` is the Docker image tag (or digest if pinned).
- `play` is `"match"` for v1 dumps. `matchLengths` is the set sampled **uniformly** per match. Each record’s `position.match.length` is that match’s length, not a batch constant.
- Extra keys under `engine.settings` are allowed (`plies` from `evaluation.info`). Do not remove `play` / `cubefulLabels`.
- Update `recordCount` when the batch finishes. If a run crashes, count the JSONL lines; do not trust a stale manifest.

## Record (`v: 1`)

One line = one decision point (`checker` or `cube`). Additive fields from ADR 0009; keep `"v": 1`.

```json
{
  "v": 1,
  "id": "01JJ...",
  "matchId": "01JK...",
  "gameId": "01JL...",
  "ply": 0,
  "decision": "checker",
  "players": { "p1": "midwit", "p2": "genius" },
  "chosen": {
    "steps": [{ "from": 8, "to": 5 }, { "from": 6, "to": 5 }]
  },
  "position": {},
  "eval": null,
  "moves": [
    {
      "steps": [{ "from": 8, "to": 5 }, { "from": 6, "to": 5 }],
      "eval": {}
    }
  ],
  "xgid": null
}
```

| Field | Meaning |
| --- | --- |
| `v` | Schema version. Must be `1`. |
| `id` | Unique string (ULID or UUID). Stable if a batch is merged or re-exported. |
| `matchId` / `gameId` | Ids for the simulated match and game. |
| `ply` | Checker half-moves in this game, 0-based. Cube records use the ply they precede (or follow a drop). |
| `decision` | `"checker"` or `"cube"`. Cubeless training **ignores** `"cube"`. |
| `players` | Level names for `p1` and `p2` ([move-dumper.md](move-dumper.md)). |
| `chosen` | What was played. Checker: `{ "steps": [...] }`. Cube: `{ "action": "no-double" \| "double" \| "take" \| "drop" }`. |
| `position` | Full position JSON, including cube and `match`. Checker dumps: `dice` is `[d1, d2]`. Cube dumps: `dice` is `null`. |
| `eval` | Eval of this checker position for STM, or **`null`**. bgweb-api scores **plays**, not the static pre-move board; leave `null` and train from `moves[]`. |
| `moves` | Checker: all legal plays, each with `steps` and teacher `eval` of the **result** (result STM). `source` is `"bgweb-api"`. `cubeAction` is `null`. Cube: omit or `[]`. |
| `xgid` | Optional debug string. bgweb-api does not return it — use `null`. **Training must ignore it.** |

Cube records store the simulated action in `chosen` only. Do not put heuristic cube actions on `eval.cubeAction` (that field stays `null` from the teacher). Optional `cubeChoices` listing `no-double` / `double` or `take` / `drop` is allowed; it is not a teacher label (`source` would be `"heuristic"` if an eval object is attached — trainers must still ignore it for the cubeless net).

Do not store full resulting boards on each move; replay `steps` if a trainer needs them.

## Replay SGF

GNU Backgammon match files: `FF[4]`, `GM[6]`, UTF-8. One match per `replay/<matchId>.sgf`. `PW` = p1, `PB` = p2; `W[]` = p1, `B[]` = p2. `MI` includes length. Include checker plays and cube doubles / takes / drops. Open in `replay-player` (`npm run up` in `replay-player/` then pick the file) or gnubg (`load match`). Replay tests: `npm test`. **Not a training input.** Not a fourth board representation.

## Training use

- Value net: `decision == "checker"` only. Apply each move’s `steps` to `position`, then `moves[].eval.cubeless` (STM of the result).
- Cube wrapper: `moves[].eval.cubefulEquity` when present (money eq from the teacher). Do not expect `cubeAction` from bgweb-api. Do not train the cubeless net on heuristic cube records.
- Move ranking in dumps is by mover MWC ([match-play.md](match-play.md)), not money equity. The stored labels remain cubeless probs + money `cubefulEquity`.

## Training layout

Locked by [ADR 0012](../decisions/0012-training-data-layout.md). Do not copy dumps into `training-ground/`.

From `training-ground/`, Compose mounts `../move-dumper/dumps` read-only at `/data/dumps`. Package source stays at `/app`. Split by `matchId` (not record, not batch):

`int.from_bytes(sha256(matchId.encode("utf-8")).digest()[:8], "big") % 100`

- `0–89` train (90%)
- `90–94` val (5%)
- `95–99` test (5%)

Cubeless training still ignores `decision == "cube"` at sample time; those rows stay in the same split as their match. Optional featurized cache later: gitignored `training-ground/cache/`. Checkpoints: `training-ground/checkpoints/`.

## Forbidden

- Pretty-printed multi-line records in `dumps/`.
- Committing `move-dumper/dumps/`.
- A second dump schema “for Python.”
- Treating `xgid`, SGF, or bgweb `x`/`o` boards as a training input.
