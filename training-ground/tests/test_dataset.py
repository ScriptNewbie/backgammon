from pathlib import Path

import numpy as np
import pytest
import torch

from helpers import checker_record, cube_record, game_id_for, opening_position, write_batch
from training_ground.board import result_position
from training_ground.cubeless import CUBELESS_OUTPUT_SIZE, cubeless_equity, cubeless_vector
from training_ground.dataset import CubelessDumpDataset
from training_ground.features import FEATURE_SIZE, featurize


def test_cubeless_vector_order_and_equity() -> None:
    vec = cubeless_vector(
        {
            "win": 0.6,
            "gammon": 0.2,
            "backgammon": 0.05,
            "loseGammon": 0.1,
            "loseBackgammon": 0.02,
        }
    )
    assert vec.shape == (CUBELESS_OUTPUT_SIZE,)
    np.testing.assert_allclose(vec, [0.6, 0.2, 0.05, 0.1, 0.02])
    expected = (0.6 + 0.2 + 0.05) - ((1.0 - 0.6) + 0.1 + 0.02)
    got = float(cubeless_equity(torch.tensor(vec)))
    assert got == pytest.approx(expected)


def test_dataset_skips_cube_and_splits_by_game(tmp_path: Path) -> None:
    train_id = game_id_for("train")
    val_id = game_id_for("val")
    write_batch(
        tmp_path,
        [
            checker_record(train_id, "t1", 0.55),
            cube_record(train_id),
            checker_record(val_id, "v1", 0.4),
        ],
    )
    train = CubelessDumpDataset(tmp_path, "train")
    val = CubelessDumpDataset(tmp_path, "val")
    test = CubelessDumpDataset(tmp_path, "test")
    assert len(train) == 1
    assert len(val) == 1
    assert len(test) == 0

    feat, label = train[0]
    expected_pos = result_position(
        opening_position(), [{"from": 8, "to": 5}, {"from": 6, "to": 5}]
    )
    np.testing.assert_allclose(feat.numpy(), featurize(expected_pos), atol=1e-6)
    np.testing.assert_allclose(label.numpy(), [0.55, 0.0, 0.0, 0.0, 0.0], atol=1e-6)
    assert feat.shape == (FEATURE_SIZE,)
    np.testing.assert_allclose(val[0][1].numpy(), [0.4, 0.0, 0.0, 0.0, 0.0], atol=1e-6)


def test_dataset_splits_matchId_only_record(tmp_path: Path) -> None:
    train_id = game_id_for("train")
    rec = checker_record(train_id, "legacy-match", 0.55)
    rec.pop("gameId")
    rec["matchId"] = train_id
    write_batch(tmp_path, [rec])
    train = CubelessDumpDataset(tmp_path, "train")
    assert len(train) == 1
    np.testing.assert_allclose(train[0][1].numpy(), [0.55, 0.0, 0.0, 0.0, 0.0], atol=1e-6)


def test_dataset_reads_uncompressed_jsonl(tmp_path: Path) -> None:
    write_batch(
        tmp_path,
        [checker_record(game_id_for("train"), "example-opening-31", 0.5)],
        gzipped=False,
    )
    ds = CubelessDumpDataset(tmp_path, "train")
    assert len(ds) == 1
    assert ds[0][0].shape == (FEATURE_SIZE,)
    assert ds[0][1].shape == (CUBELESS_OUTPUT_SIZE,)
