from __future__ import annotations

from typing import Any, Mapping

import numpy as np

FEATURE_SIZE = 206


def _encode_count(n: int, out: np.ndarray, offset: int) -> None:
    out[offset] = 1.0 if n >= 1 else 0.0
    out[offset + 1] = 1.0 if n >= 2 else 0.0
    out[offset + 2] = 1.0 if n >= 3 else 0.0
    out[offset + 3] = (n - 3) / 2.0 if n > 3 else 0.0


def featurize(position: Mapping[str, Any]) -> np.ndarray:
    """Position JSON → length-206 float32 STM vector ([docs/domain/features.md])."""
    points = position["points"]
    on_roll = position["onRoll"]
    if on_roll not in ("p1", "p2"):
        raise ValueError(f"onRoll must be p1 or p2, got {on_roll!r}")

    vec = np.zeros(FEATURE_SIZE, dtype=np.float32)
    stm = on_roll
    opp = "p2" if on_roll == "p1" else "p1"

    for k in range(24):
        if on_roll == "p1":
            json_idx = k
            raw = points[json_idx]
            stm_n = max(int(raw), 0)
            opp_n = max(-int(raw), 0)
        else:
            json_idx = 23 - k
            raw = points[json_idx]
            stm_n = max(-int(raw), 0)
            opp_n = max(int(raw), 0)
        _encode_count(stm_n, vec, k * 4)
        _encode_count(opp_n, vec, 96 + k * 4)

    bar = position["bar"]
    off = position["off"]
    vec[192] = bar[stm] / 2.0
    vec[193] = bar[opp] / 2.0
    vec[194] = off[stm] / 15.0
    vec[195] = off[opp] / 15.0

    # Cube block is fixed to the dead cube every training sample has (ADR 0029).
    # position["cube"] is ignored; 196 and 198-205 stay 0.
    vec[197] = 1.0
    return vec
