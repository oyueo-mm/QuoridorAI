## C-D-300

Confirmation SPRT (new openings): fast E6 evaluation vs stage 3-C implementation, 300 ms

- Completed 1062 / 1200 scheduled games · config `523358e966c9d8e7` · budget equal-time
- **SPRT: H1 accepted — promote · LLR 2.98 in [-2.94, 2.94] · 497 pairs (LL 74 / split 315 / WW 108) · pair score 0.534 (95% CI 0.508–0.561) · Elo +24 (+5 … +42) · H0: Elo=0 vs H1: Elo=30, α=0.05, β=0.05**
- Replayed suspect games: 1 · still suspect after 3 attempts: 0
- Machine CPU busy during games: mean 63%, max 100%
- Decisive 1037; halted: repetition 25, max plies 0, game time 0, user 0
- Distinct start positions 532 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms) [fast eval]) win rate: 53% (553/1037, 95% CI 50%–56%)** · Elo(A−B) +23 (95% CI +2 … +44, n=1037)
- Pair score of A (unit = opening pair, halt-free pairs): 0.532 (95% CI 0.505–0.558, n=507) · sweeps A 108 / B 76, split 323, with halt 23
- A as first: 52% (270/517, 95% CI 48%–56%) · A as second: 54% (283/520, 95% CI 50%–59%) · first mover overall: 49% (507/1037, 95% CI 46%–52%)
- Plies mean / median: 67.4 / 69.0 · games with a repeated position 46 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (300 ms) [fast eval] (A) | Alpha-Beta (300 ms) [reference eval] (B) |
|---|---:|---:|
| Wins (as first / as second) | 553 (270/283) | 484 (237/247) |
| Decision ms mean / median / P95 / max | 242 / 301 / 303 / 737 | 248 / 301 / 305 / 744 |
| Nodes per move (mean) · nodes/s | 13,106 · 54,243 | 9,231 · 37,237 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 7.94 / 6.0 | 7.49 / 6.0 |
| TT hit rate · cutoffs per move | 74.2% · 3,109 | 74.5% · 2,147 |
| Last iteration timed out · proven result | 77.3% · 22.2% | 79.1% · 20.7% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 22.6% · 7.63 | 21.5% · 7.25 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 8.0 · 14/22/33 | 9.0 · 14/23/37 |
| Walls left at end (mean) | 1.39 | 1.77 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.30 · 415 · 60 | 2.26 · 379 · 90 |
| Pawn moves away from goal · backtracks | 1871 · 2594 | 1956 · 2534 |
| Missed win-in-1 / available | 0 / 553 | 0 / 484 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 484 | 0 · 553 |

- Sessions 4 · commits 132250d441 · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0 · power ac

