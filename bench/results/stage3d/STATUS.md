# Stage 3-D run status (E6 evaluation optimisation)

Updated 2026-11-15 (session; resume instructions below).

## Done (committed on stage1-benchmark)
- Profile of the E6 evaluation (`bench/eval-profile.bench.test.ts`): vulnerability BFS was ~45% of fixed-depth search time (resumed extra-wall BFS 35%, mask construction 8–12%, path 8%).
- Exact optimisations, selectable with `MinimaxSettings.evalKernel` ('reference' = stage 3-C code, 'fast'; module default still 'reference'):
  padded layered extra-wall queries with row windows, cheap-detour deferral, allocation-free candidate loop, wall-driven mask construction, memoised goal-row distance maps, last-layout mask memo.
- Exactness tests: `src/ai/__tests__/stage3dEval.test.ts` (10 tests; fast == reference on ~9,000 vulnerability values, 9,000 random layered queries, fixed-depth search identical in score/move/PV/nodes). Mutation-checked (unsound skip makes 5 tests fail).
- Preliminary speed A/B on BATTERY (ratios only): fixed depth ×1.6 per node, nodes/identity 60/60 identical.

## Pending: AC-power measurements and strength SPRT
`bench/stage3d-pipeline.ps1` (independent process, waits for AC before every step, resumable):
speed A/B → profiles (reference, fast) → tactics → pilot P-D-300 → gate → SPRT T-D-300 → confirmation C-D-300.
Log: `bench/results/stage3d/pipeline.log`.

Start / resume (PowerShell, repo root; refuses to start if another worker runs):
    $p = Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"$PWD/bench/stage3d-pipeline.ps1" -WindowStyle Hidden -PassThru
Check: `Get-Content bench/results/stage3d/pipeline.log -Tail 20`; power: `(Get-CimInstance Win32_Battery).BatteryStatus` (1 = battery → the pipeline waits).
If the process was killed (e.g. reboot) just start it again: finished steps are skipped by their `*-done.txt` markers and shard runs resume.

Not adopted yet: `evalKernel` default stays 'reference' until the SPRT (and confirmation) decide.
