## T-E5-300

Evaluation E5 vs current evaluation, Alpha-Beta 300 ms per move

- Completed 329 / 1200 scheduled games · config `7e763f31a7025bf2` · budget equal-time
- **SPRT: H1 accepted — promote · LLR 2.96 in [-2.94, 2.94] · 152 pairs (LL 27 / split 74 / WW 51) · pair score 0.579 (95% CI 0.523–0.635) · Elo +55 (+16 … +96) · H0: Elo=0 vs H1: Elo=30, α=0.05, β=0.05**
- Replayed suspect games: 4 · still suspect after 3 attempts: 0
- Machine CPU busy during games: mean 57%, max 75%
- Decisive 322; halted: repetition 7, max plies 0, game time 0, user 0
- Distinct start positions 165 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms) [E5]) win rate: 57% (185/322, 95% CI 52%–63%)** · Elo(A−B) +52 (95% CI +14 … +90, n=322)
- Pair score of A (unit = opening pair, halt-free pairs): 0.576 (95% CI 0.522–0.631, n=157) · sweeps A 52 / B 28, split 77, with halt 7
- A as first: 57% (92/161, 95% CI 49%–65%) · A as second: 58% (93/161, 95% CI 50%–65%) · first mover overall: 50% (160/322, 95% CI 44%–55%)
- Plies mean / median: 63.6 / 65.0 · games with a repeated position 7 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (300 ms) [E5] (A) | Alpha-Beta (300 ms) [current eval] (B) |
|---|---:|---:|
| Wins (as first / as second) | 185 (92/93) | 137 (68/69) |
| Decision ms mean / median / P95 / max | 252 / 301 / 304 / 421 | 251 / 301 / 304 / 375 |
| Nodes per move (mean) · nodes/s | 11,461 · 45,536 | 11,361 · 45,289 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 7.34 / 6.0 | 7.41 / 6.0 |
| TT hit rate · cutoffs per move | 54.5% · 2,520 | 53.7% · 2,510 |
| Last iteration timed out · proven result | 80.3% · 19.5% | 79.9% · 19.6% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 18.0% · 5.73 | 26.7% · 8.47 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 11.0 · 16/25/38 | 7.0 · 11/18/26 |
| Walls left at end (mean) | 3.39 | 0.66 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.35 · 59 · 16 | 2.26 · 128 · 13 |
| Pawn moves away from goal · backtracks | 305 · 518 | 775 · 1221 |
| Missed win-in-1 / available | 0 / 185 | 0 / 137 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 137 | 0 · 185 |

- Sessions 4 · commits 5a0cfe562a · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0 · power ac

