# 0012 Training data layout

- Status: accepted
- Date: 2026-08-21

## Context

`move-dumper` writes labelled batches under `move-dumper/dumps/` ([ADR 0005](0005-dump-file-format.md)). `training-ground` must consume those files without a second dump schema. Open choices were directory names under `training-ground`, train/val/test split policy, and whether to convert JSONL to a tensor cache on day one.

Copying batches into `training-ground/data/` would duplicate dumps and let the two trees drift. Converting to a cache before a model exists adds pipeline and invalidation work too early. Splitting by record or by batch would leak correlated positions from the same game into more than one split.

## Decision

- **Source of truth stays the dumper.** Trainers read `move-dumper/dumps/<batch-id>/` (`manifest.json` + `records.jsonl.gz`) as specified in [dump-format.md](../domain/dump-format.md). Do not copy dumps into `training-ground/`. Do not invent a Python dump schema. Ignore `xgid` and SGF (`replay/*.sgf` may be present on the mount; it is not a training input).
- **Compose mount.** From `training-ground/`, the `train` service bind-mounts `../move-dumper/dumps` read-only at `/data/dumps`. Package source stays at `/app`. The `install-host` service does not mount dumps.
- **Split unit is `gameId`**, not record and not batch. Deterministic bucket:

  `int.from_bytes(sha256(gameId.encode("utf-8")).digest()[:8], "big") % 100`

  - `0–89` train (90%)
  - `90–94` val (5%)
  - `95–99` test (5%)

  Readers may fall back to `matchId` when `gameId` is missing (older dump rows). New dumps write only `gameId`.
- **Cubeless net** ignores `decision == "cube"` at sample time (legacy match dumps). [ADR 0020](0020-dumper-games-no-cube.md) dumps are checker-only games.
- **Featurized cache** ([ADR 0021](0021-featurized-tensor-cache.md)): gitignored `training-ground/cache/` for memmap `.npy` shards. Training may read gzip JSONL to build or refresh that cache. The cache is not a new dump contract.
- **Artifacts:** checkpoints under `training-ground/checkpoints/` (gitignored). Do not commit `*.pt`, `*.onnx`, `*.pte`, or `wandb/`.

## Consequences

Do not copy or symlink dump batches into `training-ground/data/`. Do not split by record id or batch id. JSONL→cache conversion writes only under `training-ground/cache/` ([ADR 0021](0021-featurized-tensor-cache.md)). Spec: [dump-format.md](../domain/dump-format.md). This closes the training-layout item left open in [0005](0005-dump-file-format.md) and [0000-open-questions.md](0000-open-questions.md). GPU/CUDA image: [ADR 0013](0013-training-cuda.md).
