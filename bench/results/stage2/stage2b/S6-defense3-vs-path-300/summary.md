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

