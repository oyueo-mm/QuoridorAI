## T300-ab-vs-pure

Alpha-Beta vs Pure MCTS, 300 ms per move

- Completed 100 / 100 scheduled games · config `5115477bb8547b3f` · budget equal-time
- Decisive 96; halted: repetition 4, max plies 0, game time 0, user 0
- Distinct start positions 50 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms)) win rate: 96% (92/96, 95% CI 90%–98%)** · Elo(A−B) +545 (95% CI +377 … +712, n=96)
- Pair score of A (unit = opening pair, halt-free pairs): 0.957 (95% CI 0.915–0.998, n=46) · sweeps A 42 / B 0, split 4, with halt 4
- A as first: 98% (48/49, 95% CI 89%–100%) · A as second: 94% (44/47, 95% CI 83%–98%) · first mover overall: 53% (51/96, 95% CI 43%–63%)
- Plies mean / median: 55.9 / 55.0 · games with a repeated position 7 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (300 ms) (A) | Pure MCTS (300 ms) (B) |
|---|---:|---:|
| Wins (as first / as second) | 92 (48/44) | 4 (3/1) |
| Decision ms mean / median / P95 / max | 265 / 302 / 322 / 559 | 282 / 302 / 324 / 621 |
| Nodes per move (mean) · nodes/s | 4,683 · 17,648 | 231 · 818 |
| Simulations per move · sims/s | — · — | 230 · 814 |
| Depth mean / median (AB: completed; MCTS: max tree) | 5.53 / 5.0 | 3.44 / 3.0 |
| TT hit rate · cutoffs per move | 55.9% · 953 | — · — |
| Last iteration timed out · proven result | 83.8% · 16.0% | — · 8.5% |
| MCTS top-move visit share · visit entropy (bits) | — · — | 31.5% · 2.42 |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 25.0% · 7.03 | 26.8% · 7.43 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 9.0 · 14/21/30 | 3.0 · 9/16/25 |
| Walls left at end (mean) | 2.26 | 1.86 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.62 · 39 · 1 | 1.52 · 124 · 25 |
| Pawn moves away from goal · backtracks | 113 · 137 | 268 · 424 |
| Missed win-in-1 / available | 0 / 92 | 0 / 4 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 4 | 0 · 92 |

- Sessions 4 · commits cfacb2551f · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

