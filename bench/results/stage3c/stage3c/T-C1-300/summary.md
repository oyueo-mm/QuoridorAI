## T-C1-300

SPRT: search package C1 vs baseline search, both E6, 300 ms

- Completed 781 / 1200 scheduled games · config `d7e41a9d4954eaf5` · budget equal-time
- **SPRT: H1 accepted — promote · LLR 2.98 in [-2.94, 2.94] · 356 pairs (LL 61 / split 204 / WW 91) · pair score 0.542 (95% CI 0.508–0.576) · Elo +29 (+6 … +53) · H0: Elo=0 vs H1: Elo=30, α=0.05, β=0.05**
- Replayed suspect games: 4 · still suspect after 3 attempts: 0
- Machine CPU busy during games: mean 61%, max 100%
- Decisive 751; halted: repetition 29, max plies 0, game time 1, user 0
- Distinct start positions 391 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms) [C1]) win rate: 55% (412/751, 95% CI 51%–58%)** · Elo(A−B) +34 (95% CI +9 … +59, n=751)
- Pair score of A (unit = opening pair, halt-free pairs): 0.542 (95% CI 0.508–0.575, n=360) · sweeps A 92 / B 62, split 206, with halt 30
- A as first: 53% (196/372, 95% CI 48%–58%) · A as second: 57% (216/379, 95% CI 52%–62%) · first mover overall: 48% (359/751, 95% CI 44%–51%)
- Plies mean / median: 66.1 / 68.0 · games with a repeated position 37 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (300 ms) [C1] (A) | Alpha-Beta (300 ms) [baseline search] (B) |
|---|---:|---:|
| Wins (as first / as second) | 412 (196/216) | 339 (163/176) |
| Decision ms mean / median / P95 / max | 255 / 301 / 309 / 620 | 257 / 301 / 309 / 514 |
| Nodes per move (mean) · nodes/s | 5,800 · 22,711 | 5,321 · 20,711 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 6.81 / 6.0 | 6.66 / 5.0 |
| TT hit rate · cutoffs per move | 72.8% · 1,340 | 62.0% · 1,207 |
| Last iteration timed out · proven result | 81.2% · 18.5% | 81.6% · 18.1% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 22.7% · 7.49 | 21.9% · 7.22 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 9.0 · 14/22/33 | 10.0 · 15/24/36 |
| Walls left at end (mean) | 1.56 | 1.84 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.32 · 238 · 32 | 2.30 · 189 · 48 |
| Pawn moves away from goal · backtracks | 1228 · 1739 | 1520 · 1905 |
| Missed win-in-1 / available | 0 / 412 | 0 / 339 |
| Allowed opponent win-in-1: avoidable · forced | 1 · 338 | 0 · 412 |

- Sessions 4 · commits 98a10da00e · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0 · power ac

