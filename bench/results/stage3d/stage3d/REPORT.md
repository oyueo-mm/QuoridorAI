# stage3d

Stage 3-D: exact E6 evaluation optimisations (fast vs reference implementation), C1 search, 300 ms.

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

## C-D-300

Confirmation SPRT (new openings): fast E6 evaluation vs stage 3-C implementation, 300 ms

- Completed 1062 / 1200 scheduled games · config `523358e966c9d8e7` · budget equal-time
- **SPRT: H1 accepted — promote · LLR 2.98 in [-2.94, 2.94] · 497 pairs (LL 74 / split 315 / WW 108) · pair score 0.534 (95% CI 0.508–0.561) · Elo +24 (+5 … +42) · H0: Elo=0 vs H1: Elo=30, α=0.05, β=0.05**
- Replayed suspect games: 1 · still suspect after 3 attempts: 0
- Machine CPU busy during games: mean 63%, max 100%
- Decisive 1037; halted: repetition 25, max plies 0, game time 0, user 0
- Distinct start positions 532 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms) [fast eval]) win rate: 53% (553/1037, 95% CI 50%–56%)** · Elo(A−B) +23 (95% CI +2 … +44, n=1037)
- Pair score of A (unit = opening pair, halt-free pairs): 0.532 (95% CI 0.505–0.558, n=507) · sweeps A 108 / B 76, split 323, with halt 23
- A as first: 52% (270/517, 95% CI 48%–56%) · A as second: 54% (283/520, 95% CI 50%–59%) · first mover overall: 49% (507/1037, 95% CI 46%–52%)
- Plies mean / median: 67.4 / 69.0 · games with a repeated position 46 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (300 ms) [fast eval] (A) | Alpha-Beta (300 ms) [reference eval] (B) |
|---|---:|---:|
| Wins (as first / as second) | 553 (270/283) | 484 (237/247) |
| Decision ms mean / median / P95 / max | 242 / 301 / 303 / 737 | 248 / 301 / 305 / 744 |
| Nodes per move (mean) · nodes/s | 13,106 · 54,243 | 9,231 · 37,237 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 7.94 / 6.0 | 7.49 / 6.0 |
| TT hit rate · cutoffs per move | 74.2% · 3,109 | 74.5% · 2,147 |
| Last iteration timed out · proven result | 77.3% · 22.2% | 79.1% · 20.7% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 22.6% · 7.63 | 21.5% · 7.25 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 8.0 · 14/22/33 | 9.0 · 14/23/37 |
| Walls left at end (mean) | 1.39 | 1.77 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.30 · 415 · 60 | 2.26 · 379 · 90 |
| Pawn moves away from goal · backtracks | 1871 · 2594 | 1956 · 2534 |
| Missed win-in-1 / available | 0 / 553 | 0 / 484 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 484 | 0 · 553 |

- Sessions 4 · commits 132250d441 · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0 · power ac

