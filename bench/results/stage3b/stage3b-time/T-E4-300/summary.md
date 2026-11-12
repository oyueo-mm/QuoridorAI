## T-E4-300

Evaluation E4 vs current evaluation, Alpha-Beta 300 ms per move

- Completed 420 / 1200 scheduled games · config `8f27aa63ac5908fd` · budget equal-time
- **SPRT: H0 accepted — reject · LLR -3.11 in [-2.94, 2.94] · 192 pairs (LL 47 / split 106 / WW 39) · pair score 0.479 (95% CI 0.432–0.527) · Elo -14 (-48 … +18) · H0: Elo=0 vs H1: Elo=30, α=0.05, β=0.05**
- Machine CPU busy during games: mean 56%, max 71%
- Decisive 410; halted: repetition 10, max plies 0, game time 0, user 0
- Distinct start positions 211 · games duplicating an earlier game move-for-move 0
- **A (Alpha-Beta (300 ms) [E4]) win rate: 47% (194/410, 95% CI 43%–52%)** · Elo(A−B) -19 (95% CI -52 … +15, n=410)
- Pair score of A (unit = opening pair, halt-free pairs): 0.475 (95% CI 0.428–0.522, n=199) · sweeps A 40 / B 50, split 109, with halt 10
- A as first: 43% (91/210, 95% CI 37%–50%) · A as second: 52% (103/200, 95% CI 45%–58%) · first mover overall: 46% (188/410, 95% CI 41%–51%)
- Plies mean / median: 68.0 / 69.0 · games with a repeated position 11 (max 3×) · over-budget moves (>3× time) 0

| Search | Alpha-Beta (300 ms) [E4] (A) | Alpha-Beta (300 ms) [current eval] (B) |
|---|---:|---:|
| Wins (as first / as second) | 194 (91/103) | 216 (97/119) |
| Decision ms mean / median / P95 / max | 265 / 303 / 312 / 404 | 246 / 301 / 303 / 362 |
| Nodes per move (mean) · nodes/s | 2,370 · 8,935 | 12,009 · 48,886 |
| Simulations per move · sims/s | — · — | — · — |
| Depth mean / median (AB: completed; MCTS: max tree) | 5.80 / 5.0 | 7.86 / 6.0 |
| TT hit rate · cutoffs per move | 52.4% · 521 | 57.6% · 2,692 |
| Last iteration timed out · proven result | 84.2% · 15.7% | 78.2% · 21.4% |
| MCTS top-move visit share · visit entropy (bits) | — · — | — · — |

| Strategy | A | B |
|---|---:|---:|
| Wall share of moves · walls per game | 23.5% · 7.98 | 22.8% · 7.76 |
| First wall ply (median) · wall ply Q1/Q2/Q3 | 7.0 · 12/19/30 | 7.0 · 12/20/33 |
| Walls left at end (mean) | 1.12 | 1.34 |
| Opponent path gain per wall · walls without gain · self-harm walls | 2.25 · 160 · 12 | 2.15 · 217 · 25 |
| Pawn moves away from goal · backtracks | 688 · 1138 | 574 · 918 |
| Missed win-in-1 / available | 0 / 194 | 0 / 216 |
| Allowed opponent win-in-1: avoidable · forced | 0 · 216 | 1 · 193 |

- Sessions 4 · commits 5a0cfe562a · Intel(R) Core(TM) Ultra 7 256V · 8 threads · Node v24.19.0 · power ac

