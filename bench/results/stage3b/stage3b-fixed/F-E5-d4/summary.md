## F-E5-d4

Evaluation E5 vs current evaluation, both Alpha-Beta depth 4 (fixed budget)

- Completed 392 / 1200 scheduled games · config `42804ae1c56cf968` · budget fixed
- **SPRT: H1 accepted — promote · LLR 2.97 in [-2.94, 2.94] · 190 pairs (LL 32 / split 102 / WW 56) · pair score 0.563 (95% CI 0.515–0.611) · Elo +44 (+11 … +78) · H0: Elo=0 vs H1: Elo=30, α=0.05, β=0.05**
- Machine CPU busy during games: mean 50%, max 69%
- Decisive 391; halted: repetition 1, max plies 0, game time 0, user 0
- Distinct start positions 197 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (깊이 4) [E5]) win rate: 56% (219/391, 95% CI 51%–61%)** · Elo(A−B) +42 (95% CI +7 … +77, n=391)
- Pair score of A (unit = opening pair, halt-free pairs): 0.559 (95% CI 0.512–0.607, n=194) · sweeps A 57 / B 34, split 103, with halt 1
- A as first: 54% (107/197, 95% CI 47%–61%) · A as second: 58% (112/194, 95% CI 51%–64%) · first mover overall: 48% (189/391, 95% CI 43%–53%)
- Plies mean / median: 66.9 / 69.0 · games with a repeated position 1 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (깊이 4) [E5] (A) | Alpha-Beta (깊이 4) [current eval] (B) |
|---|---:|---:|
| Wins (as first / as second) | 219 (107/112) | 172 (82/90) |
| Decision ms mean / median / P95 / max | 12 / 8 / 36 / 136 | 13 / 8 / 38 / 155 |
| Nodes per move (mean) · nodes/s | 520 · 42,272 | 536 · 42,039 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 3.90 / 4.0 | 3.91 / 4.0 |
| TT hit rate · cutoffs per move | 28.9% · 120 | 29.0% · 124 |
| Last iteration timed out · proven result | 0.0% · 5.9% | 0.0% · 6.0% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 18.5% · 6.21 | 25.7% · 8.59 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 14.0 · 19/27/39 | 11.0 · 15/21/29 |
| Walls left at end (mean) | 2.89 | 0.51 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.49 · 27 · 7 | 2.53 · 74 · 7 |
| Pawn moves away from goal · backtracks | 214 · 583 | 700 · 1458 |
| Missed win-in-1 / available | 0 / 219 | 0 / 172 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 172 | 0 · 219 |

- Sessions 3 · commits 5a0cfe562a · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0 · power ac

