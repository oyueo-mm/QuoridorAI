# MCTS improvement — step C

- 2026-10-12 09:56 UTC · Node v24.19.0 · Intel(R) Core(TM) Ultra 7 256V
- Budget 200 ms per decision (iterations unlimited) · seeds 1, 2, 3 · AB loss = Alpha-Beta d4 value of its best move − d3 value after MCTS's move (MCTS view; proxy, not ground truth).
- Games: vs Alpha-Beta 200 ms, openings (0,0), (1,2) [tuning] and (10,2) [held-out], both seats, MCTS seed 11, max 200 plies, halt on 3× repetition.

## Decisions on fixed positions

| Config | Set | AB loss (mean) | Best-move agreement | Wall chosen | Sims/decision | Root moves visited | Top-move share | Visit entropy (bits) | Max tree depth | Suspect |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A(4) + PUCT | tuning | 0.00 | 15/15 | 0/15 | 580 | 18.60 | 78% | 1.49 | 12.33 | 0 |
| A(4) + PUCT | held-out | 0.28 | 13/18 | 8/18 | 656 | 13.67 | 71% | 1.55 | 10.50 | 0 |
| A(4) + PUCT + value shaping | tuning | 0.00 | 15/15 | 0/15 | 353 | 18.60 | 63% | 2.28 | 8.93 | 0 |
| A(4) + PUCT + value shaping | held-out | 0.22 | 14/18 | 7/18 | 625 | 13.67 | 57% | 2.17 | 9.33 | 0 |

## Games vs Alpha-Beta 200 ms

| Config | Set | W | L | Halted (rep / plies) | Avg plies | MCTS ms/move | Sims/move | Suspect moves |
|---|---|---:|---:|---|---:|---:|---:|---:|
| A(4) + PUCT | tuning | 3 | 1 | 0 / 0 | 67.8 | 166 | 1157 | 0 |
| A(4) + PUCT | held-out | 0 | 2 | 0 / 0 | 55.5 | 177 | 1065 | 0 |
| A(4) + PUCT + value shaping | tuning | 4 | 0 | 0 / 0 | 67.0 | 168 | 1257 | 0 |
| A(4) + PUCT + value shaping | held-out | 0 | 2 | 0 / 0 | 68.5 | 174 | 1176 | 0 |

Raw records: `step-C.jsonl`.
