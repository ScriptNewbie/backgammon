# Dump format

Locked by [ADR 0005](../decisions/0005-dump-file-format.md), [ADR 0006](../decisions/0006-teacher-bgweb-api.md), [ADR 0007](../decisions/0007-skill-levels-and-pairing.md), [ADR 0009](../decisions/0009-dump-metadata-and-sgf.md), [ADR 0012](../decisions/0012-training-data-layout.md), [ADR 0020](../decisions/0020-dumper-games-no-cube.md), and [ADR 0021](../decisions/0021-featurized-tensor-cache.md). Change only via a new ADR.

On-disk output of `move-dumper`. Position and eval field shapes are not redefined here — use [board-representation.md](board-representation.md) and [evaluation.md](evaluation.md). Teacher conversion: [gnubg.md](gnubg.md). Simulation: [move-dumper.md](move-dumper.md).

## Layout

```
move-dumper/dumps/<batch-id>/     # gitignored
  manifest.json
  records.jsonl.gz
  replay/
    <gameId>.sgf

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
      "play": "game",
      "baseUrl": "http://127.0.0.1:8080",
      "cubefulLabels": true,
      "plies": 1,
      "seed": 1,
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
- `play` is `"game"` ([ADR 0020](../decisions/0020-dumper-games-no-cube.md)). Do not emit `matchLengths` or `met`. `position.match` is `null`.
- Extra keys under `engine.settings` are allowed (`plies` from `evaluation.info`). Do not remove `play` / `cubefulLabels`.
- Update `recordCount` after **each committed game** (and again when the batch finishes) so a crash still has a usable count. If a run dies mid-game, count the JSONL lines; do not trust a stale manifest. Gzip is concatenated members, one per finished game — `gunzip` still yields one JSONL stream.

## Record (`v: 1`)

One line = one checker decision. Additive fields from ADR 0009; keep `"v": 1`. [ADR 0020](../decisions/0020-dumper-games-no-cube.md) dumps are checker-only; legacy match dumps may still contain `decision: "cube"` rows.

```json
{
  "v": 1,
  "id": "01JJ...",
  "gameId": "01JK...",
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
| `gameId` | Id of the dumped game. Training splits on this field. Older rows may still have `matchId`; readers fall back to it when `gameId` is missing. New dumps do not write `matchId`. |
| `ply` | Checker half-moves in this game, 0-based. |
| `decision` | `"checker"` for new dumps. Cubeless training **ignores** `"cube"` if a legacy dump still has it. |
| `players` | Level names for `p1` and `p2` ([move-dumper.md](move-dumper.md)). |
| `chosen` | `{ "steps": [...] }` for the sampled checker play. |
| `position` | Full position JSON. Cube is always dead (`value` 1, centered, `mayDouble` both false). `match` is **`null`**. **Do not train on the dead cube as live cube state.** `dice` is `[d1, d2]`. |
| `eval` | Eval of this checker position for STM, or **`null`**. bgweb-api scores **plays**, not the static pre-move board; leave `null` and train from `moves[]`. |
| `moves` | All legal plays, each with `steps` and teacher `eval` of the **result** (result STM). `source` is `"bgweb-api"`. `cubeAction` is `null`. |
| `xgid` | Optional debug string. bgweb-api does not return it — use `null`. **Training must ignore it.** |

Do not write cube-decision rows. Teacher `eval.cubeAction` stays `null`.

Do not store full resulting boards on each move; replay `steps` if a trainer needs them.

## Replay SGF

GNU Backgammon files: `FF[4]`, `GM[6]`, UTF-8. One **game** per `replay/<gameId>.sgf`. `PW` = p1, `PB` = p2; `W[]` = p1, `B[]` = p2. Checker plays only (no cube events). Open in `replay-player` (`docker compose up --build` in `replay-player/` then pick the file) or gnubg. Replay tests: `docker compose --profile test run --rm test` from `replay-player/`. **Not a training input.** Not a fourth board representation. Arena **matches** still use the same encoding under `battle-arena/replays/` ([battle-arena.md](battle-arena.md)).

## Training use

- Value net: `decision == "checker"` only. Apply each move’s `steps` to `position`, then `moves[].eval.cubeless` (STM of the result). Ignore `position.match` (`null` on new dumps) and `position.cube` (dead) except as schema.
- Cube wrapper: `moves[].eval.cubefulEquity` when present (money eq from the teacher). Do not expect `cubeAction` from bgweb-api.
- Move ranking in new dumps is by negated result cubeless equity ([move-dumper.md](move-dumper.md)). The stored labels remain cubeless probs + money `cubefulEquity`.

## Training layout

Locked by [ADR 0012](../decisions/0012-training-data-layout.md). Do not copy dumps into `training-ground/`.

From `training-ground/`, Compose mounts `../move-dumper/dumps` read-only at `/data/dumps`. Package source stays at `/app`. Split by `gameId` (not record, not batch); fall back to `matchId` if `gameId` is missing:

`int.from_bytes(sha256(gameId.encode("utf-8")).digest()[:8], "big") % 100`

- `0–89` train (90%)
- `90–94` val (5%)
- `95–99` test (5%)

New dumps write only `gameId`. Cubeless training still ignores `decision == "cube"` at sample time if a legacy dump has those rows. Featurized tensor cache: gitignored `training-ground/cache/` ([ADR 0021](../decisions/0021-featurized-tensor-cache.md)). Checkpoints: `training-ground/checkpoints/`.

## Forbidden

- Pretty-printed multi-line records in `dumps/`.
- Committing `move-dumper/dumps/`.
- A second dump schema “for Python.”
- Treating `xgid`, SGF, or bgweb `x`/`o` boards as a training input.
