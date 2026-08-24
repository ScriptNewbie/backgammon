from __future__ import annotations

import gzip
import json
from pathlib import Path
from typing import Any

from training_ground.split import split_name


def game_id_for(split: str) -> str:
    i = 0
    while True:
        gid = f"split-{split}-{i}"
        if split_name(gid) == split:
            return gid
        i += 1


def opening_position() -> dict[str, Any]:
    return {
        "points": [-2, 0, 0, 0, 0, 5, 0, 3, 0, 0, 0, -5, 5, 0, 0, 0, -3, 0, -5, 0, 0, 0, 0, 2],
        "bar": {"p1": 0, "p2": 0},
        "off": {"p1": 0, "p2": 0},
        "onRoll": "p1",
        "dice": [3, 1],
        "cube": {
            "value": 1,
            "owner": "centered",
            "mayDouble": {"p1": False, "p2": False},
        },
        "match": None,
    }


def cubeless(win: float = 0.5) -> dict[str, Any]:
    return {
        "equity": 0.0,
        "win": win,
        "gammon": 0.0,
        "backgammon": 0.0,
        "loseGammon": 0.0,
        "loseBackgammon": 0.0,
    }


def checker_record(game_id: str, record_id: str, win: float) -> dict[str, Any]:
    steps = [{"from": 8, "to": 5}, {"from": 6, "to": 5}]
    return {
        "v": 1,
        "id": record_id,
        "gameId": game_id,
        "ply": 0,
        "decision": "checker",
        "players": {"p1": "infallible", "p2": "infallible"},
        "chosen": {"steps": steps},
        "position": opening_position(),
        "eval": None,
        "moves": [
            {
                "steps": steps,
                "eval": {
                    "cubeless": cubeless(win),
                    "cubefulEquity": 0.0,
                    "cubeAction": None,
                    "source": "bgweb-api",
                },
            }
        ],
        "xgid": None,
    }


def cube_record(game_id: str) -> dict[str, Any]:
    steps = [{"from": 8, "to": 5}, {"from": 6, "to": 5}]
    return {
        "v": 1,
        "id": "cube-row",
        "gameId": game_id,
        "ply": 0,
        "decision": "cube",
        "players": {"p1": "midwit", "p2": "midwit"},
        "chosen": {"action": "no-double"},
        "position": opening_position(),
        "eval": None,
        "moves": [
            {
                "steps": steps,
                "eval": {
                    "cubeless": cubeless(0.9),
                    "cubefulEquity": 0.0,
                    "cubeAction": None,
                    "source": "heuristic",
                },
            }
        ],
        "xgid": "ignored",
    }


def write_batch(root: Path, records: list[dict[str, Any]], *, gzipped: bool = True) -> None:
    batch = root / "2026-08-22T000000Z-bgweb-api"
    batch.mkdir(parents=True)
    dest = batch / ("records.jsonl.gz" if gzipped else "records.jsonl")
    payload = "".join(json.dumps(r, separators=(",", ":")) + "\n" for r in records)
    if gzipped:
        dest.write_bytes(gzip.compress(payload.encode("utf-8")))
    else:
        dest.write_text(payload, encoding="utf-8")
