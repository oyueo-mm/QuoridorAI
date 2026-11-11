## F5-ab4-vs-guided3000

Alpha-Beta depth 4 vs Guided MCTS 3000 simulations

- Completed 200 / 200 scheduled games · config `41e42372449e8027` · budget fixed
- Decisive 199; halted: repetition 1, max plies 0, game time 0, user 0
- Distinct start positions 100 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (깊이 4)) win rate: 26% (51/199, 95% CI 20%–32%)** · Elo(A−B) -185 (95% CI -240 … -130, n=199)
- Pair score of A (unit = opening pair, halt-free pairs): 0.258 (95% CI 0.197–0.318, n=99) · sweeps A 6 / B 54, split 39, with halt 1
- A as first: 30% (30/99, 95% CI 22%–40%) · A as second: 21% (21/100, 95% CI 14%–30%) · first mover overall: 55% (109/199, 95% CI 48%–62%)
- Plies mean / median: 61.9 / 65.0 · games with a repeated position 1 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (깊이 4) (A) | Guided MCTS (3000회) (B) |
|---|---:|---:|
| Wins (as first / as second) | 51 (30/21) | 148 (79/69) |
| Decision ms mean / median / P95 / max | 22 / 12 / 73 / 1,538 | 835 / 685 / 2,284 / 10,503 |
| Nodes per move (mean) · nodes/s | 612 · 27,276 | 2,472 · 2,960 |
| Simulations per move · sims/s | — · — | 2,553 · 3,057 |
| Depth mean / median (AB: completed; MCTS: max tree) | 3.92 / 4.0 | 14.74 / 13.0 |
| TT hit rate · cutoffs per move | 28.0% · 137 | — · — |
| Last iteration timed out · proven result | 0.0% · 6.5% | — · 17.0% |
| MCTS top-move visit share · visit entropy (bits) | — · — | 69.1% · 1.32 |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 19.9% · 6.15 | 28.0% · 8.71 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 9.0 · 14/28/46 | 5.0 · 10/16/23 |
| Walls left at end (mean) | 2.99 | 0.43 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.32 · 40 · 18 | 2.39 · 76 · 2 |
| Pawn moves away from goal · backtracks | 191 · 304 | 251 · 444 |
| Missed win-in-1 / available | 0 / 51 | 0 / 148 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 148 | 0 · 51 |

- Sessions 6 · commits 36818c6b7e · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

