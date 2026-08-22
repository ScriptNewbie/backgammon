from copy import deepcopy

from training_ground.board import (
    OPENING_POINTS,
    apply_steps,
    assert_fifteen,
    checker_count,
    result_position,
)


def opening(on_roll: str = "p1") -> dict:
    return {
        "points": list(OPENING_POINTS),
        "bar": {"p1": 0, "p2": 0},
        "off": {"p1": 0, "p2": 0},
        "onRoll": on_roll,
        "dice": [3, 1],
        "cube": {
            "value": 1,
            "owner": "centered",
            "mayDouble": {"p1": True, "p2": True},
        },
        "match": {"length": 7, "score": {"p1": 0, "p2": 0}, "crawford": False},
    }


def test_opening_has_fifteen_checkers() -> None:
    pos = opening()
    assert pos["points"] == list(OPENING_POINTS)
    assert_fifteen(pos)
    assert checker_count(pos, "p1") == 15
    assert checker_count(pos, "p2") == 15


def test_p1_opening_31() -> None:
    nxt = apply_steps(opening("p1"), [{"from": 8, "to": 5}, {"from": 6, "to": 5}])
    assert nxt["points"][7] == 2
    assert nxt["points"][5] == 4
    assert nxt["points"][4] == 2
    assert nxt["onRoll"] == "p1"
    assert nxt["dice"] == [3, 1]
    assert_fifteen(nxt)


def test_p2_opening_31() -> None:
    nxt = apply_steps(opening("p2"), [{"from": 17, "to": 20}, {"from": 19, "to": 20}])
    assert nxt["points"][16] == -2
    assert nxt["points"][18] == -4
    assert nxt["points"][19] == -2
    assert nxt["onRoll"] == "p2"
    assert_fifteen(nxt)


def test_hit_sends_blot_to_bar() -> None:
    pos = opening("p1")
    pos["points"][10] = -1
    pos["points"][11] = -4
    nxt = apply_steps(pos, [{"from": 13, "to": 11}])
    assert nxt["points"][10] == 1
    assert nxt["bar"]["p2"] == 1
    assert_fifteen(nxt)


def test_p1_enters_from_the_bar() -> None:
    pos = opening("p1")
    pos["points"][23] = 1
    pos["bar"]["p1"] = 1
    nxt = apply_steps(pos, [{"from": "bar", "to": 22}])
    assert nxt["bar"]["p1"] == 0
    assert nxt["points"][21] == 1
    assert_fifteen(nxt)


def test_p1_bears_off() -> None:
    pos = opening("p1")
    pos["points"] = [0] * 24
    pos["points"][0] = 2
    pos["off"]["p1"] = 13
    pos["points"][18] = -5
    pos["points"][16] = -3
    pos["points"][11] = -5
    pos["off"]["p2"] = 2
    nxt = apply_steps(pos, [{"from": 1, "to": "off"}])
    assert nxt["off"]["p1"] == 14
    assert nxt["points"][0] == 1
    assert_fifteen(nxt)


def test_apply_steps_does_not_mutate_input() -> None:
    pos = opening()
    original = deepcopy(pos)
    apply_steps(pos, [{"from": 8, "to": 5}, {"from": 6, "to": 5}])
    assert pos == original


def test_result_position_flips_stm() -> None:
    pos = opening("p1")
    nxt = result_position(pos, [{"from": 8, "to": 5}, {"from": 6, "to": 5}])
    assert nxt["onRoll"] == "p2"
    assert nxt["dice"] is None
    assert nxt["points"][7] == 2
    assert nxt["points"][5] == 4
    assert nxt["points"][4] == 2
    assert pos["onRoll"] == "p1"
    assert pos["dice"] == [3, 1]
