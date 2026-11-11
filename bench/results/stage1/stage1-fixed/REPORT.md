# stage1-fixed

Fixed search budget (depth / simulations), no time limit. Results are machine-independent.

## F0-bfs-vs-random

Sanity: BFS vs Random

- Completed 40 / 40 scheduled games · config `bc730318763addf3` · budget fixed
- Decisive 40; halted: repetition 0, max plies 0, game time 0, user 0
- Distinct start positions 20 · games duplicating an earlier game move-for-move 0
- **A (BFS) win rate: 100% (40/40, 95% CI 91%–100%)** · Elo(A−B) +∞ (95% CI +407 … +∞, n=40)
- Pair score of A (unit = opening pair, halt-free pairs): 1.000 (95% CI 1.000–1.000, n=20) · sweeps A 20 / B 0, split 0, with halt 0
- A as first: 100% (20/20, 95% CI 84%–100%) · A as second: 100% (20/20, 95% CI 84%–100%) · first mover overall: 50% (20/40, 95% CI 35%–65%)
- Plies mean / median: 19.4 / 17.0 · games with a repeated position 0 (max 1×) · over-budget moves (>3× time) 0

| Search | BFS (A) | Random (B) |
|---|---:|---:|
| Wins (as first / as second) | 40 (20/20) | 0 (0/0) |
| Decision ms mean / median / P95 / max | 4 / 3 / 7 / 44 | 0 / 0 / 0 / 20 |
| Nodes per move (mean) · nodes/s | 102 · 29,008 | — · — |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 1.00 / 1.0 | — / — |
| TT hit rate · cutoffs per move | — · — | — · — |
| Last iteration timed out · proven result | — · — | — · — |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 21.4% · 2.13 | 82.0% · 7.73 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 7.0 · 8/13/19 | 1.0 · 4/7/12 |
| Walls left at end (mean) | 7.23 | 1.63 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.54 · 0 · 0 | 0.06 · 293 · 22 |
| Pawn moves away from goal · backtracks | 0 · 0 | 25 · 24 |
| Missed win-in-1 / available | 0 / 40 | 0 / 0 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 0 | 24 · 16 |

- Sessions 6 · commits 36818c6b7e · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

## F1-ab2-vs-bfs

Alpha-Beta depth 2 vs BFS (1-ply heuristic)

- Completed 200 / 200 scheduled games · config `e81f38aead5058d0` · budget fixed
- Decisive 200; halted: repetition 0, max plies 0, game time 0, user 0
- Distinct start positions 100 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (깊이 2)) win rate: 53% (106/200, 95% CI 46%–60%)** · Elo(A−B) +21 (95% CI -27 … +69, n=200)
- Pair score of A (unit = opening pair, halt-free pairs): 0.530 (95% CI 0.458–0.602, n=100) · sweeps A 30 / B 24, split 46, with halt 0
- A as first: 63% (63/100, 95% CI 53%–72%) · A as second: 43% (43/100, 95% CI 34%–53%) · first mover overall: 60% (120/200, 95% CI 53%–67%)
- Plies mean / median: 73.0 / 79.0 · games with a repeated position 0 (max 1×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (깊이 2) (A) | BFS (B) |
|---|---:|---:|
| Wins (as first / as second) | 106 (63/43) | 94 (57/37) |
| Decision ms mean / median / P95 / max | 5 / 2 / 16 / 55 | 4 / 3 / 14 / 48 |
| Nodes per move (mean) · nodes/s | 38 · 8,342 | 62 · 14,103 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 1.98 / 2.0 | 1.00 / 1.0 |
| TT hit rate · cutoffs per move | 0.0% · 8 | — · — |
| Last iteration timed out · proven result | 0.0% · 2.7% | — · — |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 20.9% · 7.64 | 24.1% · 8.81 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 13.5 · 19/30/42 | 12.0 · 17/25/35 |
| Walls left at end (mean) | 1.69 | 0.52 |
| Opponent path gain per wall · walls without gain · self-harm walls | 3.11 · 24 · 1 | 2.84 · 0 · 2 |
| Pawn moves away from goal · backtracks | 9 · 333 | 1 · 445 |
| Missed win-in-1 / available | 0 / 106 | 0 / 94 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 94 | 0 · 106 |

- Sessions 6 · commits 36818c6b7e · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

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

## F3-ab4-vs-ab3

Depth scaling: Alpha-Beta depth 4 vs depth 3

- Completed 200 / 200 scheduled games · config `191d8f087ba1b6b0` · budget fixed
- Decisive 199; halted: repetition 1, max plies 0, game time 0, user 0
- Distinct start positions 100 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (깊이 4)) win rate: 57% (114/199, 95% CI 50%–64%)** · Elo(A−B) +51 (95% CI +2 … +100, n=199)
- Pair score of A (unit = opening pair, halt-free pairs): 0.576 (95% CI 0.512–0.639, n=99) · sweeps A 29 / B 14, split 56, with halt 1
- A as first: 60% (59/99, 95% CI 50%–69%) · A as second: 55% (55/100, 95% CI 45%–64%) · first mover overall: 52% (104/199, 95% CI 45%–59%)
- Plies mean / median: 67.6 / 70.0 · games with a repeated position 1 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (깊이 4) (A) | Alpha-Beta (깊이 3) (B) |
|---|---:|---:|
| Wins (as first / as second) | 114 (59/55) | 85 (45/40) |
| Decision ms mean / median / P95 / max | 36 / 21 / 114 / 298 | 12 / 7 / 39 / 98 |
| Nodes per move (mean) · nodes/s | 576 · 15,861 | 191 · 15,505 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 3.90 / 4.0 | 2.96 / 3.0 |
| TT hit rate · cutoffs per move | 30.0% · 135 | 24.6% · 26 |
| Last iteration timed out · proven result | 0.0% · 5.9% | 0.0% · 4.2% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 25.1% · 8.51 | 20.9% · 7.07 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 11.0 · 15/21/32 | 11.0 · 16/24/36 |
| Walls left at end (mean) | 0.75 | 2.19 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.70 · 23 · 4 | 2.49 · 14 · 6 |
| Pawn moves away from goal · backtracks | 182 · 475 | 76 · 362 |
| Missed win-in-1 / available | 0 / 114 | 0 / 85 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 85 | 0 · 114 |

