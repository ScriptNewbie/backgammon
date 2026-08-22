from __future__ import annotations

import gzip
import json
from pathlib import Path
from typing import Any, Iterator, Literal

import numpy as np
import torch
from torch.utils.data import Dataset

from training_ground.board import result_position
from training_ground.cubeless import CUBELESS_OUTPUT_SIZE, cubeless_vector
from training_ground.features import FEATURE_SIZE, featurize
from training_ground.split import split_name

Split = Literal["train", "val", "test"]


def _record_files(dumps_root: Path) -> list[Path]:
    if not dumps_root.is_dir():
        raise FileNotFoundError(f"dumps root does not exist: {dumps_root}")
    found: list[Path] = []
    for batch in sorted(p for p in dumps_root.iterdir() if p.is_dir()):
        gz = batch / "records.jsonl.gz"
        jsonl = batch / "records.jsonl"
        if gz.is_file():
            found.append(gz)
        elif jsonl.is_file():
            found.append(jsonl)
    return found


def _open_jsonl(path: Path) -> Iterator[str]:
    if path.name.endswith(".jsonl.gz") or path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            yield from fh
        return
    with path.open("rt", encoding="utf-8") as fh:
        yield from fh


def iter_dump_records(dumps_root: Path) -> Iterator[dict[str, Any]]:
    for path in _record_files(dumps_root):
        for line in _open_jsonl(path):
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            if rec.get("v") != 1:
                raise ValueError(f"unsupported dump record v={rec.get('v')!r} in {path}")
            yield rec


def _samples_for_record(rec: dict[str, Any]) -> list[tuple[np.ndarray, np.ndarray]]:
    if rec.get("decision") != "checker":
        return []
    position = rec["position"]
    moves = rec.get("moves") or []
    out: list[tuple[np.ndarray, np.ndarray]] = []
    for i, move in enumerate(moves):
        eval_obj = move.get("eval")
        cubeless = None if eval_obj is None else eval_obj.get("cubeless")
        if cubeless is None:
            raise ValueError(
                f"checker move {i} missing cubeless eval in record {rec.get('id')!r}"
            )
        result = result_position(position, move["steps"])
        out.append((featurize(result), cubeless_vector(cubeless)))
    return out


def load_split_arrays(
    dumps_root: Path, split: Split
) -> tuple[np.ndarray, np.ndarray]:
    features: list[np.ndarray] = []
    labels: list[np.ndarray] = []
    for rec in iter_dump_records(dumps_root):
        if split_name(rec["matchId"]) != split:
            continue
        for feat, label in _samples_for_record(rec):
            features.append(feat)
            labels.append(label)
    if not features:
        return (
            np.zeros((0, FEATURE_SIZE), dtype=np.float32),
            np.zeros((0, CUBELESS_OUTPUT_SIZE), dtype=np.float32),
        )
    return np.stack(features), np.stack(labels)


class CubelessDumpDataset(Dataset[tuple[torch.Tensor, torch.Tensor]]):
    """Checker-play result positions from dump batches, one split."""

    def __init__(self, dumps_root: Path | str, split: Split) -> None:
        features, labels = load_split_arrays(Path(dumps_root), split)
        self.features = torch.from_numpy(features)
        self.labels = torch.from_numpy(labels)

    def __len__(self) -> int:
        return int(self.features.shape[0])

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor]:
        return self.features[index], self.labels[index]
