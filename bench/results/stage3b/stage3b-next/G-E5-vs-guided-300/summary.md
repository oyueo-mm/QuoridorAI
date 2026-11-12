## G-E5-vs-guided-300

Adopted Alpha-Beta (E5) vs Guided MCTS, 300 ms per move, 100 pairs

- Completed 200 / 200 scheduled games · config `7cf3e57114d16830` · budget equal-time
- Machine CPU busy during games: mean 54%, max 67%
- Decisive 196; halted: repetition 4, max plies 0, game time 0, user 0
- Distinct start positions 100 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms) [E5 (default)]) win rate: 63% (123/196, 95% CI 56%–69%)** · Elo(A−B) +91 (95% CI +41 … +141, n=196)
- Pair score of A (unit = opening pair, halt-free pairs): 0.635 (95% CI 0.565–0.706, n=96) · sweeps A 40 / B 14, split 42, with halt 4
- A as first: 65% (63/97, 95% CI 55%–74%) · A as second: 61% (60/99, 95% CI 51%–70%) · first mover overall: 52% (102/196, 95% CI 45%–59%)
- Plies mean / median: 66.7 / 69.5 · games with a repeated position 4 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (300 ms) [E5 (default)] (A) | Guided MCTS (300 ms) (B) |
|---|---:|---:|
| Wins (as first / as second) | 123 (63/60) | 73 (39/34) |
| Decision ms mean / median / P95 / max | 254 / 301 / 305 / 436 | 263 / 300 / 302 / 396 |
| Nodes per move (mean) · nodes/s | 8,227 · 32,442 | 836 · 3,184 |
| Simulations per move · sims/s | — · — | 924 · 3,518 |
| Depth mean / median (AB: completed; MCTS: max tree) | 7.12 / 6.0 | 11.89 / 10.0 |
| TT hit rate · cutoffs per move | 57.7% · 1,752 | — · — |
| Last iteration timed out · proven result | 80.9% · 19.1% | — · 14.9% |
| MCTS top-move visit share · visit entropy (bits) | — · — | 60.0% · 1.64 |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 20.2% · 6.74 | 25.1% · 8.36 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 11.0 · 16/26/40 | 6.0 · 11/18/26 |
| Walls left at end (mean) | 2.29 | 0.67 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.87 · 53 · 22 | 2.32 · 33 · 3 |
| Pawn moves away from goal · backtracks | 180 · 353 | 441 · 623 |
| Missed win-in-1 / available | 0 / 123 | 0 / 73 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 73 | 2 · 121 |

- Sessions 4 · commits 1934896f32 · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0 · power ac

