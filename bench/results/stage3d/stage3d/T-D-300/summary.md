## T-D-300

SPRT: fast E6 evaluation vs stage 3-C implementation, both C1 search, 300 ms

- Completed 199 / 1200 scheduled games · config `252dde84f1bcbc08` · budget equal-time
- **SPRT: H1 accepted — promote · LLR 3.01 in [-2.94, 2.94] · 91 pairs (LL 9 / split 56 / WW 26) · pair score 0.593 (95% CI 0.532–0.654) · Elo +66 (+22 … +111) · H0: Elo=0 vs H1: Elo=30, α=0.05, β=0.05**
- Machine CPU busy during games: mean 63%, max 97%
- Decisive 194; halted: repetition 5, max plies 0, game time 0, user 0
- Distinct start positions 100 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms) [fast eval]) win rate: 60% (116/194, 95% CI 53%–66%)** · Elo(A−B) +69 (95% CI +19 … +119, n=194)
- Pair score of A (unit = opening pair, halt-free pairs): 0.596 (95% CI 0.536–0.656, n=94) · sweeps A 27 / B 9, split 58, with halt 5
- A as first: 57% (56/99, 95% CI 47%–66%) · A as second: 63% (60/95, 95% CI 53%–72%) · first mover overall: 47% (91/194, 95% CI 40%–54%)
- Plies mean / median: 66.9 / 68.0 · games with a repeated position 9 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (300 ms) [fast eval] (A) | Alpha-Beta (300 ms) [reference eval] (B) |
|---|---:|---:|
| Wins (as first / as second) | 116 (56/60) | 78 (35/43) |
| Decision ms mean / median / P95 / max | 247 / 301 / 305 / 388 | 253 / 301 / 308 / 372 |
| Nodes per move (mean) · nodes/s | 9,267 · 37,577 | 6,541 · 25,828 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 7.37 / 6.0 | 6.96 / 6.0 |
| TT hit rate · cutoffs per move | 74.8% · 2,164 | 74.4% · 1,505 |
| Last iteration timed out · proven result | 78.9% · 20.8% | 81.0% · 18.8% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 22.5% · 7.53 | 21.9% · 7.33 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 8.0 · 14/21/33 | 9.0 · 15/23/35 |
| Walls left at end (mean) | 1.59 | 1.79 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.32 · 80 · 9 | 2.28 · 70 · 16 |
| Pawn moves away from goal · backtracks | 308 · 459 | 399 · 564 |
| Missed win-in-1 / available | 0 / 116 | 0 / 78 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 78 | 1 · 115 |

- Sessions 4 · commits 132250d441 · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0 · power ac

