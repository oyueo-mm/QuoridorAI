## F4-ab5-vs-ab4

Depth scaling: Alpha-Beta depth 5 vs depth 4

- Completed 200 / 200 scheduled games · config `5e095016144fe5ea` · budget fixed
- Decisive 199; halted: repetition 1, max plies 0, game time 0, user 0
- Distinct start positions 100 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (깊이 5)) win rate: 61% (122/199, 95% CI 54%–68%)** · Elo(A−B) +80 (95% CI +31 … +129, n=199)
- Pair score of A (unit = opening pair, halt-free pairs): 0.611 (95% CI 0.549–0.673, n=99) · sweeps A 33 / B 11, split 55, with halt 1
- A as first: 68% (67/99, 95% CI 58%–76%) · A as second: 55% (55/100, 95% CI 45%–64%) · first mover overall: 56% (112/199, 95% CI 49%–63%)
- Plies mean / median: 66.3 / 69.0 · games with a repeated position 1 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (깊이 5) (A) | Alpha-Beta (깊이 4) (B) |
|---|---:|---:|
| Wins (as first / as second) | 122 (67/55) | 77 (45/32) |
| Decision ms mean / median / P95 / max | 148 / 76 / 486 / 1,245 | 44 / 29 / 130 / 378 |
| Nodes per move (mean) · nodes/s | 2,663 · 18,015 | 636 · 14,353 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 4.84 / 5.0 | 3.91 / 4.0 |
| TT hit rate · cutoffs per move | 40.3% · 384 | 28.9% · 143 |
| Last iteration timed out · proven result | 0.0% · 7.8% | 0.0% · 6.0% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 25.6% · 8.50 | 21.0% · 6.93 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 8.0 · 12/19/29 | 10.0 · 14/23/36 |
| Walls left at end (mean) | 0.71 | 2.28 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.45 · 53 · 10 | 2.45 · 35 · 12 |
| Pawn moves away from goal · backtracks | 205 · 498 | 191 · 425 |
| Missed win-in-1 / available | 0 / 122 | 0 / 77 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 77 | 0 · 122 |

- Sessions 6 · commits 36818c6b7e · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

