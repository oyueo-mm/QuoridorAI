## T10000-ab-vs-guided

Alpha-Beta vs Guided MCTS, 10 s per move (smoke-sized sample)

- Completed 8 / 8 scheduled games · config `5fa08edc9ea4c14d` · budget equal-time
- Decisive 8; halted: repetition 0, max plies 0, game time 0, user 0
- Distinct start positions 4 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (10000 ms)) win rate: 38% (3/8, 95% CI 14%–69%)** · Elo(A−B) -89 (95% CI -320 … +142, n=8)
- Pair score of A (unit = opening pair, halt-free pairs): 0.375 (95% CI 0.130–0.620, n=4) · sweeps A 0 / B 1, split 3, with halt 0
- A as first: 25% (1/4, 95% CI 5%–70%) · A as second: 50% (2/4, 95% CI 15%–85%) · first mover overall: 38% (3/8, 95% CI 14%–69%)
- Plies mean / median: 72.4 / 71.5 · games with a repeated position 0 (max 1×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (10000 ms) (A) | Guided MCTS (10000 ms) (B) |
|---|---:|---:|
| Wins (as first / as second) | 3 (1/2) | 5 (2/3) |
| Decision ms mean / median / P95 / max | 7,382 / 10,001 / 10,007 / 10,225 | 7,872 / 10,000 / 10,002 / 10,024 |
| Nodes per move (mean) · nodes/s | 164,495 · 22,285 | 23,425 · 2,976 |
| Simulations per move · sims/s | — · — | 25,082 · 3,186 |
| Depth mean / median (AB: completed; MCTS: max tree) | 11.04 / 9.0 | 20.57 / 20.0 |
| TT hit rate · cutoffs per move | 67.0% · 37,639 | — · — |
| Last iteration timed out · proven result | 70.9% · 29.1% | — · 23.1% |
| MCTS top-move visit share · visit entropy (bits) | — · — | 73.8% · 1.08 |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 21.5% · 7.75 | 22.4% · 8.13 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 3.0 · 7/15/31 | 4.0 · 9/17/32 |
| Walls left at end (mean) | 1.50 | 1.13 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.02 · 5 · 0 | 2.18 · 8 · 0 |
| Pawn moves away from goal · backtracks | 16 · 15 | 21 · 30 |
| Missed win-in-1 / available | 0 / 3 | 0 / 5 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 5 | 0 · 3 |

- Sessions 4 · commits ba3194882a+dirty-src, 73655eb7a7 · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

