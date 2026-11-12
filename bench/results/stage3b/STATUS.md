# Stage 3-B run status

Report: `docs/stage3b-eval-report.md` · branch `stage1-benchmark`

## 1. Main pipeline — DONE (2026-11-12 13:31 → 16:32 KST)

`bench/stage3b-pipeline.ps1`, log `pipeline.log`. Fixed depth: E1, E2 rejected · E3 inconclusive ·
E4, E5 promoted. 300 ms: E4 rejected · E5 promoted → **E5 adopted** (`ALPHA_BETA_EVAL`).
Decisions: `fixed-decisions.txt`; reports: `stage3b-fixed/REPORT.md`, `stage3b-time/REPORT.md`.

## 2. Follow-up pipeline — RUNNING (started 2026-11-12 17:18 KST, PID 14032)

`bench/stage3b-next-pipeline.ps1` (commit bdef6c3), log `next-pipeline.log`:

1. tactics E6 / E5 / v1 (depth 4, 300 ms) → `next-tactics.log`, `bench/results/stage1/tactics/`
2. pilot `P-E6-300` (40 pairs) → 3. gate → `gate-E6.txt` (rule fixed in `bench/stage3b.bench.test.ts`)
4. final comparison `G-E5-vs-guided-300` (adopted AB vs Guided MCTS, 100 pairs)
5. SPRT `T-E6-300` (only if the gate says go)

Finished when `next-pipeline.log` ends with `next pipeline done`. Rough duration: 2–4 h.

Check (read-only): `Get-Content bench/results/stage3b/next-pipeline.log` and
`Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ? { $_.CommandLine -like '*QuoridorAI*forks.js*' }`.
Progress per shard: `stage3b-next/progress.s*of4.log` (`SPRT decided` lines for T-E6-300).

Resume after an interruption: make sure no worker runs, then start it again — finished games are
skipped and decided SPRTs stop at once (the pipeline refuses to start while a worker runs):

```powershell
$p = Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"$PWD/bench/stage3b-next-pipeline.ps1" -WindowStyle Hidden -PassThru
```

Collect: `$env:OUT='bench/results/stage3b'; $env:REPORT='only'; $env:SUITE='stage3b-next'; npx vitest run --config vitest.bench.config.ts bench/stage1.bench.test.ts`
→ `stage3b-next/REPORT.md`. Then: fill report sections 5.4 / 7 (E6 adoption only if T-E6-300
accepts H1; otherwise keep E5), G vs stage 2's S7 (+73 Elo with the old evaluation).
