# 0021 Featurized tensor cache

- Status: accepted
- Date: 2026-08-24

## Context

[ADR 0012](0012-training-data-layout.md) left an optional gitignored `training-ground/cache/` for featurized tensors. The first trainer loaded every dump record into Python lists, stacked them, and held train and val as dense torch tensors. That OOMs on large dumps and recomputes `featurize` on every run.

Dumps stay the source of truth. The cache is a derived artifact, not a second dump schema.

## Decision

- Training reads a **disk-backed cache** of float32 features `(n, 206)` and cubeless labels `(n, 5)` under gitignored `training-ground/cache/cubeless-v1/`. Default CLI: `--cache-dir cache`. `--rebuild-cache` wipes and rebuilds.
- **Per dump batch**, chunked `.npy` files (default 1,048,576 samples). Build writes straight into memmaps — no full-split Python lists or `np.stack`. A killed run writes `batches/<id>.building/` and is discarded on the next start (rename to `batches/<id>/` only after `fingerprint.json` is complete).
- **Stale detection is content-based.** `meta.json` stores cache format version, `FEATURE_SIZE`, `CUBELESS_OUTPUT_SIZE`, and a SHA-256 **code digest** of the modules that affect tensors (`features.py`, `board.py`, `cubeless.py`, `split.py`, `samples.py`). Each batch `fingerprint.json` stores the records filename, byte size, and SHA-256 of the dump file bytes (gzip bytes, not decompressed JSON). Every `ensure_feature_cache` rehashes dump files and compares.
  - Code digest or format/dims mismatch → wipe all batch shards and rebuild.
  - Dump batch removed → drop its cache dir.
  - New batch or size/sha256 mismatch → rebuild that batch only (one JSONL pass writes train/val/test).
- `CubelessDumpDataset` memory-maps shards and copies **one row** in `__getitem__`. Train shuffle is a **shard sampler** (shuffle chunk order, then indices inside a chunk) so RAM stays O(largest chunk), not O(N) for a full `randperm`.
- Bounded by disk, not RAM. Do not copy dumps into `training-ground/`.

## Consequences

JSONL dumps remain the contract ([dump-format.md](../domain/dump-format.md)). Changing the featurizer, split policy, or sample extraction invalidates the cache automatically. Adding a dump batch does not rewrite other batches. Spec layout: `training-ground/cache/` only. This fills in the cache item deferred in [0012](0012-training-data-layout.md).
