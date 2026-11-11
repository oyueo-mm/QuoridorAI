## S7-masked-vs-guided-300

Default AB (masked BFS, opponent-path) vs Guided MCTS (masked BFS), 300 ms per move

- Completed 200 / 200 scheduled games · config `5638a49c4bbb0c16` · budget equal-time
- Decisive 199; halted: repetition 1, max plies 0, game time 0, user 0
- Distinct start positions 100 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms) [masked BFS]) win rate: 60% (120/199, 95% CI 53%–67%)** · Elo(A−B) +73 (95% CI +23 … +122, n=199)
- Pair score of A (unit = opening pair, halt-free pairs): 0.606 (95% CI 0.538–0.674, n=99) · sweeps A 36 / B 15, split 48, with halt 1
- A as first: 58% (57/99, 95% CI 48%–67%) · A as second: 63% (63/100, 95% CI 53%–72%) · first mover overall: 47% (94/199, 95% CI 40%–54%)
- Plies mean / median: 69.0 / 70.0 · games with a repeated position 1 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (300 ms) [masked BFS] (A) | Guided MCTS (300 ms) (B) |
|---|---:|---:|
| Wins (as first / as second) | 120 (57/63) | 79 (37/42) |
| Decision ms mean / median / P95 / max | 259 / 302 / 310 / 392 | 267 / 301 / 304 / 356 |
| Nodes per move (mean) · nodes/s | 3,112 · 12,001 | 347 · 1,297 |
| Simulations per move · sims/s | — · — | 388 · 1,453 |
| Depth mean / median (AB: completed; MCTS: max tree) | 6.69 / 5.0 | 10.36 / 8.0 |
| TT hit rate · cutoffs per move | 60.1% · 677 | — · — |
| Last iteration timed out · proven result | 81.5% · 18.2% | — · 13.6% |
| MCTS top-move visit share · visit entropy (bits) | — · — | 57.5% · 1.75 |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 23.8% · 8.22 | 23.7% · 8.18 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 8.0 · 13/21/32 | 7.0 · 13/21/30 |
| Walls left at end (mean) | 1.11 | 1.15 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.62 · 48 · 6 | 2.32 · 36 · 11 |
| Pawn moves away from goal · backtracks | 168 · 375 | 341 · 481 |
| Missed win-in-1 / available | 0 / 120 | 0 / 79 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 79 | 3 · 117 |

- Sessions 4 · commits fec6ac4f11 · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

