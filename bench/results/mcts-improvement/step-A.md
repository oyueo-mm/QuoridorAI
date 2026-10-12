# MCTS improvement — step A

- 2026-10-12 09:48 UTC · Node v24.19.0 · Intel(R) Core(TM) Ultra 7 256V
- Budget 200 ms per decision (iterations unlimited) · seeds 1, 2, 3 · AB loss = Alpha-Beta d4 value of its best move − d3 value after MCTS's move (MCTS view; proxy, not ground truth).
- Games: vs Alpha-Beta 200 ms, openings (0,0), (1,2) [tuning] and (10,2) [held-out], both seats, MCTS seed 11, max 200 plies, halt on 3× repetition.

## Decisions on fixed positions

| Config | Set | AB loss (mean) | Best-move agreement | Wall chosen | Sims/decision | Root moves visited | Top-move share | Visit entropy (bits) | Max tree depth | Suspect |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| pure (baseline) | tuning | 1.00 | 5/15 | 10/15 | 34 | 18.60 | 11% | 4.04 | 2.00 | 0 |
| pure (baseline) | held-out | 0.89 | 5/18 | 12/18 | 72 | 13.17 | 19% | 3.36 | 2.72 | 0 |
| A: eval cut-off, 0 plies | tuning | 0.00 | 15/15 | 0/15 | 5516 | 18.60 | 61% | 2.53 | 6.40 | 0 |
| A: eval cut-off, 0 plies | held-out | 0.11 | 16/18 | 5/18 | 5447 | 13.67 | 54% | 2.42 | 6.72 | 0 |
| A: eval cut-off, 2 plies | tuning | 0.00 | 15/15 | 0/15 | 632 | 18.60 | 12% | 4.11 | 3.20 | 0 |
| A: eval cut-off, 2 plies | held-out | 0.28 | 13/18 | 8/18 | 1401 | 13.67 | 27% | 3.27 | 4.89 | 0 |
| A: eval cut-off, 4 plies | tuning | 0.07 | 14/15 | 0/15 | 385 | 18.60 | 13% | 4.09 | 3.00 | 0 |
| A: eval cut-off, 4 plies | held-out | 0.33 | 12/18 | 9/18 | 856 | 13.67 | 24% | 3.36 | 4.67 | 0 |

## Games vs Alpha-Beta 200 ms

| Config | Set | W | L | Halted (rep / plies) | Avg plies | MCTS ms/move | Sims/move | Suspect moves |
|---|---|---:|---:|---|---:|---:|---:|---:|
| pure (baseline) | tuning | 0 | 4 | 0 / 0 | 76.0 | 183 | 328 | 0 |
| pure (baseline) | held-out | 0 | 2 | 0 / 0 | 70.5 | 187 | 331 | 0 |
| A: eval cut-off, 0 plies | tuning | 0 | 4 | 0 / 0 | 56.0 | 173 | 5198 | 0 |
| A: eval cut-off, 0 plies | held-out | 0 | 2 | 0 / 0 | 77.5 | 178 | 5967 | 0 |
| A: eval cut-off, 2 plies | tuning | 0 | 4 | 0 / 0 | 71.0 | 181 | 1985 | 0 |
| A: eval cut-off, 2 plies | held-out | 0 | 2 | 0 / 0 | 55.5 | 181 | 1678 | 0 |
| A: eval cut-off, 4 plies | tuning | 1 | 3 | 0 / 0 | 65.8 | 174 | 1385 | 0 |
| A: eval cut-off, 4 plies | held-out | 1 | 1 | 0 / 0 | 53.0 | 178 | 1134 | 0 |

Raw records: `step-A.jsonl`.
