# stage1-time

Equal time per move for every search agent. Machine- and load-dependent.

## T300-ab-vs-guided

Alpha-Beta vs Guided MCTS, 300 ms per move

- Completed 200 / 200 scheduled games · config `0c6f5d3f8f4b4a8a` · budget equal-time
- Decisive 199; halted: repetition 1, max plies 0, game time 0, user 0
- Distinct start positions 100 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms)) win rate: 54% (108/199, 95% CI 47%–61%)** · Elo(A−B) +30 (95% CI -19 … +78, n=199)
- Pair score of A (unit = opening pair, halt-free pairs): 0.545 (95% CI 0.479–0.612, n=99) · sweeps A 27 / B 18, split 54, with halt 1
- A as first: 58% (58/100, 95% CI 48%–67%) · A as second: 51% (50/99, 95% CI 41%–60%) · first mover overall: 54% (107/199, 95% CI 47%–61%)
- Plies mean / median: 72.3 / 72.5 · games with a repeated position 2 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (300 ms) (A) | Guided MCTS (300 ms) (B) |
|---|---:|---:|
| Wins (as first / as second) | 108 (58/50) | 91 (49/42) |
| Decision ms mean / median / P95 / max | 242 / 301 / 303 / 409 | 257 / 300 / 301 / 350 |
| Nodes per move (mean) · nodes/s | 11,140 · 46,083 | 1,539 · 5,989 |
| Simulations per move · sims/s | — · — | 1,692 · 6,586 |
| Depth mean / median (AB: completed; MCTS: max tree) | 8.27 / 6.0 | 13.81 / 11.0 |
| TT hit rate · cutoffs per move | 64.0% · 2,484 | — · — |
| Last iteration timed out · proven result | 76.4% · 22.9% | — · 16.6% |
| MCTS top-move visit share · visit entropy (bits) | — · — | 63.3% · 1.52 |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 22.6% · 8.18 | 23.8% · 8.59 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 7.0 · 12/21/36 | 6.0 · 11/18/28 |
| Walls left at end (mean) | 1.08 | 0.66 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.40 · 98 · 9 | 2.31 · 64 · 5 |
| Pawn moves away from goal · backtracks | 214 · 404 | 475 · 598 |
| Missed win-in-1 / available | 0 / 108 | 0 / 91 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 91 | 0 · 108 |

- Sessions 4 · commits dd2c516435 · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

## T300-ab-vs-pure

Alpha-Beta vs Pure MCTS, 300 ms per move

- Completed 100 / 100 scheduled games · config `5115477bb8547b3f` · budget equal-time
- Decisive 96; halted: repetition 4, max plies 0, game time 0, user 0
- Distinct start positions 50 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms)) win rate: 96% (92/96, 95% CI 90%–98%)** · Elo(A−B) +545 (95% CI +377 … +712, n=96)
- Pair score of A (unit = opening pair, halt-free pairs): 0.957 (95% CI 0.915–0.998, n=46) · sweeps A 42 / B 0, split 4, with halt 4
- A as first: 98% (48/49, 95% CI 89%–100%) · A as second: 94% (44/47, 95% CI 83%–98%) · first mover overall: 53% (51/96, 95% CI 43%–63%)
- Plies mean / median: 55.9 / 55.0 · games with a repeated position 7 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (300 ms) (A) | Pure MCTS (300 ms) (B) |
|---|---:|---:|
| Wins (as first / as second) | 92 (48/44) | 4 (3/1) |
| Decision ms mean / median / P95 / max | 265 / 302 / 322 / 559 | 282 / 302 / 324 / 621 |
| Nodes per move (mean) · nodes/s | 4,683 · 17,648 | 231 · 818 |
| Simulations per move · sims/s | — · — | 230 · 814 |
| Depth mean / median (AB: completed; MCTS: max tree) | 5.53 / 5.0 | 3.44 / 3.0 |
| TT hit rate · cutoffs per move | 55.9% · 953 | — · — |
| Last iteration timed out · proven result | 83.8% · 16.0% | — · 8.5% |
| MCTS top-move visit share · visit entropy (bits) | — · — | 31.5% · 2.42 |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 25.0% · 7.03 | 26.8% · 7.43 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 9.0 · 14/21/30 | 3.0 · 9/16/25 |
| Walls left at end (mean) | 2.26 | 1.86 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.62 · 39 · 1 | 1.52 · 124 · 25 |
| Pawn moves away from goal · backtracks | 113 · 137 | 268 · 424 |
| Missed win-in-1 / available | 0 / 92 | 0 / 4 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 4 | 0 · 92 |

- Sessions 4 · commits cfacb2551f · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

## T300-ab-vs-bfs

Alpha-Beta (300 ms) vs BFS

