# MCTS match evaluation

- Date: 2026-10-12 07:08 UTC · Node v24.19.0 · CPU: Intel(R) Core(TM) Ultra 7 256V
- Openings (seed, random pawn plies): (0, 0), (1, 2), (2, 4) · MCTS seeds 11, 23 · both seats → up to 12 games per row
- Per game: max 200 plies, 90 s wall clock, halt on 3× repeated position. Halts have no winner.
- MCTS defaults unless noted: UCT C = 1.4, heuristic rollout (walls only when the opponent leads), rollout max 100 plies, distance cutoff, wall filter opponent-path.
- Every game with settings, seeds and moves: `mcts-benchmark.jsonl` (one JSON object per line).

## Individual search budgets (deterministic)

| MCTS | Opponent | Games | MCTS W | L | Halted (plies/rep/time) | Win rate | MCTS ms/move | Opp. ms/move | Sims/move | Tree nodes/move | Opp. nodes/move | Avg plies |
|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| MCTS heuristic 1000 sims | BFS | 1 | 1 | 0 | 0/0/0 | 100% | 1,789.2 | 3.1 | 949 | 950 | — | 77.0 |
| MCTS heuristic 1000 sims | Alpha-Beta depth 3 | 0 | — | — | — | — | — | — | — | — | — | — |
| MCTS heuristic 300 sims | BFS | 0 | — | — | — | — | — | — | — | — | — | — |
| MCTS balanced 1000 sims | BFS | 0 | — | — | — | — | — | — | — | — | — | — |
| MCTS uniform 1000 sims | BFS | 0 | — | — | — | — | — | — | — | — | — | — |
| MCTS heuristic 1000 sims | Alpha-Beta depth 5 | 0 | — | — | — | — | — | — | — | — | — | — |

## Equal time per move (machine-dependent)

| MCTS | Opponent | Games | MCTS W | L | Halted (plies/rep/time) | Win rate | MCTS ms/move | Opp. ms/move | Sims/move | Tree nodes/move | Opp. nodes/move | Avg plies |
|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|
| MCTS heuristic 500 ms | Alpha-Beta 500 ms | 12 | 0 | 11 | 0/1/0 | 0% | 451.3 | 418.0 | 818 | 819 | 22,087 | 58.1 |
| MCTS heuristic 200 ms | Alpha-Beta 200 ms | 12 | 1 | 10 | 0/1/0 | 8% | 181.0 | 168.8 | 372 | 373 | 11,276 | 53.1 |

## Per-game results

| Row | Opening | MCTS seat | Seed | Result | Plies | Seconds |
|---|---|---:|---:|---|---:|---:|
| t500-ab | (0, 0) | P1 | 11 | mcts-loss | 58 | 25.4 |
| t500-ab | (0, 0) | P1 | 23 | mcts-loss | 54 | 22.2 |
| t500-ab | (0, 0) | P2 | 11 | mcts-loss | 61 | 27.4 |
| t500-ab | (0, 0) | P2 | 23 | mcts-loss | 43 | 18.8 |
| t500-ab | (1, 2) | P1 | 11 | mcts-loss | 76 | 30.8 |
| t500-ab | (1, 2) | P1 | 23 | mcts-loss | 74 | 29.3 |
| t500-ab | (1, 2) | P2 | 11 | halted-repetition | 44 | 21.6 |
| t500-ab | (1, 2) | P2 | 23 | mcts-loss | 81 | 37.0 |
| t500-ab | (2, 4) | P1 | 11 | mcts-loss | 60 | 27.1 |
| t500-ab | (2, 4) | P1 | 23 | mcts-loss | 48 | 21.6 |
| t500-ab | (2, 4) | P2 | 11 | mcts-loss | 23 | 8.8 |
| t500-ab | (2, 4) | P2 | 23 | mcts-loss | 75 | 33.9 |
| t200-ab | (0, 0) | P1 | 11 | mcts-loss | 42 | 7.3 |
| t200-ab | (0, 0) | P1 | 23 | mcts-loss | 36 | 6.1 |
| t200-ab | (0, 0) | P2 | 11 | mcts-loss | 47 | 7.7 |
| t200-ab | (0, 0) | P2 | 23 | mcts-loss | 61 | 11.0 |
| t200-ab | (1, 2) | P1 | 11 | mcts-loss | 58 | 9.2 |
| t200-ab | (1, 2) | P1 | 23 | mcts-loss | 46 | 7.9 |
| t200-ab | (1, 2) | P2 | 11 | halted-repetition | 41 | 8.2 |
| t200-ab | (1, 2) | P2 | 23 | mcts-loss | 61 | 10.9 |
| t200-ab | (2, 4) | P1 | 11 | mcts-loss | 44 | 7.9 |
| t200-ab | (2, 4) | P1 | 23 | mcts-win | 51 | 8.2 |
| t200-ab | (2, 4) | P2 | 11 | mcts-loss | 63 | 11.3 |
| t200-ab | (2, 4) | P2 | 23 | mcts-loss | 87 | 15.8 |
| h1000-bfs | (0, 0) | P1 | 11 | mcts-win | 77 | 69.9 |
