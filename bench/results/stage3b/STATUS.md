# Stage 3-B run status — COMPLETE (2026-11-12)

Report: `docs/stage3b-eval-report.md` · branch `stage1-benchmark`. No benchmark process is running.

| Run | Script / log | Result |
|---|---|---|
| Main (13:31 → 16:32) | `bench/stage3b-pipeline.ps1` / `pipeline.log` | Fixed depth: E1, E2 rejected · E3 inconclusive · E4, E5 promoted. 300 ms: E4 rejected · E5 promoted |
| Follow-up (17:18 → 17:55) | `bench/stage3b-next-pipeline.ps1` / `next-pipeline.log` | E6 pilot 0.500 → gate go · T-E6-300 promoted +86 (battery) · AB(E5) vs Guided +91 |
| Confirmation (18:17 → 18:31) | `bench/stage3b-confirm-pipeline.ps1` / `confirm-pipeline.log` | C-E6-300 promoted +89 (AC) |

**Default now**: `ALPHA_BETA_EVAL` = E6 (E5 fitted weights + vulnerabilityThreat 0.5).

Reports: `stage3b-fixed/REPORT.md`, `stage3b-time/REPORT.md`, `stage3b-next/REPORT.md`,
`stage3b-confirm/REPORT.md` (regenerate from the game records with
`$env:OUT='bench/results/stage3b'; $env:REPORT='only'; $env:SUITE='<suite>'; npx vitest run --config vitest.bench.config.ts bench/stage1.bench.test.ts` — no games are replayed).
All suites are complete; re-running a pipeline only skips finished games.
