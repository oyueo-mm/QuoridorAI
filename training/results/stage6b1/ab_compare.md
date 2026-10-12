# 6A vs 6B-1 (CPU, measured 2026-10-12 23:42:24)

Windows-11-10.0.26200-SP0, Python 3.12.10, torch threads 4, median of 3 alternating runs, 935 positions.

| metric | 6A (baseline) | 6B-1 | speed-up |
|---|---:|---:|---:|
| legal_action_indices, first pass, empty caches (µs/position) | 1195.4 | 27.1 | 44.2× |
| legal_action_indices, second pass (µs/position) | 1195.9 | 4.6 | 258.9× |
| encode_state_planes, first pass, empty caches (µs/position) | 384.0 | 19.4 | 19.7× |
| encode_state_planes, second pass (µs/position) | 382.3 | 3.8 | 100.7× |
| MCTS simulations/s (batch 1, CPU network) | 390.9 | 1179.7 | 3.0× |
| self-play seconds per game (32 sims, 2 games) | 8.7 | 3.6 | 2.4× |
| self-play simulations/s | 575.1 | 1381.0 | 2.4× |

Identical results (hash of legal actions / planes / MCTS visit counts / self-play moves): legal_hash=True, planes_hash=True, mcts_hash=True, selfplay_hash=True
