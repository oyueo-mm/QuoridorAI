# Stage 3-B run status

Started 2026-11-12 13:31 (KST) · branch `stage1-benchmark` · report: `docs/stage3b-eval-report.md`

Pipeline `bench/stage3b-pipeline.ps1` (PID 14988, below-normal priority, independent of Claude):

1. `stage3b-fixed` — F-E1…F-E5 vs current evaluation, depth 4, SPRT, 3 shards
2. select promoted candidates → `promoted-fixed.txt`, decisions → `fixed-decisions.txt`
3. tactics with depth-4 candidate agents
4. waits until no other benchmark worker runs, then normal priority
5. tactics with 300 ms candidate agents
6. `stage3b-time` — T-E*-300 for promoted candidates only, 4 shards (keep-awake)

Progress: `bench/results/stage3b/pipeline.log` (finished: `stage3b pipeline done`),
per-shard logs `stage3b-fixed/progress.*.log`, `stage3b-time/progress.*.log`.

Check: `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ? { $_.CommandLine -like '*QuoridorAI*forks.js*' }`

Resume after an interruption: make sure no worker runs, then start the pipeline again — every step
resumes (finished games are skipped, decided SPRTs stop at once):

```powershell
$p = Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"$PWD/bench/stage3b-pipeline.ps1" -WindowStyle Hidden -PassThru; $p.PriorityClass = 'BelowNormal'
```

Collect: `$env:OUT='bench/results/stage3b'; $env:REPORT='only'; foreach ($s in 'stage3b-fixed','stage3b-time') { $env:SUITE=$s; npx vitest run --config vitest.bench.config.ts bench/stage1.bench.test.ts }`

Pending after the pipeline: combination of promoted candidates as a new candidate (new seeds), final
comparison against Guided MCTS, `npm test` on an idle machine (the obstacle-map test timed out under
load at 13:41 — engine code untouched).
