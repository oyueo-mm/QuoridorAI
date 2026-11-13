## C-C1-300

Confirmation SPRT (new openings): search package C1 vs baseline search, both E6, 300 ms

- Completed 217 / 1200 scheduled games · config `c94c2f4bdd1845e8` · budget equal-time
- **SPRT: H1 accepted — promote · LLR 3.09 in [-2.94, 2.94] · 90 pairs (LL 7 / split 61 / WW 22) · pair score 0.583 (95% CI 0.527–0.640) · Elo +58 (+19 … +100) · H0: Elo=0 vs H1: Elo=30, α=0.05, β=0.05**
- Machine CPU busy during games: mean 65%, max 93%
- Decisive 205; halted: repetition 12, max plies 0, game time 0, user 0
- Distinct start positions 109 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms) [C1]) win rate: 58% (118/205, 95% CI 51%–64%)** · Elo(A−B) +53 (95% CI +5 … +101, n=205)
- Pair score of A (unit = opening pair, halt-free pairs): 0.571 (95% CI 0.518–0.625, n=98) · sweeps A 22 / B 8, split 68, with halt 10
- A as first: 58% (60/104, 95% CI 48%–67%) · A as second: 57% (58/101, 95% CI 48%–67%) · first mover overall: 50% (103/205, 95% CI 43%–57%)
- Plies mean / median: 66.8 / 69.0 · games with a repeated position 12 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (300 ms) [C1] (A) | Alpha-Beta (300 ms) [baseline search] (B) |
|---|---:|---:|
| Wins (as first / as second) | 118 (60/58) | 87 (43/44) |
| Decision ms mean / median / P95 / max | 248 / 301 / 304 / 333 | 249 / 301 / 304 / 344 |
| Nodes per move (mean) · nodes/s | 8,277 · 33,419 | 7,667 · 30,763 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 7.43 / 6.0 | 7.27 / 6.0 |
| TT hit rate · cutoffs per move | 73.9% · 1,917 | 63.1% · 1,734 |
| Last iteration timed out · proven result | 79.0% · 20.6% | 79.6% · 20.1% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 22.8% · 7.62 | 21.7% · 7.26 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 8.0 · 14/22/34 | 8.0 · 14/23/37 |
| Walls left at end (mean) | 1.47 | 1.83 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.33 · 63 · 12 | 2.28 · 63 · 11 |
| Pawn moves away from goal · backtracks | 374 · 512 | 399 · 492 |
| Missed win-in-1 / available | 0 / 118 | 0 / 87 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 87 | 0 · 118 |

- Sessions 4 · commits af892bf984 · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0 · power ac

