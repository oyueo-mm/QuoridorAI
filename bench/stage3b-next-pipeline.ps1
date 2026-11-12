# After stage 3-B (independent of any Claude session; resumable — re-run to continue).
#   $p = Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"$PWD/bench/stage3b-next-pipeline.ps1" -WindowStyle Hidden -PassThru
# Order follows the evaluation process: cost gate (done before launch, bench/eval-cost) →
#   1. tactics: E6 / adopted E5 / v1 at depth 4 and 300 ms (sanity: no tactical regression)
#   2. pilot P-E6-300: 40 pairs, not part of the SPRT
#   3. gate (rule fixed in bench/stage3b.bench.test.ts → gate-E6.txt)
#   4. final comparison G-E5-vs-guided-300: adopted Alpha-Beta vs Guided MCTS, 100 pairs
#   5. SPRT T-E6-300 only if the gate says go
# Refuses to start while another benchmark worker runs (no duplicate or competing runs).
# Log: bench/results/stage3b/next-pipeline.log
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path -Parent $PSScriptRoot)
New-Item -ItemType Directory -Force bench/results/stage3b | Out-Null
$log = 'bench/results/stage3b/next-pipeline.log'
function Log($m) { $l = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m"; Add-Content $log $l; Write-Output $l }
function OtherWorkers { @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*QuoridorAI*forks.js*' }) }
Remove-Item Env:MATCHUPS, Env:LIMIT, Env:REPORT, Env:TACTICS, Env:AGENTS, Env:STAGE3B -ErrorAction SilentlyContinue

if ((OtherWorkers).Count -gt 0) { Log 'another benchmark worker is running: not starting'; exit 1 }
Log 'next pipeline start'

$env:TACTICS = 'run'; $env:AGENTS = 'ab4,v1-d4,E6-d4,ab-300ms,v1-300ms,E6-300ms'
npx vitest run --config vitest.bench.config.ts bench/tactics.bench.test.ts *> bench/results/stage3b/next-tactics.log
Log "tactics: exit $LASTEXITCODE"
Remove-Item Env:TACTICS, Env:AGENTS -ErrorAction SilentlyContinue

$out = 'bench/results/stage3b'
powershell -ExecutionPolicy Bypass -File bench/run-shards.ps1 -Suite stage3b-next -Shards 4 -Out $out -Matchups P-E6-300
Log "pilot P-E6-300: exit $LASTEXITCODE"

$env:STAGE3B = 'gate'; npx vitest run --config vitest.bench.config.ts bench/stage3b.bench.test.ts *> bench/results/stage3b/next-gate.log
Remove-Item Env:STAGE3B
$gate = Get-Content bench/results/stage3b/gate-E6.txt -ErrorAction SilentlyContinue
Log "gate: $($gate -join ' | ')"

powershell -ExecutionPolicy Bypass -File bench/run-shards.ps1 -Suite stage3b-next -Shards 4 -Out $out -Matchups G-E5-vs-guided-300
Log "final comparison G-E5-vs-guided-300: exit $LASTEXITCODE"

if ($gate -and $gate[0] -eq 'go') {
  powershell -ExecutionPolicy Bypass -File bench/run-shards.ps1 -Suite stage3b-next -Shards 4 -Out $out -Matchups T-E6-300
  Log "SPRT T-E6-300: exit $LASTEXITCODE"
} else {
  Log 'gate did not say go: SPRT T-E6-300 skipped'
}
Log 'next pipeline done'
