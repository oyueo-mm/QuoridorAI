# Stage 2 benchmark status

**All stage-2 experiments finished 2026-11-12 00:36 (KST). No background process is running (checked 01:24).**
Results and decisions: `docs/stage2-alphabeta-report.md`.

| Step | State | Data |
|---|---|---|
| Idle `npm test` | complete — 458 passed, 1 skipped | `pipeline-npm-test.log` |
| Component benchmark | complete | `components-2026-11-11T11-00-00-766Z.md` |
| Tactics, stage-2 agents / pd3 agents | complete | `../stage1/tactics/tactics-2026-11-11T11-10-18-628Z.md`, `…T15-05-06-908Z.md` |
| S1 masked vs reference BFS, 300 ms | complete (200) | `stage2/S1-masked-vs-reference-300/` |
| S2 path-defense vs opponent-path, 300 ms | complete (200) | `stage2/S2-defense-vs-path-300/` |
| S3 same, fixed depth 4 | complete (200) | `stage2/S3-defense-vs-path-d4/` |
| S4 | **stopped on purpose after 15 games** (used the rejected filter); not analysed | `stage2/S4-new-vs-stage1-300/` |
| S5 | not run (same reason) | — |
| S6 path-defense ≤ 3 steps vs opponent-path, 300 ms | complete (200) | `stage2b/S6-defense3-vs-path-300/` |
| S7 default AB vs Guided MCTS, 300 ms | complete (200) | `stage2b/S7-masked-vs-guided-300/` |

`stage2 suite: exit 1` in `pipeline.log` is the planned stop of the stage2 shards by `stage2b-pipeline.ps1`
(their error logs are empty; their last entries are normal S4 games).

Machine sleep 20:10–23:55 produced moves of up to 96 minutes; analysis drops every pair with a move over 3× the
budget (`python -X utf8 bench/lib/analyze-clean.py bench/results/stage2/stage2` and `.../stage2b`, output
`clean-analysis.json`). Dropped pairs: S1 9, S2 5, S6 4, S7 0.
