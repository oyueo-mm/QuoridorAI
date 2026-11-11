## S2-defense-vs-path-300

Wall filter only: AB (path-defense) vs AB (opponent-path), both masked BFS, 300 ms per move

- Completed 200 / 200 scheduled games · config `98730c1b2d0f11b1` · budget equal-time
- Decisive 191; halted: repetition 1, max plies 0, game time 8, user 0
- Distinct start positions 100 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms) [path-defense]) win rate: 38% (72/191, 95% CI 31%–45%)** · Elo(A−B) -87 (95% CI -138 … -37, n=191)
- Pair score of A (unit = opening pair, halt-free pairs): 0.378 (95% CI 0.317–0.438, n=94) · sweeps A 8 / B 31, split 55, with halt 6
- A as first: 41% (39/95, 95% CI 32%–51%) · A as second: 34% (33/96, 95% CI 26%–44%) · first mover overall: 53% (102/191, 95% CI 46%–60%)
- Plies mean / median: 61.5 / 64.5 · games with a repeated position 1 (max 3×) · over-budget moves (>3× time) 10

| Search | Alpha-Beta (300 ms) [path-defense] (A) | Alpha-Beta (300 ms) [opponent-path] (B) |
|---|---:|---:|
| Wins (as first / as second) | 72 (39/33) | 119 (63/56) |
| Decision ms mean / median / P95 / max | 2,656 / 301 / 314 / 5,778,914 | 2,641 / 301 / 314 / 5,779,125 |
| Nodes per move (mean) · nodes/s | 11,419 · 4,299 | 9,404 · 3,561 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 5.95 / 4.0 | 7.09 / 6.0 |
| TT hit rate · cutoffs per move | 54.8% · 1,923 | 56.5% · 2,096 |
| Last iteration timed out · proven result | 81.4% · 18.4% | 79.8% · 19.8% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 22.2% · 6.81 | 25.8% · 7.96 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 10.0 · 15/23/37 | 8.0 · 12/18/27 |
| Walls left at end (mean) | 2.38 | 1.23 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.14 · 160 · 3 | 2.41 · 42 · 6 |
| Pawn moves away from goal · backtracks | 141 · 341 | 234 · 436 |
| Missed win-in-1 / available | 0 / 72 | 0 / 119 |
| Allowed opponent win-in-1: avoidable · forced | 1 · 118 | 0 · 72 |

- Sessions 4 · commits f4b12a6419 · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

