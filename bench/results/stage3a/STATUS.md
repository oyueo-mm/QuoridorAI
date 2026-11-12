# Stage 3-A run status

Last updated: 2026-11-12 12:50 (KST) · branch `stage1-benchmark` · report: `docs/stage3a-evaluation-report.md`

| Matchup | State | Result |
|---|---|---|
| V1-sprt-ab3-vs-ab2 | complete | H1 accepted after 45 pairs, Elo +166 (+97 … +249) |
| V1b-sprt-ab3-vs-ab2-repeat | complete | identical to V1 (decision, LLR, all 116 games) |
| V2-sprt-null-ab-vs-ab-300 | running (`run-shards` PID 9588, 4 shards, keep-awake) | — |

Laptop was on battery when V2 started (recorded in sessions.jsonl as `power`). Plug in for faster, steadier runs.

Check: `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ? { $_.CommandLine -like '*QuoridorAI*forks.js*' }`
and `Get-ChildItem bench/results/stage3a/stage3a/progress.*.log | % { Get-Content $_ -Tail 1 }` (a `SPRT decided` line = done).

Collect: `$env:SUITE='stage3a'; $env:OUT='bench/results/stage3a'; $env:REPORT='only'; npx vitest run --config vitest.bench.config.ts bench/stage1.bench.test.ts`

Resume after an interruption (only if no worker is running):
`powershell -ExecutionPolicy Bypass -File bench/run-shards.ps1 -Suite stage3a -Shards 4 -Out bench/results/stage3a`
