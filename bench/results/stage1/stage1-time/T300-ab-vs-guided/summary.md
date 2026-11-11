## T300-ab-vs-guided

Alpha-Beta vs Guided MCTS, 300 ms per move

- Completed 200 / 200 scheduled games · config `0c6f5d3f8f4b4a8a` · budget equal-time
- Decisive 199; halted: repetition 1, max plies 0, game time 0, user 0
- Distinct start positions 100 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms)) win rate: 54% (108/199, 95% CI 47%–61%)** · Elo(A−B) +30 (95% CI -19 … +78, n=199)
- Pair score of A (unit = opening pair, halt-free pairs): 0.545 (95% CI 0.479–0.612, n=99) · sweeps A 27 / B 18, split 54, with halt 1
- A as first: 58% (58/100, 95% CI 48%–67%) · A as second: 51% (50/99, 95% CI 41%–60%) · first mover overall: 54% (107/199, 95% CI 47%–61%)
- Plies mean / median: 72.3 / 72.5 · games with a repeated position 2 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (300 ms) (A) | Guided MCTS (300 ms) (B) |
|---|---:|---:|
| Wins (as first / as second) | 108 (58/50) | 91 (49/42) |
| Decision ms mean / median / P95 / max | 242 / 301 / 303 / 409 | 257 / 300 / 301 / 350 |
| Nodes per move (mean) · nodes/s | 11,140 · 46,083 | 1,539 · 5,989 |
| Simulations per move · sims/s | — · — | 1,692 · 6,586 |
| Depth mean / median (AB: completed; MCTS: max tree) | 8.27 / 6.0 | 13.81 / 11.0 |
| TT hit rate · cutoffs per move | 64.0% · 2,484 | — · — |
| Last iteration timed out · proven result | 76.4% · 22.9% | — · 16.6% |
| MCTS top-move visit share · visit entropy (bits) | — · — | 63.3% · 1.52 |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 22.6% · 8.18 | 23.8% · 8.59 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 7.0 · 12/21/36 | 6.0 · 11/18/28 |
| Walls left at end (mean) | 1.08 | 0.66 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.40 · 98 · 9 | 2.31 · 64 · 5 |
| Pawn moves away from goal · backtracks | 214 · 404 | 475 · 598 |
| Missed win-in-1 / available | 0 / 108 | 0 / 91 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 91 | 0 · 108 |

- Sessions 4 · commits dd2c516435 · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

