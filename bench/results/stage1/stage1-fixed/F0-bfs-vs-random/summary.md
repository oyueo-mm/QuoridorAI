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

