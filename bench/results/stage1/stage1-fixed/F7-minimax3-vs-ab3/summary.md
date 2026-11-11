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

