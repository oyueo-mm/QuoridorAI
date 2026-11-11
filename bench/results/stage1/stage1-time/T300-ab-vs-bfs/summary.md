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

