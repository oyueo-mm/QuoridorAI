# stage2

Stage-2 A/B: row-mask BFS and the path-defense wall filter, each against the stage-1 Alpha-Beta.

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

## S2-defense-vs-path-300

Wall filter only: AB (path-defense) vs AB (opponent-path), both masked BFS, 300 ms per move

- Completed 200 / 200 scheduled games · config `98730c1b2d0f11b1` · budget equal-time
- Decisive 191; halted: repetition 1, max plies 0, game time 8, user 0
- Distinct start positions 100 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms) [path-defense]) win rate: 38% (72/191, 95% CI 31%–45%)** · Elo(A−B) -87 (95% CI -138 … -37, n=191)
- Pair score of A (unit = opening pair, halt-free pairs): 0.378 (95% CI 0.317–0.438, n=94) · sweeps A 8 / B 31, split 55, with halt 6
- A as first: 41% (39/95, 95% CI 32%–51%) · A as second: 34% (33/96, 95% CI 26%–44%) · first mover overall: 53% (102/191, 95% CI 46%–60%)
- Plies mean / median: 61.5 / 64.5 · games with a repeated position 1 (max 3×) · over-budget moves (>3× time) 10

| Search | Alpha-Beta (300 ms) [path-defense] (A) | Alpha-Beta (300 ms) [opponent-path] (B) |
|---|---:|---:|
| Wins (as first / as second) | 72 (39/33) | 119 (63/56) |
| Decision ms mean / median / P95 / max | 2,656 / 301 / 314 / 5,778,914 | 2,641 / 301 / 314 / 5,779,125 |
| Nodes per move (mean) · nodes/s | 11,419 · 4,299 | 9,404 · 3,561 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 5.95 / 4.0 | 7.09 / 6.0 |
| TT hit rate · cutoffs per move | 54.8% · 1,923 | 56.5% · 2,096 |
| Last iteration timed out · proven result | 81.4% · 18.4% | 79.8% · 19.8% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 22.2% · 6.81 | 25.8% · 7.96 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 10.0 · 15/23/37 | 8.0 · 12/18/27 |
| Walls left at end (mean) | 2.38 | 1.23 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.14 · 160 · 3 | 2.41 · 42 · 6 |
| Pawn moves away from goal · backtracks | 141 · 341 | 234 · 436 |
| Missed win-in-1 / available | 0 / 72 | 0 / 119 |
| Allowed opponent win-in-1: avoidable · forced | 1 · 118 | 0 · 72 |

- Sessions 4 · commits f4b12a6419 · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

## S3-defense-vs-path-d4

Wall filter at equal depth: AB depth 4 path-defense vs opponent-path (fixed budget)

- Completed 200 / 200 scheduled games · config `84a080d5c531d628` · budget fixed
- Decisive 200; halted: repetition 0, max plies 0, game time 0, user 0
- Distinct start positions 100 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (깊이 4) [path-defense]) win rate: 56% (112/200, 95% CI 49%–63%)** · Elo(A−B) +42 (95% CI -6 … +90, n=200)
- Pair score of A (unit = opening pair, halt-free pairs): 0.560 (95% CI 0.513–0.607, n=100) · sweeps A 18 / B 6, split 76, with halt 0
- A as first: 61% (61/100, 95% CI 51%–70%) · A as second: 51% (51/100, 95% CI 41%–61%) · first mover overall: 55% (110/200, 95% CI 48%–62%)
- Plies mean / median: 68.4 / 69.0 · games with a repeated position 0 (max 1×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (깊이 4) [path-defense] (A) | Alpha-Beta (깊이 4) [opponent-path] (B) |
|---|---:|---:|
| Wins (as first / as second) | 112 (61/51) | 88 (49/39) |
| Decision ms mean / median / P95 / max | 47 / 23 / 163 / 331 | 10 / 6 / 29 / 75 |
| Nodes per move (mean) · nodes/s | 2,561 · 54,165 | 509 · 51,388 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 3.90 / 4.0 | 3.91 / 4.0 |
| TT hit rate · cutoffs per move | 30.5% · 524 | 29.1% · 117 |
| Last iteration timed out · proven result | 0.0% · 5.8% | 0.0% · 5.8% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 24.1% · 8.25 | 23.8% · 8.14 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 11.0 · 16/22/30 | 11.0 · 16/23/34 |
| Walls left at end (mean) | 1.00 | 1.11 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.43 · 112 · 10 | 2.33 · 49 · 8 |
| Pawn moves away from goal · backtracks | 158 · 419 | 172 · 408 |
| Missed win-in-1 / available | 0 / 112 | 0 / 88 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 88 | 0 · 112 |

- Sessions 4 · commits d4227c4c0d, fec6ac4f11 · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

## S4-new-vs-stage1-300

Both changes: AB (masked + path-defense) vs stage-1 AB (reference + opponent-path), 300 ms per move

- Completed 15 / 200 scheduled games · config `441dd16c8db4d64f` · budget equal-time
- Decisive 15; halted: repetition 0, max plies 0, game time 0, user 0
- Distinct start positions 9 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms) [stage 2]) win rate: 27% (4/15, 95% CI 11%–52%)** · Elo(A−B) -176 (95% CI -365 … +14, n=15)
- Pair score of A (unit = opening pair, halt-free pairs): 0.167 (95% CI 0.000–0.373, n=6) · sweeps A 0 / B 4, split 2, with halt 0
- A as first: 33% (3/9, 95% CI 12%–65%) · A as second: 17% (1/6, 95% CI 3%–56%) · first mover overall: 53% (8/15, 95% CI 30%–75%)
- Plies mean / median: 63.9 / 67.0 · games with a repeated position 0 (max 1×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (300 ms) [stage 2] (A) | Alpha-Beta (300 ms) [stage 1] (B) |
|---|---:|---:|
| Wins (as first / as second) | 4 (3/1) | 11 (5/6) |
| Decision ms mean / median / P95 / max | 241 / 300 / 302 / 306 | 236 / 301 / 302 / 322 |
| Nodes per move (mean) · nodes/s | 18,499 · 76,728 | 12,320 · 52,144 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 6.85 / 5.0 | 7.85 / 6.0 |
| TT hit rate · cutoffs per move | 54.4% · 2,932 | 57.3% · 2,693 |
| Last iteration timed out · proven result | 77.2% · 22.8% | 74.8% · 25.0% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 24.7% · 7.87 | 25.4% · 8.13 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 9.0 · 16/28/37 | 4.0 · 11/19/31 |
| Walls left at end (mean) | 1.27 | 1.20 |
| Opponent path gain per wall · walls without gain · self-harm walls | 1.98 · 15 · 1 | 2.11 · 12 · 0 |
| Pawn moves away from goal · backtracks | 35 · 49 | 9 · 23 |
| Missed win-in-1 / available | 0 / 4 | 0 / 11 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 11 | 0 · 4 |

- Sessions 4 · commits fec6ac4f11 · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

