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


# A label whose exclusive outcomes go below this is impossible, not rounded, and is dropped
# (ADR 0036). 6-digit gnubg rounding is up to about 1e-6, plus float32 storage; the 11 broken
# bgweb-api plays are off by 0.001 or more.
LABEL_TOLERANCE = 1e-5


def cubeless_vector(cubeless: Mapping[str, Any]) -> np.ndarray:
    return np.array([float(cubeless[name]) for name in CUBELESS_FIELDS], dtype=np.float32)


def consistent_label(probs: np.ndarray, tol: float = LABEL_TOLERANCE) -> bool:
    """True if every exclusive outcome (single, gammon, backgammon win or loss) of a
    5-prob label is at least `-tol`."""
    win, gammon, backgammon, lose_gammon, lose_backgammon = (float(p) for p in probs)
    outcomes = (
        win - gammon,
        gammon - backgammon,
        backgammon,
        1.0 - win - lose_gammon,
        lose_gammon - lose_backgammon,
        lose_backgammon,
    )
    return min(outcomes) >= -tol


def cubeless_equity(probs: torch.Tensor) -> torch.Tensor:
    """Derived cubeless money equity from the 5-vector (evaluation.md)."""
    win = probs[..., 0]
    gammon = probs[..., 1]
    backgammon = probs[..., 2]
    lose_gammon = probs[..., 3]
    lose_backgammon = probs[..., 4]
    return (win + gammon + backgammon) - ((1.0 - win) + lose_gammon + lose_backgammon)
