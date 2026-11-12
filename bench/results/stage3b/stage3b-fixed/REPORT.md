# stage3b-fixed

Stage 3-B: evaluation candidates vs current evaluation, fixed depth 4, SPRT (H0 0 / H1 +30).

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

