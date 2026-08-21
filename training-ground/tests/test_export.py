from pathlib import Path

import torch
from torch import nn

from training_ground import CUBELESS_OUTPUT_SIZE, FEATURE_SIZE, export_onnx_and_pte


def test_export_onnx_and_pte(tmp_path: Path) -> None:
    model = nn.Linear(FEATURE_SIZE, CUBELESS_OUTPUT_SIZE)
    example = torch.zeros(1, FEATURE_SIZE, dtype=torch.float32)
    onnx_path, pte_path = export_onnx_and_pte(model, example, tmp_path / "dummy")
    assert onnx_path.is_file() and onnx_path.stat().st_size > 0
    assert pte_path.is_file() and pte_path.stat().st_size > 0
    assert onnx_path.suffix == ".onnx"
    assert pte_path.suffix == ".pte"
