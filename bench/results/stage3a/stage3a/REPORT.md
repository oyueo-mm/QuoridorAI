# stage3a

Stage 3-A: SPRT validation (H0 Elo 0 vs H1 Elo +30, α = β = 0.05, 30–600 pairs).

## V1-sprt-ab3-vs-ab2

SPRT on a known large difference: Alpha-Beta depth 3 vs depth 2 (fixed budget)

- Completed 116 / 1200 scheduled games · config `a8a4b3c6a7ba0a65` · budget fixed
- **SPRT: H1 accepted — promote · LLR 3.02 in [-2.94, 2.94] · 45 pairs (LL 2 / split 21 / WW 22) · pair score 0.722 (95% CI 0.637–0.808) · Elo +166 (+97 … +249) · H0: Elo=0 vs H1: Elo=30, α=0.05, β=0.05**
- Machine CPU busy during games: mean 54%, max 68%
- Decisive 116; halted: repetition 0, max plies 0, game time 0, user 0
- Distinct start positions 59 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (깊이 3)) win rate: 74% (86/116, 95% CI 65%–81%)** · Elo(A−B) +183 (95% CI +111 … +255, n=116)
- Pair score of A (unit = opening pair, halt-free pairs): 0.746 (95% CI 0.672–0.820, n=57) · sweeps A 30 / B 2, split 25, with halt 0
- A as first: 73% (43/59, 95% CI 60%–83%) · A as second: 75% (43/57, 95% CI 63%–85%) · first mover overall: 49% (57/116, 95% CI 40%–58%)
- Plies mean / median: 65.6 / 70.0 · games with a repeated position 0 (max 1×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (깊이 3) (A) | Alpha-Beta (깊이 2) (B) |
|---|---:|---:|
| Wins (as first / as second) | 86 (43/43) | 30 (14/16) |
| Decision ms mean / median / P95 / max | 12 / 8 / 37 / 140 | 3 / 2 / 10 / 32 |
| Nodes per move (mean) · nodes/s | 200 · 16,384 | 39 · 11,430 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 2.94 / 3.0 | 1.99 / 2.0 |
| TT hit rate · cutoffs per move | 25.9% · 25 | 0.0% · 7 |
| Last iteration timed out · proven result | 0.0% · 5.3% | 0.0% · 3.1% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 24.9% · 8.21 | 19.9% · 6.48 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 11.0 · 16/23/30 | 13.0 · 21/33/46 |
| Walls left at end (mean) | 1.01 | 2.75 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.88 · 5 · 1 | 2.75 · 7 · 2 |
| Pawn moves away from goal · backtracks | 18 · 175 | 16 · 169 |
| Missed win-in-1 / available | 0 / 86 | 0 / 30 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 30 | 0 · 86 |

- Sessions 4 · commits e8e0eea4ea · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0 · power battery

## V1b-sprt-ab3-vs-ab2-repeat

Reproducibility: identical configuration to V1 (decision and pair count must match)

- Completed 116 / 1200 scheduled games · config `a8a4b3c6a7ba0a65` · budget fixed
- **SPRT: H1 accepted — promote · LLR 3.02 in [-2.94, 2.94] · 45 pairs (LL 2 / split 21 / WW 22) · pair score 0.722 (95% CI 0.637–0.808) · Elo +166 (+97 … +249) · H0: Elo=0 vs H1: Elo=30, α=0.05, β=0.05**
- Machine CPU busy during games: mean 54%, max 65%
- Decisive 116; halted: repetition 0, max plies 0, game time 0, user 0
- Distinct start positions 59 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (깊이 3)) win rate: 74% (86/116, 95% CI 65%–81%)** · Elo(A−B) +183 (95% CI +111 … +255, n=116)
- Pair score of A (unit = opening pair, halt-free pairs): 0.746 (95% CI 0.672–0.820, n=57) · sweeps A 30 / B 2, split 25, with halt 0
- A as first: 73% (43/59, 95% CI 60%–83%) · A as second: 75% (43/57, 95% CI 63%–85%) · first mover overall: 49% (57/116, 95% CI 40%–58%)
- Plies mean / median: 65.6 / 70.0 · games with a repeated position 0 (max 1×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (깊이 3) (A) | Alpha-Beta (깊이 2) (B) |
|---|---:|---:|
| Wins (as first / as second) | 86 (43/43) | 30 (14/16) |
| Decision ms mean / median / P95 / max | 12 / 8 / 36 / 119 | 3 / 2 / 10 / 49 |
| Nodes per move (mean) · nodes/s | 200 · 16,977 | 39 · 12,044 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 2.94 / 3.0 | 1.99 / 2.0 |
| TT hit rate · cutoffs per move | 25.9% · 25 | 0.0% · 7 |
| Last iteration timed out · proven result | 0.0% · 5.3% | 0.0% · 3.1% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 24.9% · 8.21 | 19.9% · 6.48 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 11.0 · 16/23/30 | 13.0 · 21/33/46 |
| Walls left at end (mean) | 1.01 | 2.75 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.88 · 5 · 1 | 2.75 · 7 · 2 |
| Pawn moves away from goal · backtracks | 18 · 175 | 16 · 169 |
| Missed win-in-1 / available | 0 / 86 | 0 / 30 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 30 | 0 · 86 |

- Sessions 4 · commits e8e0eea4ea · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0 · power battery

## V2-sprt-null-ab-vs-ab-300

SPRT null test: identical Alpha-Beta (default settings) on both sides, 300 ms per move

- Completed 469 / 1200 scheduled games · config `8e3e1ddec674353b` · budget equal-time
- **SPRT: H0 accepted — reject · LLR -2.95 in [-2.94, 2.94] · 220 pairs (LL 10 / split 195 / WW 15) · pair score 0.511 (95% CI 0.489–0.534) · Elo +8 (-8 … +23) · H0: Elo=0 vs H1: Elo=30, α=0.05, β=0.05**
- Replayed suspect games: 4 · still suspect after 3 attempts: 0
- Machine CPU busy during games: mean 58%, max 84%
- Decisive 461; halted: repetition 8, max plies 0, game time 0, user 0
- Distinct start positions 235 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms) [A]) win rate: 51% (233/461, 95% CI 46%–55%)** · Elo(A−B) +4 (95% CI -28 … +35, n=461)
- Pair score of A (unit = opening pair, halt-free pairs): 0.511 (95% CI 0.489–0.532, n=228) · sweeps A 15 / B 10, split 203, with halt 6
- A as first: 48% (111/231, 95% CI 42%–54%) · A as second: 53% (122/230, 95% CI 47%–59%) · first mover overall: 48% (219/461, 95% CI 43%–52%)
- Plies mean / median: 67.9 / 70.0 · games with a repeated position 8 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (300 ms) [A] (A) | Alpha-Beta (300 ms) [B] (B) |
|---|---:|---:|
| Wins (as first / as second) | 233 (111/122) | 228 (108/120) |
| Decision ms mean / median / P95 / max | 257 / 301 / 307 / 502 | 257 / 301 / 307 / 408 |
| Nodes per move (mean) · nodes/s | 5,636 · 21,906 | 5,635 · 21,903 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 6.56 / 5.0 | 6.56 / 5.0 |
| TT hit rate · cutoffs per move | 54.6% · 1,159 | 54.6% · 1,162 |
| Last iteration timed out · proven result | 81.8% · 17.9% | 82.0% · 17.8% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 23.1% · 7.85 | 23.2% · 7.87 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 7.0 · 12/20/34 | 7.0 · 12/20/34 |
| Walls left at end (mean) | 1.39 | 1.36 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.34 · 168 · 20 | 2.35 · 160 · 23 |
| Pawn moves away from goal · backtracks | 582 · 1045 | 571 · 1031 |
| Missed win-in-1 / available | 0 / 233 | 0 / 228 |
| Allowed opponent win-in-1: avoidable · forced | 1 · 227 | 1 · 232 |

- Sessions 4 · commits e8e0eea4ea · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0 · power battery

