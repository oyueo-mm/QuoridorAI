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

