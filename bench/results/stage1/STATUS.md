# Stage 1 benchmark status

Last updated: 2026-11-11 19:12 (KST) · branch `stage1-benchmark`

| Suite | Matchup | State | Games | Raw data |
|---|---|---|---:|---|
| stage1-fixed | F0–F7 | **complete** | 1,180 / 1,180 | `stage1-fixed/*/games.*.jsonl` |
| stage1-fixed | reproducibility audit | **complete** | 24/24 identical | `stage1-fixed/REPRODUCIBILITY-*.md` |
| tactics | 12 agents × 226 positions | **complete** | — | `tactics/tactics-2026-11-11T09-54-28-289Z.*` |
| profile | primitives + search profiles | **complete** | — | `profile/profile-*.md` |
| stage1-time | T300-ab-vs-guided | **complete** | 200 / 200 | `stage1-time/T300-ab-vs-guided/` |
| stage1-time | T300-ab-vs-pure | running at last update | 14 / 100 | `stage1-time/T300-ab-vs-pure/` |
| stage1-time | T300-ab-vs-bfs | not started at last update | 0 / 100 | |
| stage1-time | T2000-ab-vs-guided | not started at last update | 0 / 40 | |
| stage1-time | T10000-ab-vs-guided | not started at last update | 0 / 8 | |

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
