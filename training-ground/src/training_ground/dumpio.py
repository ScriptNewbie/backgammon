from __future__ import annotations

import gzip
import json
from pathlib import Path
from typing import Any, Iterator


def dump_batch_dirs(dumps_root: Path) -> tuple[str, ...]:
    return tuple(p.parent.name for p in record_files(dumps_root))


def record_files(dumps_root: Path) -> list[Path]:
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


def open_jsonl(path: Path) -> Iterator[str]:
    if path.name.endswith(".jsonl.gz") or path.suffix == ".gz":
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            yield from fh
        return
    with path.open("rt", encoding="utf-8") as fh:
        yield from fh


def iter_records_file(path: Path) -> Iterator[dict[str, Any]]:
    for line in open_jsonl(path):
        line = line.strip()
        if not line:
            continue
        rec = json.loads(line)
        if rec.get("v") != 1:
            raise ValueError(f"unsupported dump record v={rec.get('v')!r} in {path}")
        yield rec


def iter_dump_records(dumps_root: Path) -> Iterator[dict[str, Any]]:
    for path in record_files(dumps_root):
        yield from iter_records_file(path)
