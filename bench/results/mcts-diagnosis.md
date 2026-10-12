# MCTS weakness diagnosis

Source games: `mcts-benchmark-run2-before-fix.jsonl` (25 games). Reference evaluator: Alpha-Beta with the default distance evaluation.

## 1. Seat fairness (run 2)

| Row | MCTS as P1: games / W / L / halted | MCTS as P2: games / W / L / halted | Same openings for both seats |
|---|---|---|---|
| t500-ab | 6 / 0 / 6 / 0 | 6 / 0 / 5 / 1 | yes |
| t200-ab | 6 / 1 / 5 / 0 | 6 / 0 / 5 / 1 | yes |
| h1000-bfs | 1 / 1 / 0 / 0 | 0 / 0 / 0 / 0 | NO |

## 2. Rollout behaviour (400 rollouts per policy and position)

| Position | Policy | Ends with winner | Avg plies | Walls / rollout | Walls used by ply 20 | Pawn back-steps / rollout | Repeated positions / rollout | P1 win share | Mean value (P1 view) | Alpha-Beta d4 (P1 view) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| start | uniform | 9% | 97.9 | 20.0 | 19.4 | 29.98 | 21.88 | 49% | +0.09 | +0.50 |
| start | balanced | 16% | 96.3 | 20.0 | 10.0 | 27.91 | 13.70 | 45% | +0.10 | +0.50 |
| start | heuristic | 98% | 75.3 | 17.9 | 8.4 | 7.16 | 0.20 | 53% | +0.08 | +0.50 |
| opening (2,4) | uniform | 11% | 97.6 | 20.0 | 19.3 | 29.16 | 20.78 | 58% | +0.09 | +0.50 |
| opening (2,4) | balanced | 16% | 95.2 | 19.9 | 9.9 | 26.47 | 12.31 | 48% | +0.06 | +0.50 |
| opening (2,4) | heuristic | 98% | 75.9 | 18.0 | 9.1 | 7.21 | 0.24 | 43% | −0.05 | +0.50 |
| middlegame (t200 game 1, +20 plies) | uniform | 14% | 96.4 | 8.0 | 8.0 | 34.84 | 29.95 | 0% | −0.94 | −16.50 |
| middlegame (t200 game 1, +20 plies) | balanced | 18% | 95.1 | 8.0 | 7.3 | 34.12 | 25.09 | 0% | −0.95 | −16.50 |
| middlegame (t200 game 1, +20 plies) | heuristic | 100% | 34.8 | 3.1 | 3.0 | 3.08 | 0.22 | 1% | −0.98 | −16.50 |

## 3. Root visit / value distribution vs. budget

SE = standard error of Q (≈ √((1 − Q²)/N)). "Gap" = Q(best) − Q(2nd). "AB loss" = Alpha-Beta depth-4 value of the best move minus that of MCTS’s choice (0 = same quality).

| Position | Sims | Root moves | Top-3 (N, Q ± SE) | Gap | Chosen | AB best | AB loss |
|---|---:|---:|---|---:|---|---|---:|
| start | 150 | 19 | e7h 17, +0.41±0.22 · d8h 16, +0.38±0.23 · d6h 11, +0.20±0.30 | 0.037 | e7h | e2 | 2.00 |
| start | 1000 | 19 | d1 89, +0.08±0.11 · d2h 81, +0.06±0.11 · e4h 81, +0.06±0.11 | 0.015 | d1 | e2 | 1.00 |
| start | 5000 | 19 | e2 2070, +0.11±0.02 · d1 335, −0.06±0.05 · d2h 330, −0.07±0.05 | 0.176 | e2 | e2 | 0.00 |
| opening (2,4) | 150 | 18 | c2h 17, +0.29±0.23 · d2h 15, +0.20±0.25 · c1h 14, +0.14±0.26 | 0.094 | c2h | f3 | 1.00 |
| opening (2,4) | 1000 | 18 | c1h 142, +0.12±0.08 · d1h 97, +0.05±0.10 · d5h 81, +0.03±0.11 | 0.069 | c1h | f3 | 1.00 |
| opening (2,4) | 5000 | 18 | c1h 1328, +0.09±0.03 · c2h 861, +0.05±0.03 · d1h 520, +0.01±0.04 | 0.037 | c1h | f3 | 1.00 |
| middlegame (t200 game 1, +20 plies) | 150 | 9 | f2 17, −1.00±0.00 · e1 17, −1.00±0.00 · d3h 17, −1.00±0.00 | 0.000 | f2 | f2 | 0.00 |
| middlegame (t200 game 1, +20 plies) | 1000 | 9 | c2h 121, −0.98±0.02 · f2 110, −1.00±0.00 · e1 110, −1.00±0.00 | 0.017 | c2h | f2 | 1.00 |
| middlegame (t200 game 1, +20 plies) | 5000 | 9 | f2 580, −0.99±0.00 · c2v 580, −0.99±0.00 · e1 558, −1.00±0.00 | 0.000 | f2 | f2 | 0.00 |

## 4. Decisive mistakes in lost games (equal time vs Alpha-Beta)

### t200-ab, opening (0,0), MCTS = P1, seed 11, 42 plies, ≈396 simulations/move

