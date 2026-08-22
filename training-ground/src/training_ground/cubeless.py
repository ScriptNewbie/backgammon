from __future__ import annotations

from typing import Any, Mapping

import numpy as np
import torch

CUBELESS_FIELDS: tuple[str, ...] = (
    "win",
    "gammon",
    "backgammon",
    "loseGammon",
    "loseBackgammon",
)
CUBELESS_OUTPUT_SIZE = 5

assert len(CUBELESS_FIELDS) == CUBELESS_OUTPUT_SIZE


def cubeless_vector(cubeless: Mapping[str, Any]) -> np.ndarray:
    return np.array([float(cubeless[name]) for name in CUBELESS_FIELDS], dtype=np.float32)


def cubeless_equity(probs: torch.Tensor) -> torch.Tensor:
    """Derived cubeless money equity from the 5-vector (evaluation.md)."""
    win = probs[..., 0]
    gammon = probs[..., 1]
    backgammon = probs[..., 2]
    lose_gammon = probs[..., 3]
    lose_backgammon = probs[..., 4]
    return (win + gammon + backgammon) - ((1.0 - win) + lose_gammon + lose_backgammon)
