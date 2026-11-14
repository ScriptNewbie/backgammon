import numpy as np

from training_ground.cubeless import consistent_label


def test_consistent_label_allows_rounding_and_rejects_impossible_plays() -> None:
    assert consistent_label(np.array([0.55, 0.17, 0.01, 0.12, 0.005], dtype=np.float32))
    # gnubg rounding: the gammon loss is 1e-6 above the loss chance.
    assert consistent_label(np.array([0.700001, 0.2, 0.0, 0.3, 0.0], dtype=np.float32))
    # Two of the 11 impossible plays in the 2026-08-24 bgweb-api batch.
    assert not consistent_label(np.array([0.922, 0.499, 0, 0.485, 0.025], dtype=np.float32))
    assert not consistent_label(np.array([1, 0, 0, 0.001, 0], dtype=np.float32))
