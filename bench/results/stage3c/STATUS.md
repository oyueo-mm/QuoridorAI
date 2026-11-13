# Stage 3-C run status

Report: `docs/stage3c-search-report.md` · branch `stage1-benchmark` · code commit 2292cde

Pipeline `bench/stage3c-pipeline.ps1` (started 2026-11-12, PID 33264, independent of Claude), log
`pipeline.log`. Waits for AC power before each measured step; refuses to start while another
benchmark worker runs.

1. search profile by phase → `profile-<timestamp>.md` (marker `profile-done.txt`)
2. tactics ab4 / c1-d4 / ab-300ms / c1-300ms → `bench/results/stage1/tactics/` (marker `tactics-done.txt`)
3. baseline `G-E6-vs-guided-300` (100 pairs)
4. pilot `P-C1-300` (40 pairs) → `gate-C1.txt`
5. SPRT `T-C1-300` if go → `status-T-C1-300.txt`
6. confirmation `C-C1-300` only if T-C1 accepted H1 → `status-C-C1-300.txt`

Finished when `pipeline.log` ends with `stage3c pipeline done`.

**State 2026-11-13**: steps 1–5 done (T-C1-300 accepted H1: 356 pairs, +29 Elo, but 220 of 357 pairs
were played on battery after a 4 h 23 m sleep; AC part alone LLR +1.60). The pipeline (PID 33264)
waits for AC power to run step 6 (C-C1-300); the runner now also checks AC before every timed game
(`bench/lib/suite.ts`). C1 is adopted only if C-C1-300 accepts H1 on AC power.

Check (read-only): `Get-Content bench/results/stage3c/pipeline.log`; workers:
`Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ? { $_.CommandLine -like '*QuoridorAI*forks.js*' }`.

Resume after an interruption (no worker running): start the pipeline again — finished steps and games
are skipped, decided SPRTs stop at once:

```powershell
$p = Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"$PWD/bench/stage3c-pipeline.ps1" -WindowStyle Hidden -PassThru
```

Collect: `$env:OUT='bench/results/stage3c'; $env:REPORT='only'; $env:SUITE='stage3c'; npx vitest run --config vitest.bench.config.ts bench/stage1.bench.test.ts`
