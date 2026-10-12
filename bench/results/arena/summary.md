# Stage 5 — Arena experiments (small samples)

- 2026-10-12 10:30 UTC · Node v24.19.0 · Intel(R) Core(TM) Ultra 7 256V
- Paired matches: every opening is played twice with seats swapped. Openings: 4 random pawn plies from new seeds (7001–7004), never used before.
- Win rate = share of decisive games (rule wins); halts (repetition / max plies / time / user) are reported separately and excluded. 95 % Wilson intervals.
- Equal Time and Fixed Budget experiments are separate and must not be pooled.

## E1-pure-vs-guided-equal-time: Pure MCTS vs Guided MCTS — equal time 300 ms

| | Pure MCTS (300 ms) (A) | Guided MCTS (300 ms) (B) |
|---|---:|---:|
| Wins (as first / second) | 1 (1/0) | 7 (4/3) |
| Decision ms mean / median | 270 / 300 | 254 / 300 |
| Walls used per game | 9.4 | 8.3 |
| Nodes / simulations / depth per move | 531 / 530 / 4.2 | 1348 / 1522 / 11.7 |

- Games 8, decisive 8, halted: repetition 0, max plies 0, time 0, user 0
- **A win rate: 13% (1/8, 95% CI 2%–47%)**
- First-mover win rate: 63% (5/8, 95% CI 31%–86%) · pairs: A swept 0, B swept 3, split 1, with halt 0
- Plies mean / median: 62.4 / 60.0 · wall time 2.2 min · suspect decisions 0 · reproducibility: n/a (equal time is machine-dependent)

## E2-bfs-vs-alphabeta-fixed: BFS vs Alpha-Beta — fixed budget (depth 3)

| | BFS (A) | Alpha-Beta (깊이 3) (B) |
|---|---:|---:|
| Wins (as first / second) | 1 (0/1) | 7 (3/4) |
| Decision ms mean / median | 2 / 2 | 6 / 3 |
| Walls used per game | 9.0 | 9.5 |
| Nodes / simulations / depth per move | 78 / — / 1.0 | 226 / — / 3.0 |

- Games 8, decisive 8, halted: repetition 0, max plies 0, time 0, user 0
- **A win rate: 13% (1/8, 95% CI 2%–47%)**
- First-mover win rate: 38% (3/8, 95% CI 14%–69%) · pairs: A swept 0, B swept 3, split 1, with halt 0
- Plies mean / median: 78.6 / 77.0 · wall time 0.0 min · suspect decisions 0 · reproducibility: identical replay of game 1 ✓

## E3-alphabeta-vs-guided-equal-time: Alpha-Beta vs Guided MCTS — equal time 300 ms

| | Alpha-Beta (300 ms) (A) | Guided MCTS (300 ms) (B) |
|---|---:|---:|
| Wins (as first / second) | 7 (4/3) | 1 (1/0) |
| Decision ms mean / median | 244 / 301 | 261 / 300 |
| Walls used per game | 8.8 | 7.3 |
| Nodes / simulations / depth per move | 12670 / — / 7.5 | 1551 / 1700 / 12.2 |

- Games 8, decisive 8, halted: repetition 0, max plies 0, time 0, user 0
- **A win rate: 88% (7/8, 95% CI 53%–98%)**
- First-mover win rate: 63% (5/8, 95% CI 31%–86%) · pairs: A swept 3, B swept 0, split 1, with halt 0
- Plies mean / median: 60.6 / 59.0 · wall time 2.0 min · suspect decisions 0 · reproducibility: n/a (equal time is machine-dependent)

## E4-alphabeta-vs-guided-fixed: Alpha-Beta (depth 4) vs Guided MCTS (3000 simulations) — fixed budget

| | Alpha-Beta (깊이 4) (A) | Guided MCTS (3000회) (B) |
|---|---:|---:|
| Wins (as first / second) | 2 (1/1) | 6 (3/3) |
| Decision ms mean / median | 18 / 12 | 689 / 639 |
| Walls used per game | 7.0 | 10.0 |
| Nodes / simulations / depth per move | 623 / — / 3.9 | 2506 / 2574 / 14.2 |

- Games 8, decisive 8, halted: repetition 0, max plies 0, time 0, user 0
- **A win rate: 25% (2/8, 95% CI 7%–59%)**
- First-mover win rate: 50% (4/8, 95% CI 22%–78%) · pairs: A swept 0, B swept 2, split 2, with halt 0
- Plies mean / median: 69.0 / 69.5 · wall time 3.5 min · suspect decisions 0 · reproducibility: identical replay of game 1 ✓

