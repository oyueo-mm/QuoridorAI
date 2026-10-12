"""AlphaZero-style policy-value network (small residual CNN).

Input:  (B, 11, 9, 9) feature planes in the canonical view (features.py).
Output: policy logits (B, 209) over view-space actions, value (B,) in [-1, 1] from the
        perspective of the player to move.

Only Conv / BatchNorm / ReLU / Linear / tanh are used, so the model exports to ONNX without
custom ops. The legal-action mask is applied outside the network (masked_log_softmax), so the
exported graph stays mask-free and the web side applies the same mask in TypeScript.
"""

from __future__ import annotations

import copy
from dataclasses import asdict, dataclass

import torch
import torch.nn.functional as F
from torch import nn

from .engine import ACTION_SPACE_SIZE, BOARD_SIZE
from .features import FEATURE_VERSION, NUM_FEATURE_PLANES

MODEL_FORMAT = 'qz-resnet-v1'
ILLEGAL_LOGIT = -1e9


@dataclass
class NetConfig:
    channels: int = 64
    blocks: int = 4
    policy_channels: int = 4
    value_channels: int = 2
    value_hidden: int = 64

    def to_dict(self) -> dict:
        return asdict(self)


class ResidualBlock(nn.Module):
    def __init__(self, channels: int):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(channels)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        y = F.relu(self.bn1(self.conv1(x)))
        y = self.bn2(self.conv2(y))
        return F.relu(x + y)


class PolicyValueNet(nn.Module):
    def __init__(self, config: NetConfig | None = None):
        super().__init__()
        self.config = config or NetConfig()
        c = self.config
        cells = BOARD_SIZE * BOARD_SIZE
        self.stem = nn.Sequential(
            nn.Conv2d(NUM_FEATURE_PLANES, c.channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(c.channels),
            nn.ReLU(inplace=True),
        )
        self.blocks = nn.Sequential(*[ResidualBlock(c.channels) for _ in range(c.blocks)])
        self.policy_head = nn.Sequential(
            nn.Conv2d(c.channels, c.policy_channels, 1, bias=False),
            nn.BatchNorm2d(c.policy_channels),
            nn.ReLU(inplace=True),
            nn.Flatten(),
            nn.Linear(c.policy_channels * cells, ACTION_SPACE_SIZE),
        )
        self.value_head = nn.Sequential(
            nn.Conv2d(c.channels, c.value_channels, 1, bias=False),
            nn.BatchNorm2d(c.value_channels),
            nn.ReLU(inplace=True),
            nn.Flatten(),
            nn.Linear(c.value_channels * cells, c.value_hidden),
            nn.ReLU(inplace=True),
            nn.Linear(c.value_hidden, 1),
            nn.Tanh(),
        )

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        h = self.blocks(self.stem(x))
        return self.policy_head(h), self.value_head(h).squeeze(-1)

    def metadata(self) -> dict:
        return {
            'model_format': MODEL_FORMAT,
            'feature_version': FEATURE_VERSION,
            'input_planes': NUM_FEATURE_PLANES,
            'action_space_size': ACTION_SPACE_SIZE,
            'net_config': self.config.to_dict(),
            'parameters': count_parameters(self),
        }


def count_parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters())


def masked_log_softmax(logits: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
    """log π over legal actions only; illegal actions get probability exactly 0.

    A large finite negative (not -inf) keeps gradients and ONNX export NaN-free."""
    return F.log_softmax(logits.masked_fill(~mask, ILLEGAL_LOGIT), dim=-1)


def pick_device(prefer: str | None = None) -> torch.device:
    if prefer:
        return torch.device(prefer)
    return torch.device('cuda' if torch.cuda.is_available() else 'cpu')


def export_onnx(net: nn.Module, path, max_batch: int = 4096) -> None:
    """Writes the network as ONNX (input `planes`, outputs `policy_logits` and `value`, dynamic batch).

    Weights are embedded (one self-contained file). Exports a CPU eval-mode copy, so the training
    network keeps its device and mode.
    Needs the optional packages onnx and onnxscript."""
    model = copy.deepcopy(net).cpu().eval()
    example = torch.zeros(2, NUM_FEATURE_PLANES, BOARD_SIZE, BOARD_SIZE)
    batch = torch.export.Dim('batch', min=1, max=max_batch)
    torch.onnx.export(model, (example,), str(path), input_names=['planes'], output_names=['policy_logits', 'value'], dynamic_shapes=({0: batch},), dynamo=True, external_data=False)
