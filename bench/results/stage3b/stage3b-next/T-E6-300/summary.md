## T-E6-300

SPRT: E6 (E5 + E4 term) vs adopted E5, Alpha-Beta 300 ms

- Completed 179 / 1200 scheduled games · config `e07ff9bbb62b0e8d` · budget equal-time
- **SPRT: H1 accepted — promote · LLR 3.09 in [-2.94, 2.94] · 78 pairs (LL 8 / split 43 / WW 27) · pair score 0.622 (95% CI 0.552–0.691) · Elo +86 (+36 … +140) · H0: Elo=0 vs H1: Elo=30, α=0.05, β=0.05**
- Machine CPU busy during games: mean 61%, max 81%
- Decisive 171; halted: repetition 8, max plies 0, game time 0, user 0
- Distinct start positions 91 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms) [E6]) win rate: 64% (110/171, 95% CI 57%–71%)** · Elo(A−B) +102 (95% CI +48 … +157, n=171)
- Pair score of A (unit = opening pair, halt-free pairs): 0.630 (95% CI 0.561–0.698, n=81) · sweeps A 29 / B 8, split 44, with halt 7
- A as first: 66% (58/88, 95% CI 56%–75%) · A as second: 63% (52/83, 95% CI 52%–72%) · first mover overall: 52% (89/171, 95% CI 45%–59%)
- Plies mean / median: 66.9 / 70.0 · games with a repeated position 8 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (300 ms) [E6] (A) | Alpha-Beta (300 ms) [E5 (default)] (B) |
|---|---:|---:|
| Wins (as first / as second) | 110 (58/52) | 61 (31/30) |
| Decision ms mean / median / P95 / max | 257 / 301 / 309 / 438 | 256 / 301 / 305 / 378 |
| Nodes per move (mean) · nodes/s | 5,369 · 20,884 | 10,135 · 39,656 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 6.60 / 5.0 | 7.25 / 6.0 |
| TT hit rate · cutoffs per move | 62.6% · 1,215 | 54.6% · 2,204 |
| Last iteration timed out · proven result | 81.6% · 18.1% | 81.6% · 18.2% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 22.5% · 7.54 | 22.0% · 7.34 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 9.0 · 14/22/33 | 9.0 · 15/24/39 |
| Walls left at end (mean) | 1.61 | 1.81 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.44 · 32 · 7 | 2.35 · 48 · 15 |
| Pawn moves away from goal · backtracks | 218 · 385 | 318 · 482 |
| Missed win-in-1 / available | 0 / 110 | 0 / 61 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 61 | 0 · 110 |

- Sessions 4 · commits 1934896f32 · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0 · power battery

