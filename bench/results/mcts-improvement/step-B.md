# MCTS improvement — step B

- 2026-10-12 09:54 UTC · Node v24.19.0 · Intel(R) Core(TM) Ultra 7 256V
- Budget 200 ms per decision (iterations unlimited) · seeds 1, 2, 3 · AB loss = Alpha-Beta d4 value of its best move − d3 value after MCTS's move (MCTS view; proxy, not ground truth).
- Games: vs Alpha-Beta 200 ms, openings (0,0), (1,2) [tuning] and (10,2) [held-out], both seats, MCTS seed 11, max 200 plies, halt on 3× repetition.

## Decisions on fixed positions

| Config | Set | AB loss (mean) | Best-move agreement | Wall chosen | Sims/decision | Root moves visited | Top-move share | Visit entropy (bits) | Max tree depth | Suspect |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A(4) + UCT | tuning | 0.07 | 14/15 | 0/15 | 502 | 18.60 | 12% | 4.09 | 3.13 | 0 |
| A(4) + UCT | held-out | 0.33 | 12/18 | 9/18 | 850 | 13.67 | 24% | 3.36 | 4.67 | 0 |
| A(4) + PUCT priors | tuning | 0.00 | 15/15 | 0/15 | 369 | 18.60 | 75% | 1.65 | 11.00 | 0 |
| A(4) + PUCT priors | held-out | 0.28 | 13/18 | 8/18 | 621 | 13.67 | 71% | 1.56 | 10.50 | 0 |

## Games vs Alpha-Beta 200 ms

| Config | Set | W | L | Halted (rep / plies) | Avg plies | MCTS ms/move | Sims/move | Suspect moves |
|---|---|---:|---:|---|---:|---:|---:|---:|
| A(4) + UCT | tuning | 0 | 4 | 0 / 0 | 56.0 | 180 | 1024 | 0 |
| A(4) + UCT | held-out | 1 | 1 | 0 / 0 | 59.0 | 184 | 1338 | 0 |
| A(4) + PUCT priors | tuning | 1 | 3 | 0 / 0 | 72.3 | 178 | 991 | 0 |
| A(4) + PUCT priors | held-out | 0 | 2 | 0 / 0 | 56.5 | 174 | 875 | 0 |

Raw records: `step-B.jsonl`.
