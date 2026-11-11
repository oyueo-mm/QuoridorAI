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