- Completed 100 / 100 scheduled games · config `1734ede2c5f4896d` · budget equal-time
- Decisive 100; halted: repetition 0, max plies 0, game time 0, user 0
- Distinct start positions 50 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms)) win rate: 83% (83/100, 95% CI 74%–89%)** · Elo(A−B) +275 (95% CI +186 … +365, n=100)
- Pair score of A (unit = opening pair, halt-free pairs): 0.830 (95% CI 0.753–0.907, n=50) · sweeps A 35 / B 2, split 13, with halt 0
- A as first: 84% (42/50, 95% CI 71%–92%) · A as second: 82% (41/50, 95% CI 69%–90%) · first mover overall: 51% (51/100, 95% CI 41%–61%)
- Plies mean / median: 62.0 / 66.5 · games with a repeated position 0 (max 1×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (300 ms) (A) | BFS (B) |
|---|---:|---:|
| Wins (as first / as second) | 83 (42/41) | 17 (9/8) |
| Decision ms mean / median / P95 / max | 259 / 302 / 308 / 397 | 7 / 6 / 17 / 80 |
| Nodes per move (mean) · nodes/s | 3,966 · 15,306 | 86 · 11,662 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 6.13 / 5.0 | 1.00 / 1.0 |
| TT hit rate · cutoffs per move | 52.8% · 829 | — · — |
| Last iteration timed out · proven result | 83.0% · 16.8% | — · — |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 28.1% · 8.75 | 18.9% · 5.83 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 8.0 · 12/19/26 | 14.0 · 21/33/45 |
| Walls left at end (mean) | 0.54 | 3.46 |
| Opponent path gain per wall · walls without gain · self-harm walls | 3.08 · 15 · 0 | 2.35 · 8 · 5 |
| Pawn moves away from goal · backtracks | 85 · 262 | 1 · 183 |
| Missed win-in-1 / available | 0 / 83 | 0 / 17 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 17 | 0 · 83 |

- Sessions 4 · commits ba3194882a · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

## T2000-ab-vs-guided

Alpha-Beta vs Guided MCTS, 2 s per move

- Completed 40 / 40 scheduled games · config `eba1a4d4dcf0c48f` · budget equal-time
- Decisive 40; halted: repetition 0, max plies 0, game time 0, user 0
- Distinct start positions 20 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (2000 ms)) win rate: 50% (20/40, 95% CI 35%–65%)** · Elo(A−B) +0 (95% CI -106 … +106, n=40)
- Pair score of A (unit = opening pair, halt-free pairs): 0.500 (95% CI 0.377–0.623, n=20) · sweeps A 3 / B 3, split 14, with halt 0
- A as first: 35% (7/20, 95% CI 18%–57%) · A as second: 65% (13/20, 95% CI 43%–82%) · first mover overall: 35% (14/40, 95% CI 22%–50%)
- Plies mean / median: 75.2 / 77.0 · games with a repeated position 0 (max 1×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (2000 ms) (A) | Guided MCTS (2000 ms) (B) |
|---|---:|---:|
| Wins (as first / as second) | 20 (7/13) | 20 (7/13) |
| Decision ms mean / median / P95 / max | 1,541 / 2,001 / 2,007 / 2,077 | 1,662 / 2,000 / 2,003 / 2,057 |
| Nodes per move (mean) · nodes/s | 36,130 · 23,449 | 5,080 · 3,057 |
| Simulations per move · sims/s | — · — | 5,590 · 3,364 |
| Depth mean / median (AB: completed; MCTS: max tree) | 9.81 / 7.0 | 16.41 / 14.0 |
| TT hit rate · cutoffs per move | 67.6% · 8,158 | — · — |
| Last iteration timed out · proven result | 72.7% · 25.7% | — · 19.2% |
| MCTS top-move visit share · visit entropy (bits) | — · — | 68.0% · 1.34 |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 22.1% · 8.30 | 24.4% · 9.18 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 6.0 · 11/20/35 | 5.0 · 12/20/29 |
| Walls left at end (mean) | 1.10 | 0.23 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.16 · 22 · 4 | 2.21 · 33 · 2 |
| Pawn moves away from goal · backtracks | 70 · 76 | 107 · 132 |
| Missed win-in-1 / available | 0 / 20 | 0 / 20 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 20 | 0 · 20 |

- Sessions 4 · commits ba3194882a · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

## T10000-ab-vs-guided

Alpha-Beta vs Guided MCTS, 10 s per move (smoke-sized sample)

- Completed 8 / 8 scheduled games · config `5fa08edc9ea4c14d` · budget equal-time
- Decisive 8; halted: repetition 0, max plies 0, game time 0, user 0
- Distinct start positions 4 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (10000 ms)) win rate: 38% (3/8, 95% CI 14%–69%)** · Elo(A−B) -89 (95% CI -320 … +142, n=8)
- Pair score of A (unit = opening pair, halt-free pairs): 0.375 (95% CI 0.130–0.620, n=4) · sweeps A 0 / B 1, split 3, with halt 0
- A as first: 25% (1/4, 95% CI 5%–70%) · A as second: 50% (2/4, 95% CI 15%–85%) · first mover overall: 38% (3/8, 95% CI 14%–69%)
- Plies mean / median: 72.4 / 71.5 · games with a repeated position 0 (max 1×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (10000 ms) (A) | Guided MCTS (10000 ms) (B) |
|---|---:|---:|
| Wins (as first / as second) | 3 (1/2) | 5 (2/3) |
| Decision ms mean / median / P95 / max | 7,382 / 10,001 / 10,007 / 10,225 | 7,872 / 10,000 / 10,002 / 10,024 |
| Nodes per move (mean) · nodes/s | 164,495 · 22,285 | 23,425 · 2,976 |
| Simulations per move · sims/s | — · — | 25,082 · 3,186 |
| Depth mean / median (AB: completed; MCTS: max tree) | 11.04 / 9.0 | 20.57 / 20.0 |
| TT hit rate · cutoffs per move | 67.0% · 37,639 | — · — |
| Last iteration timed out · proven result | 70.9% · 29.1% | — · 23.1% |
| MCTS top-move visit share · visit entropy (bits) | — · — | 73.8% · 1.08 |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 21.5% · 7.75 | 22.4% · 8.13 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 3.0 · 7/15/31 | 4.0 · 9/17/32 |
| Walls left at end (mean) | 1.50 | 1.13 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.02 · 5 · 0 | 2.18 · 8 · 0 |
| Pawn moves away from goal · backtracks | 16 · 15 | 21 · 30 |
| Missed win-in-1 / available | 0 / 3 | 0 / 5 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 5 | 0 · 3 |

- Sessions 4 · commits ba3194882a+dirty-src, 73655eb7a7 · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

