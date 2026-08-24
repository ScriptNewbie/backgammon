from __future__ import annotations

import bisect
from collections.abc import Iterator, Sequence
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import Dataset, Sampler

from training_ground.cache import (
    DEFAULT_CHUNK_SIZE,
    FeatureCache,
    Shard,
    Split,
    SplitLoadStats,
    ensure_feature_cache,
)
from training_ground.dumpio import dump_batch_dirs, iter_dump_records

__all__ = [
    "CubelessDumpDataset",
    "ShardShuffleSampler",
    "SplitLoadStats",
    "dump_batch_dirs",
    "ensure_feature_cache",
    "iter_dump_records",
]


class CubelessDumpDataset(Dataset[tuple[torch.Tensor, torch.Tensor]]):
    """Checker-play result positions from a disk-backed featurized cache, one split."""

    def __init__(
        self,
        dumps_root: Path | str,
        split: Split,
        cache_dir: Path | str,
        *,
        cache: FeatureCache | None = None,
        rebuild: bool = False,
        chunk_size: int = DEFAULT_CHUNK_SIZE,
    ) -> None:
        if cache is None:
            cache = ensure_feature_cache(
                dumps_root, cache_dir, rebuild=rebuild, chunk_size=chunk_size
            )
        self.split = split
        self.stats = cache.stats_for(split)
        self._shards: tuple[Shard, ...] = cache.shards_for(split)
        self._starts = [0]
        for shard in self._shards:
            self._starts.append(self._starts[-1] + shard.n)
        self._n = self._starts[-1]
        self._feat_maps: list[np.ndarray] | None = None
        self._label_maps: list[np.ndarray] | None = None

    @property
    def shard_lengths(self) -> tuple[int, ...]:
        return tuple(shard.n for shard in self._shards)

    def __len__(self) -> int:
        return self._n

    def _maps(self) -> tuple[list[np.ndarray], list[np.ndarray]]:
        if self._feat_maps is None:
            self._feat_maps = [
                np.load(shard.features_path, mmap_mode="r") for shard in self._shards
            ]
            self._label_maps = [
                np.load(shard.labels_path, mmap_mode="r") for shard in self._shards
            ]
        assert self._label_maps is not None
        return self._feat_maps, self._label_maps

    def _locate(self, index: int) -> tuple[int, int]:
        if index < 0:
            index += self._n
        if index < 0 or index >= self._n:
            raise IndexError(f"index {index} out of range for split {self.split!r} n={self._n}")
        shard_i = bisect.bisect_right(self._starts, index) - 1
        return shard_i, index - self._starts[shard_i]

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor]:
        shard_i, local = self._locate(int(index))
        feats, labels = self._maps()
        feat = np.array(feats[shard_i][local], dtype=np.float32, copy=True)
        label = np.array(labels[shard_i][local], dtype=np.float32, copy=True)
        return torch.from_numpy(feat), torch.from_numpy(label)


class ShardShuffleSampler(Sampler[int]):
    """Shuffle chunk order, then indices inside each chunk. RAM is O(largest chunk)."""

    def __init__(
        self, shard_lengths: Sequence[int], generator: torch.Generator | None = None
    ) -> None:
        self.shard_lengths = tuple(int(n) for n in shard_lengths)
        self.generator = generator
        starts = [0]
        for n in self.shard_lengths:
            starts.append(starts[-1] + n)
        self._starts = starts
        self._n = starts[-1]

    def __len__(self) -> int:
        return self._n

    def __iter__(self) -> Iterator[int]:
        n_shards = len(self.shard_lengths)
        if n_shards == 0:
            return
        order = torch.randperm(n_shards, generator=self.generator).tolist()
        for shard_i in order:
            n = self.shard_lengths[shard_i]
            if n <= 0:
                continue
            start = self._starts[shard_i]
            local = torch.randperm(n, generator=self.generator).tolist()
            for i in local:
                yield start + i