| Ply | MCTS move | AB best | AB value before (MCTS view) | AB value after MCTS move | Loss | Walls MCTS:opp | d MCTS:opp |
|---:|---|---|---:|---:|---:|---|---|
| 1 | e2h | e2 | +0.50 | −1.50 | 2.00 | 10:10 | 8:8 |
| 3 | c1h | e2 | −1.50 | −2.50 | 1.00 | 9:10 | 9:8 |
| 5 | d6h | e2 | −3.50 | −5.50 | 2.00 | 8:10 | 9:8 |
| 9 | g2h | g1 | −5.50 | −7.50 | 2.00 | 7:10 | 9:6 |
| 13 | h3v | e2 | −9.50 | −11.50 | 2.00 | 6:9 | 12:7 |
| 17 | e3v | a1h | −11.50 | −14.50 | 3.00 | 4:7 | 16:8 |
| 31 | i2 | i4 | −16.50 | −18.50 | 2.00 | 3:2 | 24:6 |
| 35 | i2 | i4 | −18.50 | −20.50 | 2.00 | 3:2 | 24:4 |
| 39 | i2 | i4 | −9996.00 | −9997.00 | 1.00 | 3:2 | 24:2 |
| 41 | i3 | i3 | −9998.00 | −9999.00 | 1.00 | 3:2 | 25:1 |

Largest single loss: ply 17, MCTS played **e3v**, Alpha-Beta prefers **a1h** (loss 3.00). Re-running MCTS there with 396 simulations: e3v → N 43, Q −0.67; a1h → N 29, Q −0.79; root moves 13, top visits f1 50, e3v 43, b1v 36, e2 32.

### t200-ab, opening (0,0), MCTS = P1, seed 23, 36 plies, ≈168 simulations/move

| Ply | MCTS move | AB best | AB value before (MCTS view) | AB value after MCTS move | Loss | Walls MCTS:opp | d MCTS:opp |
|---:|---|---|---:|---:|---:|---|---|
| 1 | e3h | e2 | +0.50 | −1.50 | 2.00 | 10:10 | 8:8 |
| 3 | d1h | e2 | −1.50 | −3.50 | 2.00 | 9:10 | 9:8 |
| 5 | d3v | d1 | −3.50 | −5.50 | 2.00 | 8:10 | 10:8 |
| 11 | e2 | g2 | −5.50 | −6.50 | 1.00 | 7:10 | 8:5 |
| 15 | f3 | e2 | −7.50 | −8.50 | 1.00 | 7:9 | 9:4 |
| 21 | f1h | e2 | −8.50 | −10.50 | 2.00 | 6:9 | 9:4 |
| 25 | e2 | a3v | −7.50 | −8.50 | 1.00 | 4:7 | 11:5 |
| 31 | d2 | b2 | −8.50 | −10.50 | 2.00 | 4:6 | 10:3 |
| 33 | e2 | c2 | −9996.00 | −9997.00 | 1.00 | 4:6 | 11:2 |
| 35 | d2 | d2 | −9998.00 | −9999.00 | 1.00 | 4:6 | 12:1 |

Largest single loss: ply 1, MCTS played **e3h**, Alpha-Beta prefers **e2** (loss 2.00). Re-running MCTS there with 168 simulations: e3h → N 19, Q +0.34; e2 → N 15, Q +0.20; root moves 19, top visits e7h 21, e3h 19, d4h 16, e2 15.

### t500-ab, opening (0,0), MCTS = P1, seed 11, 58 plies, ≈439 simulations/move

| Ply | MCTS move | AB best | AB value before (MCTS view) | AB value after MCTS move | Loss | Walls MCTS:opp | d MCTS:opp |
|---:|---|---|---:|---:|---:|---|---|
| 1 | d3h | e2 | +0.50 | −1.50 | 2.00 | 10:10 | 8:8 |
| 3 | e3v | e2 | −1.50 | −3.50 | 2.00 | 9:10 | 9:8 |
| 5 | f4h | e2 | −3.50 | −5.50 | 2.00 | 8:10 | 9:7 |
| 7 | c1h | e2 | −5.50 | −6.50 | 1.00 | 7:10 | 10:7 |
| 21 | f1 | e7h | −3.50 | −4.50 | 1.00 | 2:8 | 13:13 |
| 27 | g1 | e1 | −3.50 | −5.50 | 2.00 | 0:8 | 12:16 |
| 55 | h6 | g7 | −9996.00 | −9997.00 | 1.00 | 0:7 | 5:2 |
| 57 | h7 | h7 | −9998.00 | −9999.00 | 1.00 | 0:7 | 4:1 |

Largest single loss: ply 1, MCTS played **d3h**, Alpha-Beta prefers **e2** (loss 2.00). Re-running MCTS there with 439 simulations: d3h → N 32, Q +0.03; e2 → N 29, Q +0.03; root moves 19, top visits f1 45, d6h 41, d1h 37, d3h 32.

## 5. Small experiment: rollout length (5 positions × 3 seeds, before any fix)

Reference = Alpha-Beta depth-4 loss of the chosen move (lower is better; Alpha-Beta's own evaluation is the yardstick, so it is a proxy, not ground truth). `rolloutMaxPlies 0` = no rollout, the leaf is valued by the distance estimate only.

| Rollout max plies | Sims | Avg AB loss | Wall chosen | ms / decision |
|---:|---:|---:|---:|---:|
| 100 (default) | 150 | 1.00 | 12/15 | 447 |
| 100 (default) | 1000 | 1.27 | 11/15 | 3845 |
| 10 | 150 | 0.80 | 8/15 | 116 |
| 10 | 1000 | 1.20 | 13/15 | 773 |
| 4 | 150 | 0.60 | 9/15 | 49 |
| 4 | 1000 | 0.60 | 9/15 | 352 |
| 0 | 150 | 0.40 | 6/15 | 4 |
| 0 | 1000 | 0.60 | 9/15 | 48 |

More simulations with long rollouts do not reduce the loss (1.00 → 1.27): the error is a bias of the rollout policy, not only noise. Short rollouts are both more accurate and 10–100× cheaper.