- Sessions 6 · commits 36818c6b7e · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

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

## F5-ab4-vs-guided3000

Alpha-Beta depth 4 vs Guided MCTS 3000 simulations

- Completed 200 / 200 scheduled games · config `41e42372449e8027` · budget fixed
- Decisive 199; halted: repetition 1, max plies 0, game time 0, user 0
- Distinct start positions 100 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (깊이 4)) win rate: 26% (51/199, 95% CI 20%–32%)** · Elo(A−B) -185 (95% CI -240 … -130, n=199)
- Pair score of A (unit = opening pair, halt-free pairs): 0.258 (95% CI 0.197–0.318, n=99) · sweeps A 6 / B 54, split 39, with halt 1
- A as first: 30% (30/99, 95% CI 22%–40%) · A as second: 21% (21/100, 95% CI 14%–30%) · first mover overall: 55% (109/199, 95% CI 48%–62%)
- Plies mean / median: 61.9 / 65.0 · games with a repeated position 1 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (깊이 4) (A) | Guided MCTS (3000회) (B) |
|---|---:|---:|
| Wins (as first / as second) | 51 (30/21) | 148 (79/69) |
| Decision ms mean / median / P95 / max | 22 / 12 / 73 / 1,538 | 835 / 685 / 2,284 / 10,503 |
| Nodes per move (mean) · nodes/s | 612 · 27,276 | 2,472 · 2,960 |
| Simulations per move · sims/s | — · — | 2,553 · 3,057 |
| Depth mean / median (AB: completed; MCTS: max tree) | 3.92 / 4.0 | 14.74 / 13.0 |
| TT hit rate · cutoffs per move | 28.0% · 137 | — · — |
| Last iteration timed out · proven result | 0.0% · 6.5% | — · 17.0% |
| MCTS top-move visit share · visit entropy (bits) | — · — | 69.1% · 1.32 |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 19.9% · 6.15 | 28.0% · 8.71 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 9.0 · 14/28/46 | 5.0 · 10/16/23 |
| Walls left at end (mean) | 2.99 | 0.43 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.32 · 40 · 18 | 2.39 · 76 · 2 |
| Pawn moves away from goal · backtracks | 191 · 304 | 251 · 444 |
| Missed win-in-1 / available | 0 / 51 | 0 / 148 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 148 | 0 · 51 |

- Sessions 6 · commits 36818c6b7e · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

## F6-guided3000-vs-pure1000

Guided MCTS 3000 vs Pure MCTS 1000 simulations

