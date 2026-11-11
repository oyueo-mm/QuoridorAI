# Stage 1 benchmark status

Last updated: 2026-11-11 19:42 (KST) · branch `stage1-benchmark`

> **Stage 2 pipeline** (`bench/stage2-pipeline.ps1`, PID 42340, started 19:41, hidden window) waits for the
> stage-1 shards below to exit, then: collects the stage-1 report → `npm test` on the idle machine →
> stage-2 component bench → tactics with stage-2 agents → `stage2` A/B suite (4 shards).
> Progress: `bench/results/stage2/pipeline.log`. If it died, re-run the same script: it waits for running
> workers and every step is resumable (finished games are skipped).

| Suite | Matchup | State | Games | Raw data |
|---|---|---|---:|---|
| stage1-fixed | F0–F7 | **complete** | 1,180 / 1,180 | `stage1-fixed/*/games.*.jsonl` |
| stage1-fixed | reproducibility audit | **complete** | 24/24 identical | `stage1-fixed/REPRODUCIBILITY-*.md` |
| tactics | 12 agents × 226 positions | **complete** | — | `tactics/tactics-2026-11-11T09-54-28-289Z.*` |
| profile | primitives + search profiles | **complete** | — | `profile/profile-*.md` |
| stage1-time | T300-ab-vs-guided | **complete** | 200 / 200 | `stage1-time/T300-ab-vs-guided/` |
| stage1-time | T300-ab-vs-pure | **complete** | 100 / 100 | `stage1-time/T300-ab-vs-pure/` |
| stage1-time | T300-ab-vs-bfs | **complete** | 100 / 100 | `stage1-time/T300-ab-vs-bfs/` |
| stage1-time | T2000-ab-vs-guided | **complete** | 40 / 40 | `stage1-time/T2000-ab-vs-guided/` |
| stage1-time | T10000-ab-vs-guided | **complete** (19:59) | 8 / 8 | `stage1-time/T10000-ab-vs-guided/` |
| npm test, idle | — | **458 passed, 1 skipped, 0 failed** (19:59) | — | `../stage2/pipeline-npm-test.log` |

The equal-time suite was started at 18:54 as 4 independent shard processes
(`bench/run-shards.ps1 -Suite stage1-time -Shards 4`). Estimated finish ≈ 20:00–20:15 on this laptop
(≈ 13 games/min at 300 ms; 2 s games ≈ 2.5 min each, 10 s games ≈ 11 min each).
The processes do not depend on the Claude Code session (the fixed suite survived a session crash).

## Check progress (any shell, any time)

```powershell
# running shard workers (empty list = finished or stopped)
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*forks.js*' } | Select-Object ProcessId, CreationDate
# games per matchup
Get-ChildItem bench/results/stage1/stage1-time -Directory | ForEach-Object { "$($_.Name) $((Get-Content "$($_.FullName)\games.*.jsonl" -ErrorAction SilentlyContinue | Measure-Object -Line).Lines)" }
# last line of each shard log
Get-ChildItem bench/results/stage1/stage1-time/progress.*.log | ForEach-Object { Get-Content $_ -Tail 1 }
```

## When it has finished — collect

```powershell
$env:SUITE='stage1-time'; $env:REPORT='only'; npx vitest run --config vitest.bench.config.ts bench/stage1.bench.test.ts
# → stage1-time/REPORT.md and */summary.{json,md}, games.csv
```

Then fill section 3.2 of `docs/stage1-performance-report.md` (rows marked "진행 중"/"대기") and commit
`bench/results/stage1/stage1-time/` (not the `*.stdout.log*` files). Only `T300-ab-vs-guided` is committed so far.

Also re-run `npx vitest run` on the idle machine: at 19:12 one heavy test (`variants.test.ts`, obstacle map
generation) timed out at 30 s only because the 4 benchmark workers saturated the CPU (engine code unchanged).

## If the processes stopped early (crash, reboot, sleep) — resume

Do **not** delete anything. Re-run the same command; finished games are skipped (config hash checked):

```powershell
powershell -ExecutionPolicy Bypass -File bench/run-shards.ps1 -Suite stage1-time -Shards 4
```

First make sure no shard worker is still running (see "Check progress"), otherwise two processes would
play the same pairs. Equal-time results depend on machine load: avoid other heavy work while it runs,
and note any interruption (sessions are recorded in `*/sessions.jsonl`).
If the laptop slept, look for `overBudgetMoves` > 0 in `summary.json` — such games are suspect.
