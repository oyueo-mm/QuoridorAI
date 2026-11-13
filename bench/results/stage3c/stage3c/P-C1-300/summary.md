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

