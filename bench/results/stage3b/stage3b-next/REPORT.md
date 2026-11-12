# stage3b-next

After 3-B: E6 pilot + SPRT vs adopted E5, and adopted Alpha-Beta vs Guided MCTS (300 ms).

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

## G-E5-vs-guided-300

Adopted Alpha-Beta (E5) vs Guided MCTS, 300 ms per move, 100 pairs

- Completed 200 / 200 scheduled games · config `7cf3e57114d16830` · budget equal-time
- Machine CPU busy during games: mean 54%, max 67%
- Decisive 196; halted: repetition 4, max plies 0, game time 0, user 0
- Distinct start positions 100 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms) [E5 (default)]) win rate: 63% (123/196, 95% CI 56%–69%)** · Elo(A−B) +91 (95% CI +41 … +141, n=196)
- Pair score of A (unit = opening pair, halt-free pairs): 0.635 (95% CI 0.565–0.706, n=96) · sweeps A 40 / B 14, split 42, with halt 4
- A as first: 65% (63/97, 95% CI 55%–74%) · A as second: 61% (60/99, 95% CI 51%–70%) · first mover overall: 52% (102/196, 95% CI 45%–59%)
- Plies mean / median: 66.7 / 69.5 · games with a repeated position 4 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (300 ms) [E5 (default)] (A) | Guided MCTS (300 ms) (B) |
|---|---:|---:|
| Wins (as first / as second) | 123 (63/60) | 73 (39/34) |
| Decision ms mean / median / P95 / max | 254 / 301 / 305 / 436 | 263 / 300 / 302 / 396 |
| Nodes per move (mean) · nodes/s | 8,227 · 32,442 | 836 · 3,184 |
| Simulations per move · sims/s | — · — | 924 · 3,518 |
| Depth mean / median (AB: completed; MCTS: max tree) | 7.12 / 6.0 | 11.89 / 10.0 |
| TT hit rate · cutoffs per move | 57.7% · 1,752 | — · — |
| Last iteration timed out · proven result | 80.9% · 19.1% | — · 14.9% |
| MCTS top-move visit share · visit entropy (bits) | — · — | 60.0% · 1.64 |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 20.2% · 6.74 | 25.1% · 8.36 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 11.0 · 16/26/40 | 6.0 · 11/18/26 |
| Walls left at end (mean) | 2.29 | 0.67 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.87 · 53 · 22 | 2.32 · 33 · 3 |
| Pawn moves away from goal · backtracks | 180 · 353 | 441 · 623 |
| Missed win-in-1 / available | 0 / 123 | 0 / 73 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 73 | 2 · 121 |

- Sessions 4 · commits 1934896f32 · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0 · power ac

