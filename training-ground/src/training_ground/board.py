from __future__ import annotations

import copy
from typing import Any, Mapping, Sequence

OPENING_POINTS: tuple[int, ...] = (
    -2,
    0,
    0,
    0,
    0,
    5,
    0,
    3,
    0,
    0,
    0,
    -5,
    5,
    0,
    0,
    0,
    -3,
    0,
    -5,
    0,
    0,
    0,
    0,
    2,
)

StepMapping = Mapping[str, Any]
PositionMapping = Mapping[str, Any]


def opponent(player: str) -> str:
    if player == "p1":
        return "p2"
    if player == "p2":
        return "p1"
    raise ValueError(f"player must be p1 or p2, got {player!r}")


def checker_count(position: PositionMapping, player: str) -> int:
    n = int(position["bar"][player]) + int(position["off"][player])
    for v in position["points"]:
        iv = int(v)
        if player == "p1" and iv > 0:
            n += iv
        if player == "p2" and iv < 0:
            n += -iv
    return n


def assert_fifteen(position: PositionMapping) -> None:
    p1 = checker_count(position, "p1")
    p2 = checker_count(position, "p2")
    if p1 != 15 or p2 != 15:
        raise ValueError(f"checker counts must be 15 (p1={p1} p2={p2})")


def _point_index(point: int) -> int:
    if point < 1 or point > 24:
        raise ValueError(f"invalid point {point}")
    return point - 1


def _remove_checker(position: dict[str, Any], player: str, from_: Any) -> None:
    if from_ == "bar":
        if position["bar"][player] < 1:
            raise ValueError(f"{player} has no checker on the bar")
        position["bar"][player] -= 1
        return
    i = _point_index(int(from_))
    v = int(position["points"][i])
    if player == "p1":
        if v < 1:
            raise ValueError(f"p1 has no checker on point {from_}")
        position["points"][i] = v - 1
    else:
        if v > -1:
            raise ValueError(f"p2 has no checker on point {from_}")
        position["points"][i] = v + 1


def _place_checker(position: dict[str, Any], player: str, to: Any) -> None:
    if to == "off":
        position["off"][player] += 1
        return
    i = _point_index(int(to))
    v = int(position["points"][i])
    opp = opponent(player)
    if player == "p1":
        if v <= -2:
            raise ValueError(f"point {to} is blocked for p1")
        if v == -1:
            position["points"][i] = 0
            position["bar"][opp] += 1
        position["points"][i] += 1
    else:
        if v >= 2:
            raise ValueError(f"point {to} is blocked for p2")
        if v == 1:
            position["points"][i] = 0
            position["bar"][opp] += 1
        position["points"][i] -= 1


def apply_steps(position: PositionMapping, steps: Sequence[StepMapping]) -> dict[str, Any]:
    """Apply teacher steps in order. Hits are implied. Does not flip onRoll."""
    nxt = copy.deepcopy(dict(position))
    nxt["points"] = [int(v) for v in nxt["points"]]
    nxt["bar"] = {k: int(v) for k, v in dict(nxt["bar"]).items()}
    nxt["off"] = {k: int(v) for k, v in dict(nxt["off"]).items()}
    player = nxt["onRoll"]
    for step in steps:
        _remove_checker(nxt, player, step["from"])
        _place_checker(nxt, player, step["to"])
    assert_fifteen(nxt)
    return nxt


def result_position(position: PositionMapping, steps: Sequence[StepMapping]) -> dict[str, Any]:
    """Board after a checker play, with opponent to move (teacher eval STM)."""
    nxt = apply_steps(position, steps)
    nxt["onRoll"] = opponent(nxt["onRoll"])
    nxt["dice"] = None
    return nxt
