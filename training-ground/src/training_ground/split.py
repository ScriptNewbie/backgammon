from __future__ import annotations

import hashlib

SplitName = str


def game_bucket(game_id: str) -> int:
    digest = hashlib.sha256(game_id.encode("utf-8")).digest()[:8]
    return int.from_bytes(digest, "big") % 100


def split_name(game_id: str) -> SplitName:
    bucket = game_bucket(game_id)
    if bucket <= 89:
        return "train"
    if bucket <= 94:
        return "val"
    return "test"
