# stage3d-independent

One preregistered independent confirmation only. Full exact/symmetry history preflight is mandatory.

## C-D-300-independent-1

Single replacement independent confirmation: E6+C1 fast vs reference, 300 ms, no further attempt regardless of result

- Completed 513 / 1200 scheduled games · config `cba0fa36592dbd6b` · budget equal-time
- **SPRT: H1 accepted — promote · LLR 2.96 in [-2.94, 2.94] · 224 pairs (LL 27 / split 149 / WW 48) · pair score 0.547 (95% CI 0.509–0.584) · Elo +33 (+7 … +59) · H0: Elo=0 vs H1: Elo=30, α=0.05, β=0.05**
- Machine CPU busy during games: mean 61%, max 95%
- Decisive 483; halted: repetition 30, max plies 0, game time 0, user 0
- Distinct start positions 257 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms) [fast eval]) win rate: 54% (263/483, 95% CI 50%–59%)** · Elo(A−B) +31 (95% CI -0 … +62, n=483)
- Pair score of A (unit = opening pair, halt-free pairs): 0.550 (95% CI 0.513–0.588, n=228) · sweeps A 50 / B 27, split 151, with halt 28
- A as first: 52% (128/248, 95% CI 45%–58%) · A as second: 57% (135/235, 95% CI 51%–64%) · first mover overall: 47% (228/483, 95% CI 43%–52%)
- Plies mean / median: 66.2 / 68.0 · games with a repeated position 37 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (300 ms) [fast eval] (A) | Alpha-Beta (300 ms) [reference eval] (B) |
|---|---:|---:|
| Wins (as first / as second) | 263 (128/135) | 220 (100/120) |
| Decision ms mean / median / P95 / max | 243 / 301 / 304 / 361 | 249 / 301 / 305 / 369 |
| Nodes per move (mean) · nodes/s | 12,204 · 50,216 | 8,560 · 34,384 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 7.84 / 6.0 | 7.39 / 6.0 |
| TT hit rate · cutoffs per move | 73.8% · 2,882 | 74.1% · 1,981 |
| Last iteration timed out · proven result | 77.8% · 21.9% | 79.4% · 20.4% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 22.5% · 7.46 | 22.0% · 7.27 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 8.0 · 13/22/34 | 9.0 · 14/22/36 |
| Walls left at end (mean) | 1.55 | 1.73 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.25 · 191 · 34 | 2.27 · 153 · 42 |
| Pawn moves away from goal · backtracks | 880 · 1124 | 982 · 1207 |
| Missed win-in-1 / available | 0 / 263 | 0 / 220 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 220 | 1 · 262 |

- Sessions 4 · commits d53d052909 · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0 · power ac

