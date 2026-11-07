from typing import Any

from training_ground.board import apply_steps, result_position
from training_ground.cubeless import CUBELESS_FIELDS, CUBELESS_OUTPUT_SIZE
from training_ground.features import FEATURE_SIZE, featurize
from training_ground.model import CubelessNet
from training_ground.split import game_bucket, split_name

__all__ = [
    "CUBELESS_FIELDS",
    "CUBELESS_OUTPUT_SIZE",
    "CubelessNet",
    "FEATURE_SIZE",
    "apply_steps",
    "export_fast_onnx",
    "export_onnx_and_pte",
    "featurize",
    "game_bucket",
    "result_position",
    "split_name",
]

_LAZY_EXPORTS = ("export_fast_onnx", "export_onnx_and_pte")


def __getattr__(name: str) -> Any:
    # Export helpers load on first use, so `python -m training_ground.export` does not import the
    # module twice (package import, then __main__) and importing the package skips torch.export.
    if name in _LAZY_EXPORTS:
        from training_ground import export

        return getattr(export, name)
    raise AttributeError(f"module 'training_ground' has no attribute {name!r}")
