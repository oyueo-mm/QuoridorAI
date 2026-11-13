# stage3c

Stage 3-C: search package C1 (typed TT, PVS, persistent TT, verified partial iteration) vs baseline, 300 ms; E6 vs Guided baseline.

## G-E6-vs-guided-300

Baseline: Alpha-Beta (E6) vs Guided MCTS, 300 ms per move, 100 pairs

- Completed 200 / 200 scheduled games · config `4a21fb7236859cc6` · budget equal-time
- Machine CPU busy during games: mean 61%, max 74%
- Decisive 197; halted: repetition 3, max plies 0, game time 0, user 0
- Distinct start positions 100 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms) [E6 (default)]) win rate: 72% (142/197, 95% CI 65%–78%)** · Elo(A−B) +165 (95% CI +111 … +219, n=197)
- Pair score of A (unit = opening pair, halt-free pairs): 0.722 (95% CI 0.657–0.786, n=97) · sweeps A 51 / B 8, split 38, with halt 3
- A as first: 75% (74/99, 95% CI 65%–82%) · A as second: 69% (68/98, 95% CI 60%–78%) · first mover overall: 53% (104/197, 95% CI 46%–60%)
- Plies mean / median: 64.5 / 66.0 · games with a repeated position 4 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (300 ms) [E6 (default)] (A) | Guided MCTS (300 ms) (B) |
|---|---:|---:|
| Wins (as first / as second) | 142 (74/68) | 55 (30/25) |
| Decision ms mean / median / P95 / max | 253 / 301 / 304 / 361 | 261 / 300 / 301 / 353 |
| Nodes per move (mean) · nodes/s | 8,485 · 33,579 | 1,489 · 5,711 |
| Simulations per move · sims/s | — · — | 1,621 · 6,217 |
| Depth mean / median (AB: completed; MCTS: max tree) | 6.96 / 6.0 | 13.05 / 11.0 |
| TT hit rate · cutoffs per move | 64.1% · 1,882 | — · — |
| Last iteration timed out · proven result | 80.6% · 19.2% | — · 15.4% |
| MCTS top-move visit share · visit entropy (bits) | — · — | 58.6% · 1.66 |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 19.2% · 6.23 | 25.4% · 8.16 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 10.0 · 15/24/38 | 5.5 · 10/17/25 |
| Walls left at end (mean) | 2.79 | 0.86 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.77 · 46 · 10 | 2.20 · 70 · 8 |
| Pawn moves away from goal · backtracks | 190 · 310 | 614 · 759 |
| Missed win-in-1 / available | 0 / 142 | 0 / 55 |
| Allowed opponent win-in-1: avoidable · forced | 1 · 54 | 0 · 142 |

- Sessions 4 · commits 98a10da00e · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0 · power ac

## P-C1-300

Pilot (40 pairs): search package C1 vs baseline search, both E6, 300 ms

- Completed 80 / 80 scheduled games · config `a5c07d77085e9be9` · budget equal-time
- Machine CPU busy during games: mean 66%, max 78%
- Decisive 75; halted: repetition 5, max plies 0, game time 0, user 0
- Distinct start positions 40 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms) [C1]) win rate: 59% (44/75, 95% CI 47%–69%)** · Elo(A−B) +61 (95% CI -18 … +140, n=75)
- Pair score of A (unit = opening pair, halt-free pairs): 0.597 (95% CI 0.495–0.699, n=36) · sweeps A 11 / B 4, split 21, with halt 4
- A as first: 56% (20/36, 95% CI 40%–70%) · A as second: 62% (24/39, 95% CI 46%–75%) · first mover overall: 47% (35/75, 95% CI 36%–58%)
- Plies mean / median: 69.7 / 70.5 · games with a repeated position 5 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (300 ms) [C1] (A) | Alpha-Beta (300 ms) [baseline search] (B) |
|---|---:|---:|
| Wins (as first / as second) | 44 (20/24) | 31 (15/16) |
| Decision ms mean / median / P95 / max | 251 / 301 / 304 / 341 | 253 / 301 / 304 / 354 |
| Nodes per move (mean) · nodes/s | 8,389 · 33,445 | 7,728 · 30,574 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 7.35 / 6.0 | 7.20 / 6.0 |
| TT hit rate · cutoffs per move | 73.1% · 1,943 | 62.2% · 1,767 |
| Last iteration timed out · proven result | 79.8% · 19.3% | 80.6% · 18.7% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 22.5% · 7.85 | 21.9% · 7.63 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 8.0 · 14/23/35 | 8.0 · 15/24/37 |
| Walls left at end (mean) | 1.29 | 1.51 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.28 · 28 · 4 | 2.18 · 28 · 4 |
| Pawn moves away from goal · backtracks | 170 · 240 | 155 · 223 |
| Missed win-in-1 / available | 0 / 44 | 0 / 31 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 31 | 0 · 44 |

- Sessions 4 · commits 98a10da00e · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0 · power ac

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

