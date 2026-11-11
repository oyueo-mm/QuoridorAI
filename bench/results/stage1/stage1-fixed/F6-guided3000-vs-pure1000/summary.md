## F6-guided3000-vs-pure1000

Guided MCTS 3000 vs Pure MCTS 1000 simulations

- Completed 100 / 100 scheduled games · config `b305071a9a350afa` · budget fixed
- Decisive 99; halted: repetition 1, max plies 0, game time 0, user 0
- Distinct start positions 50 · games duplicating an earlier game move-for-move 0
- **A (Guided MCTS (3000회)) win rate: 69% (68/99, 95% CI 59%–77%)** · Elo(A−B) +136 (95% CI +63 … +210, n=99)
- Pair score of A (unit = opening pair, halt-free pairs): 0.684 (95% CI 0.595–0.773, n=49) · sweeps A 22 / B 4, split 23, with halt 1
- A as first: 66% (33/50, 95% CI 52%–78%) · A as second: 71% (35/49, 95% CI 58%–82%) · first mover overall: 47% (47/99, 95% CI 38%–57%)
- Plies mean / median: 67.5 / 70.0 · games with a repeated position 9 (max 3×) · over-budget moves (>3× time) 0

| Search | Guided MCTS (3000회) (A) | Pure MCTS (1000회) (B) |
|---|---:|---:|
| Wins (as first / as second) | 68 (33/35) | 31 (14/17) |
| Decision ms mean / median / P95 / max | 667 / 567 / 1,542 / 3,423 | 1,174 / 743 / 3,315 / 7,558 |
| Nodes per move (mean) · nodes/s | 2,491 · 3,736 | 915 · 779 |
| Simulations per move · sims/s | 2,579 · 3,868 | 914 · 779 |
| Depth mean / median (AB: completed; MCTS: max tree) | 15.31 / 13.0 | 6.16 / 5.0 |
| TT hit rate · cutoffs per move | — · — | — · — |
| Last iteration timed out · proven result | — · 16.5% | — · 9.7% |
| MCTS top-move visit share · visit entropy (bits) | 62.5% · 1.63 | 36.4% · 2.44 |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 25.7% · 8.69 | 24.6% · 8.29 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 6.0 · 13/21/30 | 1.0 · 7/17/30 |
| Walls left at end (mean) | 0.56 | 0.96 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.26 · 60 · 0 | 1.56 · 196 · 13 |
| Pawn moves away from goal · backtracks | 313 · 294 | 252 · 379 |
| Missed win-in-1 / available | 0 / 68 | 0 / 31 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 31 | 0 · 68 |

- Sessions 6 · commits 36818c6b7e · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0

