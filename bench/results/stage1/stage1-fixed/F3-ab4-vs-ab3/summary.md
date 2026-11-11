## F3-ab4-vs-ab3

Depth scaling: Alpha-Beta depth 4 vs depth 3

- Completed 200 / 200 scheduled games · config `191d8f087ba1b6b0` · budget fixed
- Decisive 199; halted: repetition 1, max plies 0, game time 0, user 0
- Distinct start positions 100 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (깊이 4)) win rate: 57% (114/199, 95% CI 50%–64%)** · Elo(A−B) +51 (95% CI +2 … +100, n=199)
- Pair score of A (unit = opening pair, halt-free pairs): 0.576 (95% CI 0.512–0.639, n=99) · sweeps A 29 / B 14, split 56, with halt 1
- A as first: 60% (59/99, 95% CI 50%–69%) · A as second: 55% (55/100, 95% CI 45%–64%) · first mover overall: 52% (104/199, 95% CI 45%–59%)
- Plies mean / median: 67.6 / 70.0 · games with a repeated position 1 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (깊이 4) (A) | Alpha-Beta (깊이 3) (B) |
|---|---:|---:|
| Wins (as first / as second) | 114 (59/55) | 85 (45/40) |
| Decision ms mean / median / P95 / max | 36 / 21 / 114 / 298 | 12 / 7 / 39 / 98 |
| Nodes per move (mean) · nodes/s | 576 · 15,861 | 191 · 15,505 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 3.90 / 4.0 | 2.96 / 3.0 |
| TT hit rate · cutoffs per move | 30.0% · 135 | 24.6% · 26 |
| Last iteration timed out · proven result | 0.0% · 5.9% | 0.0% · 4.2% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 25.1% · 8.51 | 20.9% · 7.07 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 11.0 · 15/21/32 | 11.0 · 16/24/36 |
| Walls left at end (mean) | 0.75 | 2.19 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.70 · 23 · 4 | 2.49 · 14 · 6 |
| Pawn moves away from goal · backtracks | 182 · 475 | 76 · 362 |
| Missed win-in-1 / available | 0 / 114 | 0 / 85 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 85 | 0 · 114 |

- Sessions 6 · commits 36818c6b7e · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

