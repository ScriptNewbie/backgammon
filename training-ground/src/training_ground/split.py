from __future__ import annotations

import hashlib

SplitName = str


def match_bucket(match_id: str) -> int:
    digest = hashlib.sha256(match_id.encode("utf-8")).digest()[:8]
    return int.from_bytes(digest, "big") % 100


def split_name(match_id: str) -> SplitName:
    bucket = match_bucket(match_id)
    if bucket <= 89:
        return "train"
    if bucket <= 94:
        return "val"
    return "test"
