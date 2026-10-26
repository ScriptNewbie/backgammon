from pathlib import Path

import onnx
import torch
from torch import nn

from training_ground import CUBELESS_OUTPUT_SIZE, FEATURE_SIZE, CubelessNet, export_onnx_and_pte


def _assert_single_file_onnx(onnx_path: Path) -> None:
    assert onnx_path.is_file() and onnx_path.stat().st_size > 0
    assert not onnx_path.with_name(f"{onnx_path.name}.data").exists()
    model = onnx.load(onnx_path)
    assert len(model.graph.initializer) > 0
    assert all(
        tensor.data_location != onnx.TensorProto.EXTERNAL and len(tensor.raw_data) > 0
        for tensor in model.graph.initializer
    )


def test_export_onnx_and_pte(tmp_path: Path) -> None:
    model = nn.Linear(FEATURE_SIZE, CUBELESS_OUTPUT_SIZE)
    example = torch.zeros(1, FEATURE_SIZE, dtype=torch.float32)
    onnx_path, pte_path = export_onnx_and_pte(model, example, tmp_path / "dummy")
    _assert_single_file_onnx(onnx_path)
    assert pte_path.is_file() and pte_path.stat().st_size > 0
    assert onnx_path.suffix == ".onnx"
    assert pte_path.suffix == ".pte"


def test_export_cubeless_net(tmp_path: Path) -> None:
    model = CubelessNet(hidden_size=8, layers=1)
    example = torch.zeros(1, FEATURE_SIZE, dtype=torch.float32)
    onnx_path, pte_path = export_onnx_and_pte(model, example, tmp_path / "teacher")
    _assert_single_file_onnx(onnx_path)
    assert pte_path.is_file() and pte_path.stat().st_size > 0
