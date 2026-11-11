# Stage-2 measurement pipeline (independent of any Claude session).
#   powershell -ExecutionPolicy Bypass -File bench/stage2-pipeline.ps1
# 1. waits until no benchmark worker (vitest forks.js under this repo) is running
# 2. collects the stage-1 equal-time report
# 3. runs the full unit test suite on the idle machine (log: bench/results/stage2/pipeline-npm-test.log)
# 4. stage-2 component benchmark            (bench/results/stage2/components-*.md)
# 5. tactics with stage-2 Alpha-Beta agents (bench/results/stage1/tactics/tactics-*.md)
# 6. stage-2 equal-time / fixed A/B suite    (bench/results/stage2/stage2/, 4 shards, resumable)
# Every step appends to bench/results/stage2/pipeline.log. Re-running skips finished games.
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path -Parent $PSScriptRoot)
New-Item -ItemType Directory -Force bench/results/stage2 | Out-Null
$log = 'bench/results/stage2/pipeline.log'
function Log($m) { $l = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m"; Add-Content $log $l; Write-Output $l }
function Workers { @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*QuoridorAI*forks.js*' }) }

Log 'pipeline start'
while ((Workers).Count -gt 0) { Start-Sleep 30 }
Log 'no benchmark workers running'

Remove-Item Env:MATCHUPS, Env:LIMIT, Env:REPORT, Env:TACTICS, Env:AGENTS -ErrorAction SilentlyContinue
$env:SUITE = 'stage1-time'; $env:REPORT = 'only'; $env:SHARD = '0/1'; $env:OUT = 'bench/results/stage1'
npx vitest run --config vitest.bench.config.ts bench/stage1.bench.test.ts | Out-Null
Log "stage1-time report collected (exit $LASTEXITCODE)"
Remove-Item Env:REPORT, Env:SUITE, Env:SHARD, Env:OUT -ErrorAction SilentlyContinue

npx vitest run *> bench/results/stage2/pipeline-npm-test.log
Log "npm test on idle machine: exit $LASTEXITCODE (log pipeline-npm-test.log)"

npx vitest run --config vitest.bench.config.ts bench/stage2.bench.test.ts *> bench/results/stage2/pipeline-components.log
Log "stage-2 component benchmark: exit $LASTEXITCODE"

$env:TACTICS = 'run'; $env:AGENTS = 'ab4,ab5,ab-300ms,ab-2s,ab4-pd,ab5-pd,ab-300ms-pd,ab-2s-pd'
npx vitest run --config vitest.bench.config.ts bench/tactics.bench.test.ts *> bench/results/stage2/pipeline-tactics.log
Log "tactics (stage-2 agents): exit $LASTEXITCODE"
Remove-Item Env:TACTICS, Env:AGENTS -ErrorAction SilentlyContinue

powershell -ExecutionPolicy Bypass -File bench/run-shards.ps1 -Suite stage2 -Shards 4 -Out bench/results/stage2
Log "stage2 suite: exit $LASTEXITCODE"
Log 'pipeline done'
