## F-E4-d4

Evaluation E4 vs current evaluation, both Alpha-Beta depth 4 (fixed budget)

- Completed 210 / 1200 scheduled games · config `132ff72db6b1a050` · budget fixed
- **SPRT: H1 accepted — promote · LLR 2.98 in [-2.94, 2.94] · 89 pairs (LL 12 / split 44 / WW 33) · pair score 0.618 (95% CI 0.548–0.688) · Elo +84 (+33 … +137) · H0: Elo=0 vs H1: Elo=30, α=0.05, β=0.05**
- Machine CPU busy during games: mean 51%, max 63%
- Decisive 202; halted: repetition 8, max plies 0, game time 0, user 0
- Distinct start positions 106 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (깊이 4) [E4]) win rate: 62% (125/202, 95% CI 55%–68%)** · Elo(A−B) +84 (95% CI +35 … +133, n=202)
- Pair score of A (unit = opening pair, halt-free pairs): 0.619 (95% CI 0.550–0.687, n=97) · sweeps A 37 / B 14, split 46, with halt 7
- A as first: 62% (64/103, 95% CI 52%–71%) · A as second: 62% (61/99, 95% CI 52%–71%) · first mover overall: 50% (102/202, 95% CI 44%–57%)
- Plies mean / median: 64.7 / 65.0 · games with a repeated position 8 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (깊이 4) [E4] (A) | Alpha-Beta (깊이 4) [current eval] (B) |
|---|---:|---:|
| Wins (as first / as second) | 125 (64/61) | 77 (38/39) |
| Decision ms mean / median / P95 / max | 80 / 42 / 266 / 1,759 | 16 / 10 / 47 / 930 |
| Nodes per move (mean) · nodes/s | 620 · 7,760 | 592 · 36,694 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 3.90 / 4.0 | 3.91 / 4.0 |
| TT hit rate · cutoffs per move | 28.8% · 144 | 27.1% · 133 |
| Last iteration timed out · proven result | 0.0% · 5.9% | 0.0% · 5.9% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 25.8% · 8.36 | 19.5% · 6.31 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 8.0 · 13/19/27 | 11.0 · 16/25/38 |
| Walls left at end (mean) | 0.74 | 2.78 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.43 · 51 · 4 | 2.15 · 46 · 10 |
| Pawn moves away from goal · backtracks | 327 · 804 | 282 · 464 |
| Missed win-in-1 / available | 0 / 125 | 0 / 77 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 77 | 1 · 124 |

- Sessions 3 · commits 5a0cfe562a · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0 · power battery

