from __future__ import annotations

import torch
from torch import nn

from training_ground.cubeless import CUBELESS_OUTPUT_SIZE
from training_ground.features import FEATURE_SIZE


class CubelessNet(nn.Module):
    """Teacher MLP: 206 STM features → 5 cubeless probs (ADR 0015)."""

    def __init__(self, hidden_size: int = 512, layers: int = 3) -> None:
        super().__init__()
        if hidden_size < 1:
            raise ValueError(f"hidden_size must be >= 1, got {hidden_size}")
        if layers < 1:
            raise ValueError(f"layers must be >= 1, got {layers}")
        blocks: list[nn.Module] = []
        in_dim = FEATURE_SIZE
        for _ in range(layers):
            blocks.append(nn.Linear(in_dim, hidden_size))
            blocks.append(nn.ReLU())
            in_dim = hidden_size
        blocks.append(nn.Linear(in_dim, CUBELESS_OUTPUT_SIZE))
        blocks.append(nn.Sigmoid())
        self.net = nn.Sequential(*blocks)

    def forward(self, features: torch.Tensor) -> torch.Tensor:
        return self.net(features)
