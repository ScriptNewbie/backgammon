from __future__ import annotations

from pathlib import Path

import torch
from torch.export import export as torch_export

from training_ground.cubeless import CUBELESS_OUTPUT_SIZE
from training_ground.features import FEATURE_SIZE
from training_ground.log import info

__all__ = ["CUBELESS_OUTPUT_SIZE", "export_fast_onnx", "export_onnx_and_pte", "fast_onnx_path"]


def export_onnx_and_pte(
    model: torch.nn.Module,
    example: torch.Tensor,
    dest_stem: Path | str,
) -> tuple[Path, Path]:
    """Write `<stem>.onnx` (ADR 0004) and `<stem>.pte` (ExecuTorch, ADR 0014).

    ONNX weights are stored in the `.onnx` file. Torch 2.13 defaults to a
    sibling `.onnx.data` sidecar (`external_data=True`); this model is far
    under the 2GB protobuf limit, so the engine can load one file.
    """
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
    # Drop a stale sidecar so a previous external-data export cannot linger
    # next to the single-file model.
    sidecar = onnx_path.with_name(f"{onnx_path.name}.data")
    if sidecar.is_file():
        sidecar.unlink()
    torch.onnx.export(
        model,
        (example,),
        str(onnx_path),
        input_names=["features"],
        output_names=["cubeless"],
        opset_version=18,
        external_data=False,
    )
    if sidecar.exists():
        raise RuntimeError(f"ONNX export wrote external data at {sidecar}")
    info(f"  wrote {onnx_path} ({onnx_path.stat().st_size:,} bytes)")

    from executorch.exir import to_edge_transform_and_lower

    info(f"exporting ExecuTorch .pte → {pte_path}")
    aten = torch_export(model, (example,), strict=True)
    et_program = to_edge_transform_and_lower(aten).to_executorch()
    pte_path.write_bytes(bytes(et_program.buffer))
    info(f"  wrote {pte_path} ({pte_path.stat().st_size:,} bytes)")

    return onnx_path, pte_path


def fast_onnx_path(dest_stem: Path | str) -> Path:
    """`checkpoints/cubeless` → `checkpoints/cubeless-fast.onnx` (ADR 0028)."""
    stem = Path(dest_stem)
    return stem.with_name(f"{stem.name}-fast.onnx")


def export_fast_onnx(model: torch.nn.Module, dest_stem: Path | str) -> Path:
    """Write `<stem>-fast.onnx` for game-engine-fast (ADR 0028).

    Same module and weights as `export_onnx_and_pte`, but the batch dimension
    is dynamic: input `features` `[N, 206]`, output `cubeless` `[N, 5]`.
    The batch-1 `<stem>.onnx` / `<stem>.pte` contract is untouched.
    """
    path = fast_onnx_path(dest_stem)
    model = model.eval().cpu()
    # Batch 2, not 1: torch.export specializes a dimension traced as 1.
    example = torch.zeros(2, FEATURE_SIZE, dtype=torch.float32)

    info(f"exporting dynamic-batch ONNX → {path}")
    sidecar = path.with_name(f"{path.name}.data")
    if sidecar.is_file():
        sidecar.unlink()
    torch.onnx.export(
        model,
        (example,),
        str(path),
        input_names=["features"],
        output_names=["cubeless"],
        opset_version=18,
        external_data=False,
        dynamic_shapes=({0: torch.export.Dim("batch")},),
    )
    if sidecar.exists():
        raise RuntimeError(f"ONNX export wrote external data at {sidecar}")
    info(f"  wrote {path} ({path.stat().st_size:,} bytes)")
    return path


def _load_checkpoint_model(checkpoint: Path) -> torch.nn.Module:
    from training_ground.model import CubelessNet

    ckpt = torch.load(checkpoint, map_location="cpu", weights_only=False)
    model = CubelessNet(hidden_size=int(ckpt["hidden_size"]), layers=int(ckpt["layers"]))
    model.load_state_dict(ckpt["model"])
    return model


def main(argv: list[str] | None = None) -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description=(
            "Write <stem>-fast.onnx (dynamic batch, ADR 0028) from a training checkpoint. "
            "Does not touch <stem>.onnx or <stem>.pte."
        )
    )
    parser.add_argument("--checkpoint", type=Path, default=Path("checkpoints/best.pt"))
    parser.add_argument("--stem", type=Path, default=Path("checkpoints/cubeless"))
    args = parser.parse_args(argv)
    info(f"loading checkpoint {args.checkpoint}")
    export_fast_onnx(_load_checkpoint_model(args.checkpoint), args.stem)


if __name__ == "__main__":
    main()
