# Stage 3-B measurement pipeline (independent of any Claude session; resumable — re-run to continue).
#   $p = Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"$PWD/bench/stage3b-pipeline.ps1" -WindowStyle Hidden -PassThru; $p.PriorityClass = 'BelowNormal'
# (-NoProfile matters: with the user profile the hidden process hung before its first line.)
# Started at below-normal priority so a concurrently running equal-time suite (V2) keeps precedence;
# fixed-depth games are deterministic, so their results do not depend on load.
#   1. stage3b-fixed: every candidate vs current evaluation at depth 4 (SPRT), 3 shards
#   2. tactics, fixed-depth agents (ab4 + E*-d4)
#   3. wait until no other benchmark worker runs (V2), then raise to normal priority
#   4. tactics, 300 ms agents (ab-300ms + E*-300ms) — alone on the machine
#   5. stage3b-time (300 ms SPRT) for candidates promoted in step 1 only, 4 shards
# Log: bench/results/stage3b/pipeline.log
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path -Parent $PSScriptRoot)
New-Item -ItemType Directory -Force bench/results/stage3b | Out-Null
$log = 'bench/results/stage3b/pipeline.log'
function Log($m) { $l = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m"; Add-Content $log $l; Write-Output $l }
function OtherWorkers { @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*QuoridorAI*forks.js*' }) }
Remove-Item Env:MATCHUPS, Env:LIMIT, Env:REPORT, Env:TACTICS, Env:AGENTS, Env:STAGE3B -ErrorAction SilentlyContinue

Log 'stage3b pipeline start'
powershell -ExecutionPolicy Bypass -File bench/run-shards.ps1 -Suite stage3b-fixed -Shards 3 -Out bench/results/stage3b
Log "stage3b-fixed: exit $LASTEXITCODE"
$env:STAGE3B = 'select'; npx vitest run --config vitest.bench.config.ts bench/stage3b.bench.test.ts *> bench/results/stage3b/pipeline-select.log
Remove-Item Env:STAGE3B
$promoted = (Get-Content bench/results/stage3b/promoted-fixed.txt -ErrorAction SilentlyContinue | Select-Object -First 1)
if ($null -eq $promoted) { $promoted = '' }
$promoted = $promoted.Trim()
Log "promoted at fixed depth: '$promoted'"

$env:TACTICS = 'run'; $env:AGENTS = 'ab4,E1-d4,E2-d4,E3-d4,E4-d4,E5-d4'
npx vitest run --config vitest.bench.config.ts bench/tactics.bench.test.ts *> bench/results/stage3b/pipeline-tactics-d4.log
Log "tactics (depth 4 agents): exit $LASTEXITCODE"

while ((OtherWorkers).Count -gt 0) { Start-Sleep 30 }
(Get-Process -Id $PID).PriorityClass = 'Normal'
Log 'machine free of other benchmark workers; priority normal'

$env:AGENTS = 'ab-300ms,E1-300ms,E2-300ms,E3-300ms,E4-300ms,E5-300ms'
npx vitest run --config vitest.bench.config.ts bench/tactics.bench.test.ts *> bench/results/stage3b/pipeline-tactics-300ms.log
Log "tactics (300 ms agents): exit $LASTEXITCODE"
Remove-Item Env:TACTICS, Env:AGENTS -ErrorAction SilentlyContinue

if ($promoted -ne '') {
  $ids = ($promoted.Split(',') | Where-Object { $_ -ne '' } | ForEach-Object { "T-$_-300" }) -join ','
  Log "stage3b-time for: $ids"
  powershell -ExecutionPolicy Bypass -File bench/run-shards.ps1 -Suite stage3b-time -Shards 4 -Out bench/results/stage3b -Matchups $ids
  Log "stage3b-time: exit $LASTEXITCODE"
} else {
  Log 'no candidate promoted at fixed depth: equal-time stage skipped'
}
Log 'stage3b pipeline done'
