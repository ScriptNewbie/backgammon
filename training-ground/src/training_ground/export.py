from __future__ import annotations

from pathlib import Path

import torch
from torch.export import export as torch_export

from training_ground.cubeless import CUBELESS_OUTPUT_SIZE
from training_ground.features import FEATURE_SIZE
from training_ground.log import info

__all__ = ["CUBELESS_OUTPUT_SIZE", "export_onnx_and_pte"]


def export_onnx_and_pte(
    model: torch.nn.Module,
    example: torch.Tensor,
    dest_stem: Path | str,
) -> tuple[Path, Path]:
    """Write `<stem>.onnx` (ADR 0004) and `<stem>.pte` (ExecuTorch, ADR 0014)."""
    stem = Path(dest_stem)
    onnx_path = stem.with_suffix(".onnx")
    pte_path = stem.with_suffix(".pte")

    if example.ndim != 2 or example.shape[1] != FEATURE_SIZE:
        raise ValueError(
            f"example must have shape (N, {FEATURE_SIZE}), got {tuple(example.shape)}"
        )
    if example.dtype != torch.float32:
        raise ValueError(f"example must be float32, got {example.dtype}")

    model = model.eval().cpu()
    example = example.cpu()

    info(f"exporting ONNX → {onnx_path}")
    torch.onnx.export(
        model,
        (example,),
        str(onnx_path),
        input_names=["features"],
        output_names=["cubeless"],
        opset_version=18,
    )
    info(f"  wrote {onnx_path} ({onnx_path.stat().st_size:,} bytes)")

    from executorch.exir import to_edge_transform_and_lower

    info(f"exporting ExecuTorch .pte → {pte_path}")
    aten = torch_export(model, (example,), strict=True)
    et_program = to_edge_transform_and_lower(aten).to_executorch()
    pte_path.write_bytes(bytes(et_program.buffer))
    info(f"  wrote {pte_path} ({pte_path.stat().st_size:,} bytes)")

    return onnx_path, pte_path
