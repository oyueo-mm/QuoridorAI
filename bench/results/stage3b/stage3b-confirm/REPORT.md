# stage3b-confirm

E6 confirmation SPRT vs adopted E5, 300 ms, AC power, new openings.

## C-E6-300

Confirmation SPRT: E6 vs adopted E5, Alpha-Beta 300 ms (AC power)

- Completed 200 / 1200 scheduled games · config `e26af719ca0f7580` · budget equal-time
- **SPRT: H1 accepted — promote · LLR 2.98 in [-2.94, 2.94] · 84 pairs (LL 11 / split 41 / WW 32) · pair score 0.625 (95% CI 0.553–0.697) · Elo +89 (+37 … +145) · H0: Elo=0 vs H1: Elo=30, α=0.05, β=0.05**
- Machine CPU busy during games: mean 65%, max 89%
- Decisive 189; halted: repetition 11, max plies 0, game time 0, user 0
- Distinct start positions 100 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms) [E6]) win rate: 62% (117/189, 95% CI 55%–69%)** · Elo(A−B) +84 (95% CI +34 … +135, n=189)
- Pair score of A (unit = opening pair, halt-free pairs): 0.629 (95% CI 0.560–0.698, n=89) · sweeps A 34 / B 11, split 44, with halt 11
- A as first: 64% (61/96, 95% CI 54%–72%) · A as second: 60% (56/93, 95% CI 50%–70%) · first mover overall: 52% (98/189, 95% CI 45%–59%)
- Plies mean / median: 64.5 / 68.0 · games with a repeated position 12 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (300 ms) [E6] (A) | Alpha-Beta (300 ms) [E5 (default)] (B) |
|---|---:|---:|
| Wins (as first / as second) | 117 (61/56) | 72 (37/35) |
| Decision ms mean / median / P95 / max | 249 / 301 / 304 / 372 | 248 / 301 / 302 / 339 |
| Nodes per move (mean) · nodes/s | 7,660 · 30,818 | 14,387 · 58,092 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 7.19 / 6.0 | 7.84 / 7.0 |
| TT hit rate · cutoffs per move | 63.0% · 1,743 | 54.9% · 3,208 |
| Last iteration timed out · proven result | 79.5% · 20.2% | 79.4% · 20.3% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 23.0% · 7.44 | 22.3% · 7.17 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 9.0 · 14/21/33 | 10.0 · 15/24/36 |
| Walls left at end (mean) | 1.62 | 1.89 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.40 · 45 · 6 | 2.26 · 63 · 17 |
| Pawn moves away from goal · backtracks | 251 · 373 | 340 · 479 |
| Missed win-in-1 / available | 0 / 117 | 0 / 72 |
| Allowed opponent win-in-1: avoidable · forced | 1 · 71 | 0 · 117 |

- Sessions 4 · commits ac3d42a31a · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0 · power ac

