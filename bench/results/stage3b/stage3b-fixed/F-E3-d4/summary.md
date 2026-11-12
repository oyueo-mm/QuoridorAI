## F-E3-d4

Evaluation E3 vs current evaluation, both Alpha-Beta depth 4 (fixed budget)

- Completed 1200 / 1200 scheduled games · config `2ba0e5b846651788` · budget fixed
- **SPRT: INCONCLUSIVE — 600 pairs could not separate H0 from H1 · LLR 0.95 in [-2.94, 2.94] · 577 pairs (LL 120 / split 307 / WW 150) · pair score 0.526 (95% CI 0.498–0.554) · Elo +18 (-1 … +38) · H0: Elo=0 vs H1: Elo=30, α=0.05, β=0.05**
- Machine CPU busy during games: mean 55%, max 100%
- Decisive 1177; halted: repetition 23, max plies 0, game time 0, user 0
- Distinct start positions 600 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (깊이 4) [E3]) win rate: 53% (623/1177, 95% CI 50%–56%)** · Elo(A−B) +20 (95% CI +1 … +40, n=1177)
- Pair score of A (unit = opening pair, halt-free pairs): 0.526 (95% CI 0.498–0.554, n=577) · sweeps A 150 / B 120, split 307, with halt 23
- A as first: 52% (310/591, 95% CI 48%–56%) · A as second: 53% (313/586, 95% CI 49%–57%) · first mover overall: 50% (583/1177, 95% CI 47%–52%)
- Plies mean / median: 64.5 / 67.0 · games with a repeated position 23 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (깊이 4) [E3] (A) | Alpha-Beta (깊이 4) [current eval] (B) |
|---|---:|---:|
| Wins (as first / as second) | 623 (310/313) | 554 (273/281) |
| Decision ms mean / median / P95 / max | 200 / 66 / 444 / 1,960,273 | 166 / 16 / 78 / 1,965,153 |
| Nodes per move (mean) · nodes/s | 581 · 2,910 | 568 · 3,422 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 3.90 / 4.0 | 3.91 / 4.0 |
| TT hit rate · cutoffs per move | 29.5% · 133 | 27.9% · 130 |
| Last iteration timed out · proven result | 0.0% · 6.1% | 0.0% · 6.1% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 26.6% · 8.58 | 18.8% · 6.05 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 8.0 · 13/19/26 | 11.0 · 15/24/38 |
| Walls left at end (mean) | 0.49 | 3.03 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.43 · 333 · 12 | 2.20 · 235 · 63 |
| Pawn moves away from goal · backtracks | 1957 · 4830 | 1140 · 1838 |
| Missed win-in-1 / available | 0 / 623 | 0 / 554 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 554 | 3 · 620 |

- Sessions 3 · commits bfbd3506b4 · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0 · power battery

