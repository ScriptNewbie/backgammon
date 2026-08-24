from __future__ import annotations

from typing import Any, Iterator

import numpy as np

from training_ground.board import result_position
from training_ground.cubeless import cubeless_vector
from training_ground.features import featurize

__all__ = ["iter_samples_for_record", "split_id"]


def split_id(rec: dict[str, Any]) -> str:
    game_id = rec.get("gameId") or rec.get("matchId")
    if not game_id:
        raise ValueError(f"dump record {rec.get('id')!r} missing gameId and matchId")
    return str(game_id)


def iter_samples_for_record(rec: dict[str, Any]) -> Iterator[tuple[np.ndarray, np.ndarray]]:
    if rec.get("decision") != "checker":
        return
    position = rec["position"]
    moves = rec.get("moves") or []
    for i, move in enumerate(moves):
        eval_obj = move.get("eval")
        cubeless = None if eval_obj is None else eval_obj.get("cubeless")
        if cubeless is None:
            raise ValueError(
                f"checker move {i} missing cubeless eval in record {rec.get('id')!r}"
            )
        result = result_position(position, move["steps"])
        yield featurize(result), cubeless_vector(cubeless)
