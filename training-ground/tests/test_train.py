from pathlib import Path

import torch

from helpers import checker_record, game_id_for, write_batch
from training_ground.train import main


def test_train_one_epoch_writes_checkpoint(tmp_path: Path) -> None:
    dumps = tmp_path / "dumps"
    write_batch(
        dumps,
        [
            checker_record(game_id_for("train"), "t1", 0.55),
            checker_record(game_id_for("val"), "v1", 0.4),
        ],
    )
    ckpt_dir = tmp_path / "checkpoints"
    main(
        [
            "--dumps",
            str(dumps),
            "--epochs",
            "1",
            "--batch-size",
            "2",
            "--hidden-size",
            "8",
            "--layers",
            "1",
            "--checkpoint-dir",
            str(ckpt_dir),
            "--cache-dir",
            str(tmp_path / "cache"),
            "--seed",
            "1",
        ]
    )
    best = ckpt_dir / "best.pt"
    assert best.is_file()
    ckpt = torch.load(best, map_location="cpu", weights_only=False)
    assert ckpt["epoch"] == 1
    assert ckpt["hidden_size"] == 8
    assert ckpt["layers"] == 1
    assert "model" in ckpt
