# Stage 2 benchmark status

Last updated: 2026-11-12 00:01 (KST) · branch `stage1-benchmark`

| Step | State | Result / data |
|---|---|---|
| Idle `npm test` (pipeline) | **complete** | 43 files, 458 passed, 1 skipped — `pipeline-npm-test.log` |
| Component benchmark | **complete** | `components-2026-11-11T11-00-00-766Z.md` |
| Tactics, stage-2 agents | **complete** | `../stage1/tactics/tactics-2026-11-11T11-10-18-628Z.md` |
| S1 masked vs reference BFS, 300 ms | **complete** (200) | `stage2/S1-masked-vs-reference-300/` |
| S2 path-defense vs opponent-path, 300 ms | running at last update (170/200) | `stage2/S2-defense-vs-path-300/` |
| S3 same, fixed depth 4 | queued | `stage2/S3-defense-vs-path-d4/` |
| S4, S5 (use the rejected always-on filter) | **skipped on purpose** — stopped by `stage2b-pipeline.ps1` after S3 | partial S4 games, if any, are not analysed |
| Tactics, end-of-race filter (pd3) | queued | `pipeline-tactics-pd3.log`, `../stage1/tactics/` |
| S6 defense≤3 vs opponent-path, 300 ms | queued | `stage2b/S6-defense3-vs-path-300/` |
| S7 default AB (masked) vs Guided MCTS, 300 ms | queued | `stage2b/S7-masked-vs-guided-300/` |

Processes (all independent of the Claude session):
- `bench/stage2-pipeline.ps1` (PID 42340) → `run-shards.ps1 -Suite stage2` (PID 11140) → 4 vitest workers
- `bench/stage2b-pipeline.ps1` (PID 54332): waits for S2+S3, stops the stage2 workers, runs pd3 tactics,
  then `run-shards.ps1 -Suite stage2b -Shards 4 -Out bench/results/stage2` with `bench/keep-awake.ps1`.
- Every step logs to `pipeline.log` (stage 2b lines are tagged `[2b]`). Finished: line `[2b] stage2b done`.

**Machine sleep:** between 20:10 and 23:55 the laptop slept repeatedly (moves of 69 and 96 minutes).
`keep-awake.ps1` now blocks idle sleep while the pipelines run, but cannot prevent lid-close sleep.
Games with a move over 3× the budget are suspect; analyse with
`python -X utf8 bench/lib/analyze-clean.py bench/results/stage2/stage2` (drops the whole pair).

## Collect

```powershell
$env:OUT='bench/results/stage2'; $env:REPORT='only'
$env:SUITE='stage2';  npx vitest run --config vitest.bench.config.ts bench/stage1.bench.test.ts
$env:SUITE='stage2b'; npx vitest run --config vitest.bench.config.ts bench/stage1.bench.test.ts
python -X utf8 bench/lib/analyze-clean.py bench/results/stage2/stage2
python -X utf8 bench/lib/analyze-clean.py bench/results/stage2/stage2b
```

## Resume after an interruption

Check that no `QuoridorAI ... forks.js` node process is running, then
`powershell -ExecutionPolicy Bypass -File bench/run-shards.ps1 -Suite stage2b -Shards 4 -Out bench/results/stage2`
(finished games are skipped). Do not restart `stage2` — S4/S5 are intentionally not run.
