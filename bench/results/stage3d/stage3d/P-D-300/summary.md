## P-D-300

Pilot (40 pairs): fast E6 evaluation vs stage 3-C implementation, both C1 search, 300 ms

- Completed 80 / 80 scheduled games · config `5270e0ed4c8847fc` · budget equal-time
- Machine CPU busy during games: mean 78%, max 100%
- Decisive 77; halted: repetition 3, max plies 0, game time 0, user 0
- Distinct start positions 40 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms) [fast eval]) win rate: 55% (42/77, 95% CI 43%–65%)** · Elo(A−B) +32 (95% CI -46 … +109, n=77)
- Pair score of A (unit = opening pair, halt-free pairs): 0.541 (95% CI 0.445–0.636, n=37) · sweeps A 8 / B 5, split 24, with halt 3
- A as first: 60% (24/40, 95% CI 45%–74%) · A as second: 49% (18/37, 95% CI 33%–64%) · first mover overall: 56% (43/77, 95% CI 45%–66%)
- Plies mean / median: 69.9 / 74.5 · games with a repeated position 4 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (300 ms) [fast eval] (A) | Alpha-Beta (300 ms) [reference eval] (B) |
|---|---:|---:|
| Wins (as first / as second) | 42 (24/18) | 35 (19/16) |
| Decision ms mean / median / P95 / max | 246 / 301 / 304 / 340 | 250 / 301 / 305 / 331 |
| Nodes per move (mean) · nodes/s | 13,662 · 55,565 | 9,570 · 38,205 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 7.71 / 6.0 | 7.26 / 6.0 |
| TT hit rate · cutoffs per move | 72.0% · 3,191 | 72.1% · 2,220 |
| Last iteration timed out · proven result | 79.3% · 20.4% | 80.5% · 19.3% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 22.5% · 7.86 | 21.2% · 7.41 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 8.0 · 14/21/34 | 9.0 · 15/24/42 |
| Walls left at end (mean) | 1.25 | 1.70 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.36 · 40 · 2 | 2.31 · 24 · 3 |
| Pawn moves away from goal · backtracks | 125 · 228 | 141 · 170 |
| Missed win-in-1 / available | 0 / 42 | 0 / 35 |
| Allowed opponent win-in-1: avoidable · forced | 1 · 34 | 0 · 42 |

- Sessions 4 · commits 132250d441 · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0 · power ac

