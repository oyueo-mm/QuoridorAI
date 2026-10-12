# Search benchmark

- Date: 2026-10-12 · Node v24.19.0 · CPU: Intel(R) Core(TM) Ultra 7 256V
- Evaluation: distance race, weights `{"selfDistance":1,"opponentDistance":1,"wallDifference":1,"tempo":0.5}`
- Node counts include every iteration of iterative deepening (depth 1..d). Timings are single runs (ms).

## 1. Legal wall generation (engine optimisation)

| Implementation | µs / position | Speed-up |
|---|---:|---:|
| Brute force (BFS per wall) | 454.6 | 1.0× |
| Path-cut shortcut | 93.8 | 4.8× |

160 positions from BFS self-play; both implementations return identical lists (unit-tested).

## 2. Minimax vs Alpha-Beta (same depth, same evaluation, wall filter: opponent-path)

### opening (after e2 e8)

| Depth | Minimax nodes | Alpha-Beta nodes | +ordering nodes | +ordering+TT nodes | Minimax ms | Alpha-Beta ms | +ordering ms | +ordering+TT ms | Same score |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | 19 | 19 | 19 | 19 | 2 | 1 | 1 | 1 | ✓ |
| 2 | 372 | 75 | 72 | 72 | 6 | 4 | 4 | 3 | ✓ |
| 3 | 6,845 | 594 | 525 | 485 | 89 | 13 | 12 | 13 | ✓ |
| 4 | 126,742 | 1,865 | 1,462 | 1,337 | 1,520 | 38 | 37 | 32 | ✓ |
| 5 | — | 11,880 | 8,173 | 6,323 | — | 177 | 135 | 115 | ✓ |

### early (seed 3)

| Depth | Minimax nodes | Alpha-Beta nodes | +ordering nodes | +ordering+TT nodes | Minimax ms | Alpha-Beta ms | +ordering ms | +ordering+TT ms | Same score |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | 20 | 20 | 20 | 20 | 1 | 1 | 0 | 0 | ✓ |
| 2 | 411 | 75 | 75 | 75 | 6 | 5 | 4 | 4 | ✓ |
| 3 | 7,956 | 485 | 522 | 499 | 109 | 14 | 14 | 14 | ✓ |
| 4 | 153,662 | 1,515 | 1,634 | 1,547 | 1,968 | 35 | 40 | 38 | ✓ |
| 5 | — | 9,656 | 9,701 | 7,585 | — | 154 | 170 | 161 | ✓ |

### middlegame A

| Depth | Minimax nodes | Alpha-Beta nodes | +ordering nodes | +ordering+TT nodes | Minimax ms | Alpha-Beta ms | +ordering ms | +ordering+TT ms | Same score |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | 7 | 7 | 7 | 7 | 0 | 0 | 0 | 0 | ✓ |
| 2 | 60 | 36 | 33 | 33 | 1 | 0 | 0 | 0 | ✓ |
| 3 | 375 | 143 | 75 | 69 | 2 | 1 | 0 | 0 | ✓ |
| 4 | 2,785 | 465 | 178 | 166 | 13 | 3 | 1 | 1 | ✓ |
| 5 | — | 1,651 | 360 | 314 | — | 10 | 3 | 3 | ✓ |

### middlegame B

| Depth | Minimax nodes | Alpha-Beta nodes | +ordering nodes | +ordering+TT nodes | Minimax ms | Alpha-Beta ms | +ordering ms | +ordering+TT ms | Same score |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | 10 | 10 | 10 | 10 | 0 | 0 | 0 | 0 | ✓ |
| 2 | 169 | 124 | 53 | 53 | 2 | 1 | 1 | 1 | ✓ |
| 3 | 1,755 | 582 | 187 | 187 | 12 | 7 | 4 | 3 | ✓ |
| 4 | 26,201 | 3,102 | 710 | 728 | 252 | 30 | 13 | 13 | ✓ |
| 5 | — | 11,482 | 2,376 | 1,940 | — | 116 | 33 | 28 | ✓ |

## 3. Search implementation optimisations (Alpha-Beta + ordering + TT, depth 5)

| Position | Eager legality, full eval | + incremental eval | + lazy legality (default) | Nodes |
|---|---:|---:|---:|---:|
| opening (after e2 e8) | 172 ms | 162 ms | 105 ms | 6,323 |
| early (seed 3) | 236 ms | 222 ms | 164 ms | 7,585 |
| middlegame A | 2 ms | 3 ms | 2 ms | 314 |
| middlegame B | 39 ms | 42 ms | 26 ms | 1,940 |

All three variants visit exactly the same nodes and return the same result (unit-tested).

### Static-evaluation ordering threshold (depth 6)

| Position | off | remaining depth ≥ 2 | ≥ 3 (default) |
|---|---:|---:|---:|
| opening (after e2 e8) | 31,863 nodes / 548 ms | 14,171 nodes / 394 ms | 15,592 nodes / 302 ms |
| early (seed 3) | 25,546 nodes / 426 ms | 20,851 nodes / 616 ms | 21,419 nodes / 455 ms |
| middlegame A | 1,028 nodes / 6 ms | 948 nodes / 9 ms | 1,060 nodes / 8 ms |
| middlegame B | 8,276 nodes / 102 ms | 5,996 nodes / 124 ms | 6,572 nodes / 99 ms |

## 4. Depth reached under a time limit (Alpha-Beta defaults, max depth 12)

| Position | 250 ms | 500 ms | 1000 ms | 2000 ms |
|---|---:|---:|---:|---:|
| opening (after e2 e8) | depth 5, 250 ms | depth 6, 500 ms | depth 6, 1,001 ms | depth 7, 2,001 ms |
| early (seed 3) | depth 5, 251 ms | depth 6, 501 ms | depth 6, 1,001 ms | depth 7, 2,001 ms |
| middlegame A | depth 9, 250 ms | depth 10, 500 ms | depth 10, 1,001 ms | depth 11, 2,001 ms |
| middlegame B | depth 6, 251 ms | depth 7, 502 ms | depth 7, 1,000 ms | depth 8, 2,000 ms |

The interrupted iteration is discarded; the move comes from the last completed depth.

## 5. Games against the BFS AI

6 openings × 2 seats = 12 games per row (both agents deterministic). Max 300 plies.

| Minimax setting | W | L | Halted | Avg ms per Minimax move | Avg plies |
|---|---:|---:|---:|---:|---:|
| depth 1 | 0 | 12 | 0 | 0.2 | 21.8 |
| depth 2 | 7 | 5 | 0 | 0.7 | 73.1 |
| depth 3 | 11 | 1 | 0 | 2.3 | 83.6 |
| depth 4 | 11 | 1 | 0 | 6.8 | 75.8 |
| default (depth 5, 2000 ms) | 11 | 1 | 0 | 32.7 | 55.8 |
| depth 3, wall value 0.4 (before tuning) | 3 | 9 | 0 | 3.0 | 81.4 |
| depth 4, wall value 0.4 (before tuning) | 3 | 9 | 0 | 7.4 | 75.4 |

