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

