# Stage 3-D run status (E6 evaluation optimisation)

Updated 2026-11-15 after the completed pipeline and final offline audit.

## Final audit: adoption HOLD

- The pipeline completed at 16:02:12 KST. **Do not restart the completed benchmarks.**
- Original T-D-300: accept-H1, 91 valid pairs, LLR 3.014909, +65.68 Elo [22.49, 110.98].
- Original C-D-300: accept-H1, 497 valid pairs, LLR 2.978610, +23.81 Elo [5.38, 42.36].
- Audit found that C includes one opening from P (C pair 436 / P pair 18) and one from T (C pair 492 / T pair 17), both inside its stopping prefix. Distinct seeds did not ensure independence.
- Excluding those two observed collisions **within the original stopping prefix** leaves 495 pairs, LLR 2.765481: no H1 crossing. Other post-hoc filters are recorded as sensitivity analyses, not substituted for a preregistered confirmation.
- **Default stays reference.** Fast remains opt-in. No engine/training/variant changes in the closeout; no main merge or deployment.
- All 1,342 raw records are AC; C game 770 attempt 1 (>900ms move) is preserved and correctly replaced by attempt 2. No final suspect games.
- AC fixed-depth speed: 1.70–1.84x with 90/90 score/move/PV/node identity. Memory RSS/heap was not measured; static payload analysis only.
- Full tests: 507 passed / 1 skipped; tsc -b and production build passed.
- Evidence: [audit.json](audit.json), [final report](../../../docs/stage3d-eval-report.md), [follow-up plan](../../../docs/stage3e-search-plan.md).
- A genuinely new, preregistered disjoint confirmation would be a **new experiment**, not a resume. It was not run in this session.

## Historical pre-run handoff (retained below; superseded by the audit above)

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
