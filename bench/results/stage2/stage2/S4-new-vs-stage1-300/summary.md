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

