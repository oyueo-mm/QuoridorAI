# stage2b

Stage-2b A/B: end-of-race protective walls; default Alpha-Beta vs Guided MCTS, both with bitboard BFS.

## S6-defense3-vs-path-300

AB (path-defense within 3 steps) vs AB (opponent-path), both masked BFS, 300 ms per move

- Completed 200 / 200 scheduled games · config `0c80509e5db033b8` · budget equal-time
- Decisive 195; halted: repetition 5, max plies 0, game time 0, user 0
- Distinct start positions 100 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms) [defense≤3]) win rate: 50% (97/195, 95% CI 43%–57%)** · Elo(A−B) -2 (95% CI -50 … +47, n=195)
- Pair score of A (unit = opening pair, halt-free pairs): 0.495 (95% CI 0.440–0.550, n=97) · sweeps A 14 / B 15, split 68, with halt 3
- A as first: 52% (50/97, 95% CI 42%–61%) · A as second: 48% (47/98, 95% CI 38%–58%) · first mover overall: 52% (101/195, 95% CI 45%–59%)
- Plies mean / median: 69.6 / 73.0 · games with a repeated position 6 (max 3×) · over-budget moves (>3× time) 4

| Search | Alpha-Beta (300 ms) [defense≤3] (A) | Alpha-Beta (300 ms) [opponent-path] (B) |
|---|---:|---:|
| Wins (as first / as second) | 97 (50/47) | 98 (51/47) |
| Decision ms mean / median / P95 / max | 250 / 301 / 306 / 1,518 | 250 / 301 / 306 / 1,420 |
| Nodes per move (mean) · nodes/s | 10,365 · 41,448 | 10,276 · 41,181 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 7.47 / 6.0 | 7.49 / 6.0 |
| TT hit rate · cutoffs per move | 57.5% · 2,257 | 57.7% · 2,241 |
| Last iteration timed out · proven result | 79.4% · 20.4% | 79.3% · 20.4% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 23.0% · 8.00 | 23.2% · 8.08 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 7.0 · 12/21/36 | 7.0 · 12/19/33 |
| Walls left at end (mean) | 1.19 | 1.11 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.28 · 103 · 18 | 2.34 · 90 · 16 |
| Pawn moves away from goal · backtracks | 220 · 393 | 240 · 468 |
| Missed win-in-1 / available | 0 / 97 | 0 / 98 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 98 | 0 · 97 |

- Sessions 4 · commits fec6ac4f11 · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

## S7-masked-vs-guided-300

Default AB (masked BFS, opponent-path) vs Guided MCTS (masked BFS), 300 ms per move

- Completed 200 / 200 scheduled games · config `5638a49c4bbb0c16` · budget equal-time
- Decisive 199; halted: repetition 1, max plies 0, game time 0, user 0
- Distinct start positions 100 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms) [masked BFS]) win rate: 60% (120/199, 95% CI 53%–67%)** · Elo(A−B) +73 (95% CI +23 … +122, n=199)
- Pair score of A (unit = opening pair, halt-free pairs): 0.606 (95% CI 0.538–0.674, n=99) · sweeps A 36 / B 15, split 48, with halt 1
- A as first: 58% (57/99, 95% CI 48%–67%) · A as second: 63% (63/100, 95% CI 53%–72%) · first mover overall: 47% (94/199, 95% CI 40%–54%)
- Plies mean / median: 69.0 / 70.0 · games with a repeated position 1 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (300 ms) [masked BFS] (A) | Guided MCTS (300 ms) (B) |
|---|---:|---:|
| Wins (as first / as second) | 120 (57/63) | 79 (37/42) |
| Decision ms mean / median / P95 / max | 259 / 302 / 310 / 392 | 267 / 301 / 304 / 356 |
| Nodes per move (mean) · nodes/s | 3,112 · 12,001 | 347 · 1,297 |
| Simulations per move · sims/s | — · — | 388 · 1,453 |
| Depth mean / median (AB: completed; MCTS: max tree) | 6.69 / 5.0 | 10.36 / 8.0 |
| TT hit rate · cutoffs per move | 60.1% · 677 | — · — |
| Last iteration timed out · proven result | 81.5% · 18.2% | — · 13.6% |
| MCTS top-move visit share · visit entropy (bits) | — · — | 57.5% · 1.75 |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 23.8% · 8.22 | 23.7% · 8.18 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 8.0 · 13/21/32 | 7.0 · 13/21/30 |
| Walls left at end (mean) | 1.11 | 1.15 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.62 · 48 · 6 | 2.32 · 36 · 11 |
| Pawn moves away from goal · backtracks | 168 · 375 | 341 · 481 |
| Missed win-in-1 / available | 0 / 120 | 0 / 79 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 79 | 3 · 117 |

- Sessions 4 · commits fec6ac4f11 · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

