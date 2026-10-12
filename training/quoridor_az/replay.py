"""Fixed-capacity replay buffer (ring) with atomic save/load.

Planes are stored as float16 (values are 0/1, k/10 and d/80; the float16 rounding error is
< 2e-4) to keep 100k samples around 300 MB; policies as float32, masks as bool.
value_weight (v2) is 0 for samples that only train the policy (halted games, 'policy-only');
v1 files load with weight 1.
"""

from __future__ import annotations

import os
from pathlib import Path

import numpy as np

from .engine import ACTION_SPACE_SIZE, BOARD_SIZE
from .features import NUM_FEATURE_PLANES
from .selfplay import Sample

REPLAY_FORMAT = 'qz-replay-v2'
READABLE_FORMATS = ('qz-replay-v1', 'qz-replay-v2')


class ReplayBuffer:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.planes = np.zeros((capacity, NUM_FEATURE_PLANES, BOARD_SIZE, BOARD_SIZE), dtype=np.float16)
        self.policy = np.zeros((capacity, ACTION_SPACE_SIZE), dtype=np.float32)
        self.mask = np.zeros((capacity, ACTION_SPACE_SIZE), dtype=bool)
        self.value = np.zeros(capacity, dtype=np.float32)
        self.value_weight = np.ones(capacity, dtype=np.float32)
        self.player = np.zeros(capacity, dtype=np.int8)
        self.size = 0
        self.cursor = 0
        self.total_added = 0
        self.iteration = -1  # training iteration this buffer belongs to (set by the Trainer)

    def __len__(self) -> int:
        return self.size

    def add(self, samples: list[Sample]) -> None:
        for s in samples:
            i = self.cursor
            self.planes[i] = s.planes
            self.policy[i] = s.policy
            self.mask[i] = s.mask
            self.value[i] = s.value
            self.value_weight[i] = s.value_weight
            self.player[i] = s.player
            self.cursor = (self.cursor + 1) % self.capacity
            self.size = min(self.size + 1, self.capacity)
            self.total_added += 1

    def memory_bytes(self) -> int:
        return sum(a.nbytes for a in (self.planes, self.policy, self.mask, self.value, self.value_weight, self.player))

    def sample(self, batch_size: int, rng: np.random.Generator) -> dict[str, np.ndarray]:
        if self.size == 0:
            raise ValueError('replay buffer is empty')
        idx = rng.integers(0, self.size, size=batch_size)
        return {
            'planes': self.planes[idx].astype(np.float32),
            'policy': self.policy[idx],
            'mask': self.mask[idx],
            'value': self.value[idx],
            'value_weight': self.value_weight[idx],
        }

    def save(self, path: str | os.PathLike) -> None:
        """Atomic: writes a temporary file next to `path`, then renames it."""
        path = Path(path)
        tmp = path.with_name(path.name + '.tmp')
        n = self.size
        with open(tmp, 'wb') as f:
            np.savez_compressed(
                f,
                format=np.array(REPLAY_FORMAT),
                capacity=np.array(self.capacity),
                cursor=np.array(self.cursor),
                total_added=np.array(self.total_added),
                planes=self.planes[:n],
                policy=self.policy[:n],
                mask=self.mask[:n],
                value=self.value[:n],
                value_weight=self.value_weight[:n],
                player=self.player[:n],
                iteration=np.array(self.iteration),
            )
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)

    @classmethod
    def load(cls, path: str | os.PathLike, capacity: int | None = None) -> 'ReplayBuffer':
        with np.load(path, allow_pickle=False) as d:
            if str(d['format']) not in READABLE_FORMATS:
                raise ValueError(f"unexpected replay format {d['format']}")
            buf = cls(capacity or int(d['capacity']))
            n = min(len(d['value']), buf.capacity)
            buf.planes[:n] = d['planes'][:n]
            buf.policy[:n] = d['policy'][:n]
            buf.mask[:n] = d['mask'][:n]
            buf.value[:n] = d['value'][:n]
            if 'value_weight' in d:
                buf.value_weight[:n] = d['value_weight'][:n]
            if 'iteration' in d:
                buf.iteration = int(d['iteration'])
            buf.player[:n] = d['player'][:n]
            buf.size = n
            buf.cursor = int(d['cursor']) % buf.capacity if n == buf.capacity else n
            buf.total_added = int(d['total_added'])
        return buf
