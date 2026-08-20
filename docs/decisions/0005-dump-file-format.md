# 0005 Dump file format

- Status: accepted
- Date: 2026-08-20

## Context

`move-dumper` must persist labelled positions and move evals for PyTorch. Options were a single giant JSON array, Parquet/HDF5, or newline-delimited JSON. The dumper is TypeScript; records must be the existing position JSON + eval object; dumps must stream, survive a crash mid-run, and stay gitignored.

## Decision

- One **batch directory** under `move-dumper/dumps/` (gitignored).
- `manifest.json` for engine version and settings; `records.jsonl.gz` for data (gzip JSONL, one record per line).
- Record schema `v: 1` as specified in [docs/domain/dump-format.md](../domain/dump-format.md).
- Tiny uncompressed fixtures live in `move-dumper/fixtures/` and **are** git-tracked.
- Training may later convert JSONL to Parquet/memmap; that is `training-ground` layout (still open), not a second dump contract.

Teacher engine (CLI vs HTTP) is **not** in this ADR; see [0006](0006-teacher-bgweb-api.md).

## Consequences

Do not write pretty-printed JSON arrays, SQLite, or Parquet from the dumper. Do not commit `move-dumper/dumps/`. Trainers read JSONL (or a derived cache) and ignore optional `xgid`.
