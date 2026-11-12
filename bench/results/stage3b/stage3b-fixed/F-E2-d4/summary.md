## F-E2-d4

Evaluation E2 vs current evaluation, both Alpha-Beta depth 4 (fixed budget)

- Completed 263 / 1200 scheduled games · config `3c576a438b7d511f` · budget fixed
- **SPRT: H0 accepted — reject · LLR -2.96 in [-2.94, 2.94] · 117 pairs (LL 37 / split 56 / WW 24) · pair score 0.444 (95% CI 0.380–0.509) · Elo -39 (-85 … +7) · H0: Elo=0 vs H1: Elo=30, α=0.05, β=0.05**
- Machine CPU busy during games: mean 57%, max 85%
- Decisive 261; halted: repetition 2, max plies 0, game time 0, user 0
- Distinct start positions 132 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (깊이 4) [E2]) win rate: 44% (116/261, 95% CI 39%–51%)** · Elo(A−B) -39 (95% CI -81 … +4, n=261)
- Pair score of A (unit = opening pair, halt-free pairs): 0.450 (95% CI 0.389–0.510, n=129) · sweeps A 26 / B 39, split 64, with halt 2
- A as first: 41% (54/131, 95% CI 33%–50%) · A as second: 48% (62/130, 95% CI 39%–56%) · first mover overall: 47% (122/261, 95% CI 41%–53%)
- Plies mean / median: 68.2 / 72.0 · games with a repeated position 2 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (깊이 4) [E2] (A) | Alpha-Beta (깊이 4) [current eval] (B) |
|---|---:|---:|
| Wins (as first / as second) | 116 (54/62) | 145 (68/77) |
| Decision ms mean / median / P95 / max | 29 / 16 / 75 / 23,169 | 32 / 15 / 86 / 20,350 |
| Nodes per move (mean) · nodes/s | 503 · 17,545 | 551 · 17,012 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 3.91 / 4.0 | 3.90 / 4.0 |
| TT hit rate · cutoffs per move | 30.6% · 114 | 29.6% · 129 |
| Last iteration timed out · proven result | 0.0% · 5.8% | 0.0% · 5.8% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 17.4% · 5.93 | 26.0% · 8.88 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 14.0 · 19/29/45 | 10.0 · 15/21/28 |
| Walls left at end (mean) | 3.20 | 0.24 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.52 · 4 · 17 | 2.79 · 42 · 1 |
| Pawn moves away from goal · backtracks | 73 · 422 | 503 · 936 |
| Missed win-in-1 / available | 0 / 116 | 0 / 145 |
| Allowed opponent win-in-1: avoidable · forced | 1 · 144 | 0 · 116 |

- Sessions 3 · commits 4272645727 · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0 · power battery

