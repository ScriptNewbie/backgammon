import torch

from training_ground import CUBELESS_OUTPUT_SIZE, FEATURE_SIZE, CubelessNet


def test_cubeless_net_output_shape_and_range() -> None:
    model = CubelessNet(hidden_size=16, layers=2)
    model.eval()
    x = torch.randn(4, FEATURE_SIZE, dtype=torch.float32)
    with torch.no_grad():
        y = model(x)
    assert y.shape == (4, CUBELESS_OUTPUT_SIZE)
    assert torch.all(y >= 0) and torch.all(y <= 1)
