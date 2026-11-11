# Runs one Stage-1 suite in N parallel processes (shards) and waits for all of them.
#   powershell -File bench/run-shards.ps1 -Suite stage1-fixed -Shards 6 [-Matchups "F1-ab2-vs-bfs,F2-ab3-vs-ab2"] [-Limit 10]
# Re-running resumes. Each shard logs to bench/results/stage1/<suite>/progress.s<i>of<n>.log.
# Use parallel shards for fixed-budget suites; for equal-time suites they compete for CPU.
param(
  [Parameter(Mandatory = $true)][string]$Suite,
  [int]$Shards = 1,
  [string]$Matchups = '',
  [string]$Limit = '',
  [string]$Out = 'bench/results/stage1'
)
$ErrorActionPreference = 'Stop'
$procs = @()
for ($i = 0; $i -lt $Shards; $i++) {
  $env:SUITE = $Suite
  $env:SHARD = "$i/$Shards"
  $env:OUT = $Out
  $env:MATCHUPS = $Matchups
  $env:LIMIT = $Limit
  $log = Join-Path $Out "$Suite.shard$i.stdout.log"
  New-Item -ItemType Directory -Force (Join-Path $Out $Suite) | Out-Null
  $procs += Start-Process -FilePath 'npx.cmd' -ArgumentList @('vitest', 'run', '--config', 'vitest.bench.config.ts', 'bench/stage1.bench.test.ts') `
    -NoNewWindow -PassThru -RedirectStandardOutput $log -RedirectStandardError "$log.err"
}
$procs | Wait-Process
$failed = @($procs | Where-Object { $_.ExitCode -ne 0 })
Write-Output "suite $Suite finished: $($Shards - $failed.Count)/$Shards shards OK"
# Final report over all shards.
$env:REPORT = 'only'; $env:SHARD = '0/1'; $env:MATCHUPS = ''
npx vitest run --config vitest.bench.config.ts bench/stage1.bench.test.ts | Out-Null
Remove-Item Env:REPORT
if ($failed.Count -gt 0) { exit 1 }
