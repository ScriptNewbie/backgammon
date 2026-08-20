# Dump format

Locked by [ADR 0005](../decisions/0005-dump-file-format.md) and [ADR 0006](../decisions/0006-teacher-bgweb-api.md). Change only via a new ADR.

On-disk output of `move-dumper`. Position and eval field shapes are not redefined here — use [board-representation.md](board-representation.md) and [evaluation.md](evaluation.md). Teacher conversion: [gnubg.md](gnubg.md).

## Layout

```
move-dumper/dumps/<batch-id>/     # gitignored
  manifest.json
  records.jsonl.gz

move-dumper/fixtures/             # git-tracked, tiny
  manifest.example.json
  records.example.jsonl
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
      "play": "money",
      "baseUrl": "http://127.0.0.1:8080",
      "cubefulLabels": true,
      "plies": 1
    }
  }
}
```

- `engine.name` is `"bgweb-api"`. `version` is the Docker image tag (or digest if pinned).
- Extra keys under `engine.settings` are allowed (`plies` from `evaluation.info`). Do not remove `play` / `cubefulLabels`.
- Update `recordCount` when the batch finishes. If a run crashes, count the JSONL lines; do not trust a stale manifest.

## Record (`v: 1`)

One line = one decision point.

```json
{
  "v": 1,
  "id": "01JJ...",
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
| `position` | Full position JSON, including cube. `dice` is `[d1, d2]` for checker-play dumps. |
| `eval` | Eval of this checker position for STM, or **`null`**. bgweb-api scores **plays**, not the static pre-move board; leave `null` and train from `moves[]` (apply `steps` to get the resulting position). |
| `moves` | All legal checker plays, each with `steps` (our absolute points) and `eval` of the **resulting** position (that result’s STM). `source` is `"bgweb-api"`. `cubeAction` is `null`. |
| `xgid` | Optional debug string. bgweb-api does not return it — use `null`. **Training must ignore it.** |

Do not store full resulting boards on each move; replay `steps` if a trainer needs them.

## Training use

- Value net: apply each move’s `steps` to `position`, then `moves[].eval.cubeless` (STM of the result).
- Cube wrapper: `moves[].eval.cubefulEquity` when present. Do not expect `cubeAction` from this teacher.
- Move ranking: rank by negated cubeful (or cubeless) equity of the result.

## Forbidden

- Pretty-printed multi-line records in `dumps/`.
- Committing `move-dumper/dumps/`.
- A second dump schema “for Python.”
- Treating `xgid` or bgweb `x`/`o` boards as a training input.
