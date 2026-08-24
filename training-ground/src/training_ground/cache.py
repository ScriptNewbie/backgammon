from __future__ import annotations

import hashlib
import json
import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import numpy as np

from training_ground.cubeless import CUBELESS_OUTPUT_SIZE
from training_ground.dumpio import iter_records_file, record_files
from training_ground.features import FEATURE_SIZE
from training_ground.log import info
from training_ground.samples import iter_samples_for_record, split_id
from training_ground.split import split_name

Split = Literal["train", "val", "test"]
SPLITS: tuple[Split, ...] = ("train", "val", "test")

CACHE_FORMAT_VERSION = 1
CACHE_NAME = "cubeless-v1"
DEFAULT_CHUNK_SIZE = 1_048_576
_HASH_BUF = 1024 * 1024
_CODE_FILES = ("features.py", "board.py", "cubeless.py", "split.py", "samples.py")


@dataclass(frozen=True)
class Shard:
    features_path: Path
    labels_path: Path
    n: int


@dataclass(frozen=True)
class SplitLoadStats:
    batch_dirs: tuple[str, ...]
    records_scanned: int
    records_in_split: int
    samples: int


@dataclass(frozen=True)
class FeatureCache:
    root: Path
    batch_dirs: tuple[str, ...]
    shards: dict[Split, tuple[Shard, ...]]
    records_scanned: int
    records_in_split: dict[Split, int]
    samples: dict[Split, int]
    reused_batches: tuple[str, ...]
    rebuilt_batches: tuple[str, ...]

    def stats_for(self, split: Split) -> SplitLoadStats:
        return SplitLoadStats(
            batch_dirs=self.batch_dirs,
            records_scanned=self.records_scanned,
            records_in_split=self.records_in_split[split],
            samples=self.samples[split],
        )

    def shards_for(self, split: Split) -> tuple[Shard, ...]:
        return self.shards[split]


def code_digest() -> str:
    h = hashlib.sha256()
    h.update(f"{CACHE_FORMAT_VERSION}\n{FEATURE_SIZE}\n{CUBELESS_OUTPUT_SIZE}\n".encode())
    root = Path(__file__).resolve().parent
    for name in _CODE_FILES:
        h.update(name.encode())
        h.update(b"\0")
        h.update((root / name).read_bytes())
        h.update(b"\0")
    return h.hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(_HASH_BUF)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def cache_root(cache_dir: Path) -> Path:
    return cache_dir / CACHE_NAME


def ensure_feature_cache(
    dumps_root: Path | str,
    cache_dir: Path | str,
    *,
    rebuild: bool = False,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
) -> FeatureCache:
    if chunk_size < 1:
        raise ValueError(f"chunk_size must be >= 1, got {chunk_size}")
    dumps_root = Path(dumps_root)
    root = cache_root(Path(cache_dir))
    batches_dir = root / "batches"
    digest = code_digest()
    meta_path = root / "meta.json"

    root.mkdir(parents=True, exist_ok=True)
    _cleanup_building(batches_dir)

    if rebuild or not _meta_matches(meta_path, digest):
        if batches_dir.exists():
            shutil.rmtree(batches_dir)
            info(f"feature cache wipe → {batches_dir}")
        _write_meta(meta_path, digest)

    batches_dir.mkdir(parents=True, exist_ok=True)

    rec_files = record_files(dumps_root)
    dump_ids = {p.parent.name for p in rec_files}
    if batches_dir.is_dir():
        for child in list(batches_dir.iterdir()):
            if child.is_dir() and child.name not in dump_ids:
                shutil.rmtree(child)
                info(f"feature cache drop missing dump batch {child.name}")

    reused: list[str] = []
    rebuilt: list[str] = []
    for rec_path in rec_files:
        batch_id = rec_path.parent.name
        dest = batches_dir / batch_id
        size = rec_path.stat().st_size
        file_digest = sha256_file(rec_path)
        if _fingerprint_valid(dest, rec_path, size, file_digest):
            reused.append(batch_id)
            continue
        t0 = time.perf_counter()
        _build_batch(rec_path, dest, chunk_size, file_digest, size)
        rebuilt.append(batch_id)
        info(
            f"feature cache rebuild {batch_id} "
            f"sha256={file_digest[:12]} ({time.perf_counter() - t0:.1f}s)"
        )

    batch_dirs = tuple(p.parent.name for p in rec_files)
    shards, records_scanned, records_in_split, samples = _index_batches(batches_dir, batch_dirs)
    if reused and not rebuilt:
        info(f"feature cache hit ({len(reused)} batch(es)) → {root}")
    elif reused:
        info(f"feature cache partial hit: reused {len(reused)}, rebuilt {len(rebuilt)} → {root}")
    elif rebuilt:
        info(f"feature cache miss ({len(rebuilt)} batch(es)) → {root}")
    else:
        info(f"feature cache empty → {root}")

    return FeatureCache(
        root=root,
        batch_dirs=batch_dirs,
        shards=shards,
        records_scanned=records_scanned,
        records_in_split=records_in_split,
        samples=samples,
        reused_batches=tuple(reused),
        rebuilt_batches=tuple(rebuilt),
    )


