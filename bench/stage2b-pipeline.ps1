# Stage-2b continuation (independent of any Claude session).
#   powershell -ExecutionPolicy Bypass -File bench/stage2b-pipeline.ps1
# 1. waits until the stage2 suite has finished S2 and S3 (200 games each)
# 2. stops the stage2 shard processes (S4/S5 would only re-test the rejected always-on filter;
#    finished games stay on disk, no game file is modified)
# 3. tactics for the end-of-race filter (ab5-pd3, ab-300ms-pd3 + baselines ab5, ab-300ms)
# 4. stage2b suite (S6, S7), 4 shards, resumable, with an idle-sleep blocker
# Log: bench/results/stage2/pipeline.log (same file as stage 2).
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path -Parent $PSScriptRoot)
$log = 'bench/results/stage2/pipeline.log'
function Log($m) { $l = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [2b] $m"; Add-Content $log $l; Write-Output $l }
function Games($id) { (Get-Content "bench/results/stage2/stage2/$id/games.*.jsonl" -ErrorAction SilentlyContinue | Measure-Object -Line).Lines }
function Workers { @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*QuoridorAI*forks.js*' }) }

Log 'stage2b start'
while ((Games 'S2-defense-vs-path-300') -lt 200 -or (Games 'S3-defense-vs-path-d4') -lt 200) {
  if ((Workers).Count -eq 0) { Log 'stage2 workers gone before S2/S3 finished; continuing anyway'; break }
  Start-Sleep 30
}
Log "S2 $(Games 'S2-defense-vs-path-300')/200, S3 $(Games 'S3-defense-vs-path-d4')/200 — stopping stage2 shards (S4/S5 skipped)"
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*stage1.bench.test.ts*' -and $_.CommandLine -like '*npx-cli*' } | ForEach-Object { taskkill /T /F /PID $_.ProcessId | Out-Null }
Start-Sleep 5
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*QuoridorAI*forks.js*' -or ($_.CommandLine -like '*QuoridorAI*' -and $_.CommandLine -like '*stage1.bench.test.ts*') } | ForEach-Object { taskkill /T /F /PID $_.ProcessId | Out-Null }
while ((Workers).Count -gt 0) { Start-Sleep 5 }
Log "stage2 shards stopped; S4 games on disk: $(Games 'S4-new-vs-stage1-300') (aborted matchup, not analysed)"

$awake = Start-Process powershell -ArgumentList '-ExecutionPolicy', 'Bypass', '-File', 'bench/keep-awake.ps1', '-WatchPid', $PID -WindowStyle Hidden -PassThru
Log "keep-awake PID $($awake.Id)"

Remove-Item Env:MATCHUPS, Env:LIMIT, Env:REPORT, Env:SUITE, Env:SHARD, Env:OUT -ErrorAction SilentlyContinue
$env:TACTICS = 'run'; $env:AGENTS = 'ab5,ab-300ms,ab5-pd3,ab-300ms-pd3'
npx vitest run --config vitest.bench.config.ts bench/tactics.bench.test.ts *> bench/results/stage2/pipeline-tactics-pd3.log
Log "tactics (pd3 agents): exit $LASTEXITCODE"
Remove-Item Env:TACTICS, Env:AGENTS -ErrorAction SilentlyContinue

powershell -ExecutionPolicy Bypass -File bench/run-shards.ps1 -Suite stage2b -Shards 4 -Out bench/results/stage2
Log "stage2b suite: exit $LASTEXITCODE"
Log 'stage2b done'
