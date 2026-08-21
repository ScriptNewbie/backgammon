import json
from pathlib import Path

import numpy as np
import torch

from training_ground import FEATURE_SIZE, featurize

FIXTURE_PATH = Path(__file__).resolve().parent.parent / "fixtures" / "features.json"


def test_torch_import_and_cuda_built() -> None:
    assert torch.__version__.startswith("2.")
    assert torch.backends.cuda.is_built()


def test_golden_feature_vectors() -> None:
    cases = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    assert len(cases) >= 6
    for case in cases:
        got = featurize(case["position"])
        assert got.shape == (FEATURE_SIZE,)
        assert got.dtype == np.float32
        expected = np.asarray(case["vector"], dtype=np.float32)
        assert expected.shape == (FEATURE_SIZE,)
        np.testing.assert_allclose(got, expected, atol=1e-6, err_msg=case["id"])
