## F-E1-d4

Evaluation E1 vs current evaluation, both Alpha-Beta depth 4 (fixed budget)

- Completed 79 / 1200 scheduled games · config `6db8cde979b64420` · budget fixed
- **SPRT: H0 accepted — reject · LLR -2.99 in [-2.94, 2.94] · 37 pairs (LL 16 / split 20 / WW 1) · pair score 0.297 (95% CI 0.209–0.386) · Elo -149 (-232 … -81) · H0: Elo=0 vs H1: Elo=30, α=0.05, β=0.05**
- Machine CPU busy during games: mean 59%, max 79%
- Decisive 78; halted: repetition 1, max plies 0, game time 0, user 0
- Distinct start positions 40 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (깊이 4) [E1]) win rate: 28% (22/78, 95% CI 19%–39%)** · Elo(A−B) -162 (95% CI -247 … -77, n=78)
- Pair score of A (unit = opening pair, halt-free pairs): 0.289 (95% CI 0.202–0.377, n=38) · sweeps A 1 / B 17, split 20, with halt 1
- A as first: 28% (11/39, 95% CI 17%–44%) · A as second: 28% (11/39, 95% CI 17%–44%) · first mover overall: 50% (39/78, 95% CI 39%–61%)
- Plies mean / median: 62.3 / 63.0 · games with a repeated position 1 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (깊이 4) [E1] (A) | Alpha-Beta (깊이 4) [current eval] (B) |
|---|---:|---:|
| Wins (as first / as second) | 22 (11/11) | 56 (28/28) |
| Decision ms mean / median / P95 / max | 38 / 21 / 118 / 696 | 33 / 20 / 98 / 471 |
| Nodes per move (mean) · nodes/s | 631 · 16,794 | 565 · 17,076 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 3.91 / 4.0 | 3.89 / 4.0 |
| TT hit rate · cutoffs per move | 26.8% · 136 | 27.7% · 135 |
| Last iteration timed out · proven result | 0.0% · 6.4% | 0.0% · 6.3% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 28.6% · 8.87 | 17.1% · 5.33 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 5.0 · 11/16/23 | 13.0 · 17/30/40 |
| Walls left at end (mean) | 0.09 | 3.63 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.26 · 30 · 1 | 2.42 · 12 · 2 |
| Pawn moves away from goal · backtracks | 137 · 294 | 33 · 96 |
| Missed win-in-1 / available | 0 / 22 | 0 / 56 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 56 | 0 · 22 |

- Sessions 3 · commits 2d01972dfd · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0 · power battery

