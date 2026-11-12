## P-E6-300

Pilot (40 pairs): E6 (E5 + E4 term) vs adopted E5, Alpha-Beta 300 ms

- Completed 80 / 80 scheduled games · config `33bbf05ecc9a27b8` · budget equal-time
- Machine CPU busy during games: mean 53%, max 55%
- Decisive 77; halted: repetition 3, max plies 0, game time 0, user 0
- Distinct start positions 40 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms) [E6]) win rate: 51% (39/77, 95% CI 40%–62%)** · Elo(A−B) +5 (95% CI -72 … +81, n=77)
- Pair score of A (unit = opening pair, halt-free pairs): 0.500 (95% CI 0.386–0.614, n=37) · sweeps A 9 / B 9, split 19, with halt 3
- A as first: 46% (18/39, 95% CI 32%–61%) · A as second: 55% (21/38, 95% CI 40%–70%) · first mover overall: 45% (35/77, 95% CI 35%–57%)
- Plies mean / median: 70.8 / 74.0 · games with a repeated position 3 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (300 ms) [E6] (A) | Alpha-Beta (300 ms) [E5 (default)] (B) |
|---|---:|---:|
| Wins (as first / as second) | 39 (18/21) | 38 (17/21) |
| Decision ms mean / median / P95 / max | 250 / 301 / 305 / 316 | 248 / 301 / 303 / 314 |
| Nodes per move (mean) · nodes/s | 6,877 · 27,520 | 12,293 · 49,474 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 7.55 / 6.0 | 8.13 / 7.0 |
| TT hit rate · cutoffs per move | 66.0% · 1,592 | 57.5% · 2,797 |
| Last iteration timed out · proven result | 79.1% · 20.7% | 79.0% · 20.9% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 22.0% · 7.78 | 22.8% · 8.06 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 8.0 · 14/23/38 | 9.5 · 16/23/37 |
| Walls left at end (mean) | 1.33 | 1.04 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.27 · 14 · 1 | 2.30 · 28 · 4 |
| Pawn moves away from goal · backtracks | 90 · 127 | 151 · 224 |
| Missed win-in-1 / available | 0 / 39 | 0 / 38 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 38 | 0 · 39 |

- Sessions 4 · commits 1934896f32 · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0 · power ac