def _meta_matches(path: Path, digest: str) -> bool:
    if not path.is_file():
        return False
    try:
        meta = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return False
    return (
        meta.get("v") == CACHE_FORMAT_VERSION
        and meta.get("feature_size") == FEATURE_SIZE
        and meta.get("label_size") == CUBELESS_OUTPUT_SIZE
        and meta.get("code_digest") == digest
    )


def _write_meta(path: Path, digest: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "v": CACHE_FORMAT_VERSION,
        "feature_size": FEATURE_SIZE,
        "label_size": CUBELESS_OUTPUT_SIZE,
        "code_digest": digest,
    }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _cleanup_building(batches_dir: Path) -> None:
    if not batches_dir.is_dir():
        return
    for child in list(batches_dir.iterdir()):
        if child.is_dir() and child.name.endswith(".building"):
            shutil.rmtree(child)
            info(f"feature cache drop incomplete {child.name}")


def _fingerprint_valid(dest: Path, rec_path: Path, size: int, digest: str) -> bool:
    fp_path = dest / "fingerprint.json"
    if not fp_path.is_file():
        return False
    try:
        fp = json.loads(fp_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return False
    if (
        fp.get("v") != CACHE_FORMAT_VERSION
        or fp.get("dump_file") != rec_path.name
        or int(fp.get("size", -1)) != size
        or fp.get("sha256") != digest
    ):
        return False
    chunks = fp.get("chunks")
    if not isinstance(chunks, dict):
        return False
    for split in SPLITS:
        entries = chunks.get(split)
        if not isinstance(entries, list):
            return False
        for entry in entries:
            if not isinstance(entry, dict):
                return False
            n = int(entry.get("n", -1))
            feat = dest / str(entry.get("features", ""))
            lab = dest / str(entry.get("labels", ""))
            if n <= 0 or not feat.is_file() or not lab.is_file():
                return False
    return True


def _build_batch(
    rec_path: Path,
    dest: Path,
    chunk_size: int,
    file_digest: str,
    size: int,
) -> None:
    batch_id = rec_path.parent.name
    building = dest.parent / f"{batch_id}.building"
    if building.exists():
        shutil.rmtree(building)
    building.mkdir(parents=True)

    writers = {split: _SplitWriter(building, split, chunk_size) for split in SPLITS}
    records_scanned = 0
    records_in_split = {split: 0 for split in SPLITS}
    try:
        for rec in iter_records_file(rec_path):
            records_scanned += 1
            split = split_name(split_id(rec))
            if split not in records_in_split:
                raise ValueError(f"unknown split {split!r} in record {rec.get('id')!r}")
            records_in_split[split] += 1
            for feat, label in iter_samples_for_record(rec):
                writers[split].append(feat, label)
        chunks = {split: writers[split].close() for split in SPLITS}
        fingerprint: dict[str, Any] = {
            "v": CACHE_FORMAT_VERSION,
            "dump_file": rec_path.name,
            "size": size,
            "sha256": file_digest,
            "records_scanned": records_scanned,
            "records_in_split": records_in_split,
            "chunks": chunks,
        }
        (building / "fingerprint.json").write_text(
            json.dumps(fingerprint, indent=2) + "\n", encoding="utf-8"
        )
        if dest.exists():
            shutil.rmtree(dest)
        building.rename(dest)
    except Exception:
        shutil.rmtree(building, ignore_errors=True)
        raise


def _index_batches(
    batches_dir: Path, batch_dirs: tuple[str, ...]
) -> tuple[dict[Split, tuple[Shard, ...]], int, dict[Split, int], dict[Split, int]]:
    shards: dict[Split, list[Shard]] = {split: [] for split in SPLITS}
    records_scanned = 0
    records_in_split = {split: 0 for split in SPLITS}
    samples = {split: 0 for split in SPLITS}
    for batch_id in batch_dirs:
        fp = json.loads((batches_dir / batch_id / "fingerprint.json").read_text(encoding="utf-8"))
        records_scanned += int(fp["records_scanned"])
        for split in SPLITS:
            records_in_split[split] += int(fp["records_in_split"][split])
            dest = batches_dir / batch_id
            for entry in fp["chunks"][split]:
                n = int(entry["n"])
                shards[split].append(
                    Shard(
                        features_path=dest / str(entry["features"]),
                        labels_path=dest / str(entry["labels"]),
                        n=n,
                    )
                )
                samples[split] += n
    return (
        {split: tuple(shards[split]) for split in SPLITS},
        records_scanned,
        records_in_split,
        samples,
    )


def _release_memmap(mm: np.memmap | None) -> None:
    if mm is None:
        return
    mm.flush()
    mmap_obj = getattr(mm, "_mmap", None)
    if mmap_obj is not None:
        mmap_obj.close()


class _SplitWriter:
    def __init__(self, directory: Path, split: Split, chunk_size: int) -> None:
        self.directory = directory
        self.split = split
        self.chunk_size = chunk_size
        self.chunk_index = 0
        self.row = 0
        self._feat: np.memmap | None = None
        self._label: np.memmap | None = None
        self._feat_path: Path | None = None
        self._label_path: Path | None = None
        self.entries: list[dict[str, Any]] = []

    def _feat_name(self, idx: int) -> str:
        return f"{self.split}-{idx:06d}.features.npy"

    def _label_name(self, idx: int) -> str:
        return f"{self.split}-{idx:06d}.labels.npy"

    def _open_chunk(self) -> None:
        self._feat_path = self.directory / self._feat_name(self.chunk_index)
        self._label_path = self.directory / self._label_name(self.chunk_index)
        self._feat = np.lib.format.open_memmap(
            self._feat_path,
            mode="w+",
            dtype=np.float32,
            shape=(self.chunk_size, FEATURE_SIZE),
        )
        self._label = np.lib.format.open_memmap(
            self._label_path,
            mode="w+",
            dtype=np.float32,
            shape=(self.chunk_size, CUBELESS_OUTPUT_SIZE),
        )
        self.row = 0

    def append(self, feat: np.ndarray, label: np.ndarray) -> None:
        if self._feat is None:
            self._open_chunk()
        assert self._feat is not None and self._label is not None
        self._feat[self.row] = feat
        self._label[self.row] = label
        self.row += 1
        if self.row == self.chunk_size:
            self._commit(self.chunk_size)

    def _shrink(self, path: Path, mm: np.memmap, n: int, dim: int) -> None:
        exact = path.with_name(path.name + ".exact")
        dest = np.lib.format.open_memmap(exact, mode="w+", dtype=np.float32, shape=(n, dim))
        dest[:] = mm[:n]
        _release_memmap(dest)
        _release_memmap(mm)
        path.unlink()
        exact.replace(path)

    def _commit(self, n: int) -> None:
        assert self._feat is not None and self._label is not None
        assert self._feat_path is not None and self._label_path is not None
        feat_name = self._feat_path.name
        label_name = self._label_path.name
        if n != self.chunk_size:
            self._shrink(self._feat_path, self._feat, n, FEATURE_SIZE)
            self._shrink(self._label_path, self._label, n, CUBELESS_OUTPUT_SIZE)
        else:
            _release_memmap(self._feat)
            _release_memmap(self._label)
        self._feat = None
        self._label = None
        self._feat_path = None
        self._label_path = None
        self.entries.append({"features": feat_name, "labels": label_name, "n": n})
        self.chunk_index += 1
        self.row = 0

    def close(self) -> list[dict[str, Any]]:
        if self._feat is not None:
            if self.row == 0:
                _release_memmap(self._feat)
                _release_memmap(self._label)
                if self._feat_path is not None:
                    self._feat_path.unlink(missing_ok=True)
                if self._label_path is not None:
                    self._label_path.unlink(missing_ok=True)
                self._feat = None
                self._label = None
            else:
                self._commit(self.row)
        return self.entries
