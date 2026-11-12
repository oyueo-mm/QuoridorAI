# Stage 3-A run status

Last updated: 2026-11-12 13:40 (KST) — **stage 3-A complete, no process running** · branch `stage1-benchmark` · report: `docs/stage3a-evaluation-report.md`

| Matchup | State | Result |
|---|---|---|
| V1-sprt-ab3-vs-ab2 | complete | H1 accepted after 45 pairs, Elo +166 (+97 … +249) |
| V1b-sprt-ab3-vs-ab2-repeat | complete | identical to V1 (decision, LLR, all 116 games) |
| V2-sprt-null-ab-vs-ab-300 | complete (13:32) | H0 accepted after 220 pairs (LL 10 / split 195 / WW 15), Elo +8 (−8 … +23); 6 suspect games replayed |

Laptop was on battery when V2 started (recorded in sessions.jsonl as `power`). Plug in for faster, steadier runs.

Check: `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ? { $_.CommandLine -like '*QuoridorAI*forks.js*' }`
and `Get-ChildItem bench/results/stage3a/stage3a/progress.*.log | % { Get-Content $_ -Tail 1 }` (a `SPRT decided` line = done).

Collect: `$env:SUITE='stage3a'; $env:OUT='bench/results/stage3a'; $env:REPORT='only'; npx vitest run --config vitest.bench.config.ts bench/stage1.bench.test.ts`

Resume after an interruption (only if no worker is running):
`powershell -ExecutionPolicy Bypass -File bench/run-shards.ps1 -Suite stage3a -Shards 4 -Out bench/results/stage3a`
