from pathlib import Path

import numpy as np
import onnx
import torch
from torch import nn

from training_ground import (
    CUBELESS_OUTPUT_SIZE,
    FEATURE_SIZE,
    CubelessNet,
    export_fast_onnx,
    export_onnx_and_pte,
)


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


def test_export_fast_onnx_dynamic_batch_matches_torch(tmp_path: Path) -> None:
    import onnxruntime as ort

    torch.manual_seed(0)
    model = CubelessNet(hidden_size=16, layers=2).eval()
    path = export_fast_onnx(model, tmp_path / "cubeless")
    assert path == tmp_path / "cubeless-fast.onnx"
    _assert_single_file_onnx(path)
    # Batch-1 artifacts are not written by the fast export.
    assert not (tmp_path / "cubeless.onnx").exists()
    assert not (tmp_path / "cubeless.pte").exists()

    graph = onnx.load(path).graph
    in_dims = graph.input[0].type.tensor_type.shape.dim
    assert graph.input[0].name == "features"
    assert graph.output[0].name == "cubeless"
    assert in_dims[0].dim_param != "" and in_dims[0].dim_value == 0
    assert in_dims[1].dim_value == FEATURE_SIZE

    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    for n in (1, 7, 513):
        x = torch.rand(n, FEATURE_SIZE, dtype=torch.float32)
        (got,) = session.run(["cubeless"], {"features": x.numpy()})
        assert got.shape == (n, CUBELESS_OUTPUT_SIZE)
        with torch.no_grad():
            want = model(x).numpy()
        np.testing.assert_allclose(got, want, atol=1e-5)
