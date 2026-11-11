## F2-ab3-vs-ab2

Depth scaling: Alpha-Beta depth 3 vs depth 2

- Completed 200 / 200 scheduled games · config `ca0c6f968a23cad4` · budget fixed
- Decisive 200; halted: repetition 0, max plies 0, game time 0, user 0
- Distinct start positions 100 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (깊이 3)) win rate: 72% (143/200, 95% CI 65%–77%)** · Elo(A−B) +160 (95% CI +107 … +213, n=200)
- Pair score of A (unit = opening pair, halt-free pairs): 0.715 (95% CI 0.652–0.778, n=100) · sweeps A 51 / B 8, split 41, with halt 0
- A as first: 67% (67/100, 95% CI 57%–75%) · A as second: 76% (76/100, 95% CI 67%–83%) · first mover overall: 46% (91/200, 95% CI 39%–52%)
- Plies mean / median: 66.0 / 70.0 · games with a repeated position 0 (max 1×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (깊이 3) (A) | Alpha-Beta (깊이 2) (B) |
|---|---:|---:|
| Wins (as first / as second) | 143 (67/76) | 57 (24/33) |
| Decision ms mean / median / P95 / max | 13 / 7 / 43 / 153 | 3 / 2 / 11 / 84 |
| Nodes per move (mean) · nodes/s | 202 · 16,138 | 39 · 11,547 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 2.94 / 3.0 | 1.99 / 2.0 |
| TT hit rate · cutoffs per move | 25.9% · 25 | 0.0% · 7 |
| Last iteration timed out · proven result | 0.0% · 5.2% | 0.0% · 3.0% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 25.6% · 8.47 | 20.3% · 6.66 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 11.0 · 16/23/30 | 13.0 · 19/32/45 |
| Walls left at end (mean) | 0.80 | 2.61 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.93 · 19 · 2 | 2.77 · 11 · 2 |
| Pawn moves away from goal · backtracks | 25 · 290 | 42 · 316 |
| Missed win-in-1 / available | 0 / 143 | 0 / 57 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 57 | 0 · 143 |

- Sessions 6 · commits 36818c6b7e · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

