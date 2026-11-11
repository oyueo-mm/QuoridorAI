## S1-masked-vs-reference-300

Bitboard BFS only: AB (masked BFS) vs AB (reference BFS), same filter, 300 ms per move

- Completed 200 / 200 scheduled games · config `8be90d5f5f407d0e` · budget equal-time
- Decisive 188; halted: repetition 1, max plies 0, game time 11, user 0
- Distinct start positions 100 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms) [masked BFS]) win rate: 48% (90/188, 95% CI 41%–55%)** · Elo(A−B) -15 (95% CI -64 … +35, n=188)
- Pair score of A (unit = opening pair, halt-free pairs): 0.483 (95% CI 0.424–0.542, n=90) · sweeps A 13 / B 16, split 61, with halt 10
- A as first: 54% (51/95, 95% CI 44%–63%) · A as second: 42% (39/93, 95% CI 32%–52%) · first mover overall: 56% (105/188, 95% CI 49%–63%)
- Plies mean / median: 66.3 / 69.0 · games with a repeated position 1 (max 3×) · over-budget moves (>3× time) 12

| Search | Alpha-Beta (300 ms) [masked BFS] (A) | Alpha-Beta (300 ms) [reference BFS] (B) |
|---|---:|---:|
| Wins (as first / as second) | 90 (51/39) | 98 (54/44) |
| Decision ms mean / median / P95 / max | 1,875 / 301 / 318 / 4,151,174 | 1,531 / 302 / 320 / 4,151,495 |
| Nodes per move (mean) · nodes/s | 5,781 · 3,084 | 4,680 · 3,057 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 6.59 / 5.0 | 6.40 / 5.0 |
| TT hit rate · cutoffs per move | 56.1% · 1,215 | 57.5% · 998 |
| Last iteration timed out · proven result | 81.7% · 18.1% | 81.8% · 17.9% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 24.1% · 7.99 | 23.5% · 7.78 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 8.0 · 12/19/33 | 8.0 · 13/21/33 |
| Walls left at end (mean) | 1.30 | 1.50 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.35 · 62 · 7 | 2.37 · 62 · 9 |
| Pawn moves away from goal · backtracks | 206 · 436 | 180 · 359 |
| Missed win-in-1 / available | 0 / 90 | 0 / 98 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 98 | 0 · 90 |

- Sessions 4 · commits f4b12a6419 · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