- Completed 100 / 100 scheduled games · config `b305071a9a350afa` · budget fixed
- Decisive 99; halted: repetition 1, max plies 0, game time 0, user 0
- Distinct start positions 50 · games duplicating an earlier game move-for-move 0
- **A (Guided MCTS (3000회)) win rate: 69% (68/99, 95% CI 59%–77%)** · Elo(A−B) +136 (95% CI +63 … +210, n=99)
- Pair score of A (unit = opening pair, halt-free pairs): 0.684 (95% CI 0.595–0.773, n=49) · sweeps A 22 / B 4, split 23, with halt 1
- A as first: 66% (33/50, 95% CI 52%–78%) · A as second: 71% (35/49, 95% CI 58%–82%) · first mover overall: 47% (47/99, 95% CI 38%–57%)
- Plies mean / median: 67.5 / 70.0 · games with a repeated position 9 (max 3×) · over-budget moves (>3× time) 0

| Search | Guided MCTS (3000회) (A) | Pure MCTS (1000회) (B) |
|---|---:|---:|
| Wins (as first / as second) | 68 (33/35) | 31 (14/17) |
| Decision ms mean / median / P95 / max | 667 / 567 / 1,542 / 3,423 | 1,174 / 743 / 3,315 / 7,558 |
| Nodes per move (mean) · nodes/s | 2,491 · 3,736 | 915 · 779 |
| Simulations per move · sims/s | 2,579 · 3,868 | 914 · 779 |
| Depth mean / median (AB: completed; MCTS: max tree) | 15.31 / 13.0 | 6.16 / 5.0 |
| TT hit rate · cutoffs per move | — · — | — · — |
| Last iteration timed out · proven result | — · 16.5% | — · 9.7% |
| MCTS top-move visit share · visit entropy (bits) | 62.5% · 1.63 | 36.4% · 2.44 |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 25.7% · 8.69 | 24.6% · 8.29 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 6.0 · 13/21/30 | 1.0 · 7/17/30 |
| Walls left at end (mean) | 0.56 | 0.96 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.26 · 60 · 0 | 1.56 · 196 · 13 |
| Pawn moves away from goal · backtracks | 313 · 294 | 252 · 379 |
| Missed win-in-1 / available | 0 / 68 | 0 / 31 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 31 | 0 · 68 |

- Sessions 6 · commits 36818c6b7e · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

## F7-minimax3-vs-ab3

Sanity: plain Minimax depth 3 vs Alpha-Beta depth 3 (same minimax value, tie-breaks may differ)

- Completed 40 / 40 scheduled games · config `f8c12b0ca984d37d` · budget fixed
- Decisive 40; halted: repetition 0, max plies 0, game time 0, user 0
- Distinct start positions 20 · games duplicating an earlier game move-for-move 0
- **A (Minimax (깊이 3)) win rate: 53% (21/40, 95% CI 37%–67%)** · Elo(A−B) +17 (95% CI -89 … +124, n=40)
- Pair score of A (unit = opening pair, halt-free pairs): 0.525 (95% CI 0.359–0.691, n=20) · sweeps A 6 / B 5, split 9, with halt 0
- A as first: 50% (10/20, 95% CI 30%–70%) · A as second: 55% (11/20, 95% CI 34%–74%) · first mover overall: 48% (19/40, 95% CI 33%–63%)
- Plies mean / median: 72.6 / 78.0 · games with a repeated position 0 (max 1×) · over-budget moves (>3× time) 0

| Search | Minimax (깊이 3) (A) | Alpha-Beta (깊이 3) (B) |
|---|---:|---:|
| Wins (as first / as second) | 21 (10/11) | 19 (9/10) |
| Decision ms mean / median / P95 / max | 30 / 11 / 113 / 211 | 6 / 4 / 18 / 65 |
| Nodes per move (mean) · nodes/s | 1,827 · 60,381 | 221 · 36,046 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 2.96 / 3.0 | 2.96 / 3.0 |
| TT hit rate · cutoffs per move | — · 0 | 25.0% · 28 |
| Last iteration timed out · proven result | 0.0% · 4.2% | 0.0% · 4.1% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 21.6% · 7.83 | 22.0% · 7.98 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 11.0 · 15/24/39 | 11.5 · 16/24/36 |
| Walls left at end (mean) | 1.35 | 1.20 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.90 · 4 · 2 | 2.68 · 2 · 0 |
| Pawn moves away from goal · backtracks | 99 · 165 | 28 · 86 |
| Missed win-in-1 / available | 0 / 21 | 0 / 19 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 19 | 0 · 21 |

- Sessions 6 · commits bc7472184d · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

