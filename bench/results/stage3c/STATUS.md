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

**COMPLETE 2026-11-13 14:08 KST**: T-C1-300 accepted H1 (+29, 356 pairs, 220 on battery);
C-C1-300 accepted H1 on AC power (+58 Elo (+19 … +100), 90 pairs, 217 games all AC, no suspect
games). C1 is the default search (`DEFAULT_MINIMAX_SETTINGS`); the old search is `ORIGINAL_SEARCH`.
No benchmark process is running.
