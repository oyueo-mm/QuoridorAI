"""Policy-value training step.

loss = policy_loss + value_weight · value_loss   (+ L2 via the optimizer's weight decay)
  policy_loss = −Σ π · log softmax(masked logits)   (cross-entropy with the MCTS visit target)
  value_loss  = (v − z)²
All terms, the gradient norm and finiteness checks are returned per step.
"""

from __future__ import annotations

import time
from dataclasses import asdict, dataclass

import numpy as np
import torch

from .network import PolicyValueNet, masked_log_softmax


@dataclass
class TrainConfig:
    batch_size: int = 256
    learning_rate: float = 1e-3
    weight_decay: float = 1e-4
    value_weight: float = 1.0
    grad_clip: float = 5.0
    steps_per_iteration: int = 200

    def to_dict(self) -> dict:
        return asdict(self)


def make_optimizer(net: PolicyValueNet, config: TrainConfig) -> torch.optim.Optimizer:
    return torch.optim.AdamW(net.parameters(), lr=config.learning_rate, weight_decay=config.weight_decay)


def to_tensors(batch: dict[str, np.ndarray], device: torch.device) -> dict[str, torch.Tensor]:
    return {
        'planes': torch.from_numpy(batch['planes']).to(device, non_blocking=True),
        'policy': torch.from_numpy(batch['policy']).to(device, non_blocking=True),
        'mask': torch.from_numpy(batch['mask']).to(device, non_blocking=True),
        'value': torch.from_numpy(batch['value']).to(device, non_blocking=True),
    }


def compute_losses(net: PolicyValueNet, t: dict[str, torch.Tensor], value_weight: float) -> dict[str, torch.Tensor]:
    logits, value = net(t['planes'])
    log_p = masked_log_softmax(logits, t['mask'])
    # Targets are zero outside the mask, so masked entries (≈ −1e9) contribute 0 · finite.
    policy_loss = -(t['policy'] * log_p.clamp_min(-1e4)).sum(dim=1).mean()
    value_loss = torch.mean((value - t['value']) ** 2)
    total = policy_loss + value_weight * value_loss
    # Policy entropy of the network (diagnostic only).
    p = log_p.exp()
    entropy = -(p * log_p.clamp_min(-1e4)).sum(dim=1).mean()
    return {'loss': total, 'policy_loss': policy_loss, 'value_loss': value_loss, 'entropy': entropy}


def train_step(net: PolicyValueNet, optimizer: torch.optim.Optimizer, batch: dict[str, np.ndarray], config: TrainConfig, device: torch.device) -> dict[str, float]:
    net.train()
    t0 = time.perf_counter()
    t = to_tensors(batch, device)
    losses = compute_losses(net, t, config.value_weight)
    optimizer.zero_grad(set_to_none=True)
    losses['loss'].backward()
    grad_norm = torch.nn.utils.clip_grad_norm_(net.parameters(), config.grad_clip)
    finite = bool(torch.isfinite(losses['loss']).item() and torch.isfinite(grad_norm).item())
    if finite:
        optimizer.step()
    if device.type == 'cuda':
        torch.cuda.synchronize()
    out = {k: float(v.detach().item()) for k, v in losses.items()}
    out['grad_norm'] = float(grad_norm.item())
    out['finite'] = finite
    out['seconds'] = time.perf_counter() - t0
    return out
