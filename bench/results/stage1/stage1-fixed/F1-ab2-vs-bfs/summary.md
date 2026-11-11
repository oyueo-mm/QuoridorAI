## F1-ab2-vs-bfs

Alpha-Beta depth 2 vs BFS (1-ply heuristic)

- Completed 200 / 200 scheduled games · config `e81f38aead5058d0` · budget fixed
- Decisive 200; halted: repetition 0, max plies 0, game time 0, user 0
- Distinct start positions 100 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (깊이 2)) win rate: 53% (106/200, 95% CI 46%–60%)** · Elo(A−B) +21 (95% CI -27 … +69, n=200)
- Pair score of A (unit = opening pair, halt-free pairs): 0.530 (95% CI 0.458–0.602, n=100) · sweeps A 30 / B 24, split 46, with halt 0
- A as first: 63% (63/100, 95% CI 53%–72%) · A as second: 43% (43/100, 95% CI 34%–53%) · first mover overall: 60% (120/200, 95% CI 53%–67%)
- Plies mean / median: 73.0 / 79.0 · games with a repeated position 0 (max 1×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (깊이 2) (A) | BFS (B) |
|---|---:|---:|
| Wins (as first / as second) | 106 (63/43) | 94 (57/37) |
| Decision ms mean / median / P95 / max | 5 / 2 / 16 / 55 | 4 / 3 / 14 / 48 |
| Nodes per move (mean) · nodes/s | 38 · 8,342 | 62 · 14,103 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 1.98 / 2.0 | 1.00 / 1.0 |
| TT hit rate · cutoffs per move | 0.0% · 8 | — · — |
| Last iteration timed out · proven result | 0.0% · 2.7% | — · — |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 20.9% · 7.64 | 24.1% · 8.81 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 13.5 · 19/30/42 | 12.0 · 17/25/35 |
| Walls left at end (mean) | 1.69 | 0.52 |
| Opponent path gain per wall · walls without gain · self-harm walls | 3.11 · 24 · 1 | 2.84 · 0 · 2 |
| Pawn moves away from goal · backtracks | 9 · 333 | 1 · 445 |
| Missed win-in-1 / available | 0 / 106 | 0 / 94 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 94 | 0 · 106 |

- Sessions 6 · commits 36818c6b7e · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

