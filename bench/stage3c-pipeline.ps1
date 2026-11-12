# Stage 3-C measurement pipeline (independent of any Claude session; resumable — re-run to continue).
#   $p = Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"$PWD/bench/stage3c-pipeline.ps1" -WindowStyle Hidden -PassThru
# Refuses to start while another benchmark worker runs. Before every measured step it waits for
# AC power (timed results depend on it) and logs the power state.
#   1. search profile by phase (fixed depth 5 + 300 ms + persistent-table game replay)  [skipped if done]
#   2. tactics: ab4 / c1-d4 / ab-300ms / c1-300ms
#   3. baseline G-E6-vs-guided-300 (100 pairs)
#   4. pilot P-C1-300 (40 pairs) → gate (rule: bench/stage3b.bench.test.ts gate())
#   5. SPRT T-C1-300 if the gate says go
#   6. confirmation SPRT C-C1-300 only if T-C1-300 accepted H1
# Log: bench/results/stage3c/pipeline.log
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path -Parent $PSScriptRoot)
$out = 'bench/results/stage3c'
New-Item -ItemType Directory -Force $out | Out-Null
$log = "$out/pipeline.log"
function Log($m) { $l = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m"; Add-Content $log $l; Write-Output $l }
function OtherWorkers { @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*QuoridorAI*forks.js*' }) }
function WaitAC {
  $said = $false
  while ((Get-CimInstance Win32_Battery).BatteryStatus -eq 1) {
    if (-not $said) { Log 'on battery: waiting for AC power'; $said = $true }
    Start-Sleep 60
  }
  if ($said) { Log 'AC power back' }
}
function Status($id) {
  $env:STAGE3B = 'status'; $env:STATUS_SUITE = 'stage3c'; $env:STATUS_MATCHUP = $id; $env:STATUS_DIR = "$out/stage3c"; $env:STATUS_OUT = "$out/status-$id.txt"
  npx vitest run --config vitest.bench.config.ts bench/stage3b.bench.test.ts *> "$out/status-$id.log"
  Remove-Item Env:STAGE3B, Env:STATUS_SUITE, Env:STATUS_MATCHUP, Env:STATUS_DIR, Env:STATUS_OUT
  return (Get-Content "$out/status-$id.txt" -ErrorAction SilentlyContinue | Select-Object -First 1)
}
Remove-Item Env:MATCHUPS, Env:LIMIT, Env:REPORT, Env:TACTICS, Env:AGENTS, Env:STAGE3B -ErrorAction SilentlyContinue

if ((OtherWorkers).Count -gt 0) { Log 'another benchmark worker is running: not starting'; exit 1 }
Log 'stage3c pipeline start'

if (-not (Test-Path "$out/profile-done.txt")) {
  WaitAC
  $env:VARIANTS = 'base,typed,pvs,typed+pvs,partial,typed+pvs+partial'; $env:PER_PHASE = '30'; $env:DEPTH = '5'; $env:TIME = '300'
  $env:SEQ = '1'; $env:SEQ_GAMES = '6'; $env:SEQ_VARIANTS = 'base,typed+pvs,typed+pvs+persist,typed+pvs+persist+partial'
  npx vitest run --config vitest.bench.config.ts bench/search-profile.bench.test.ts *> "$out/profile.log"
  $code = $LASTEXITCODE
  Remove-Item Env:VARIANTS, Env:PER_PHASE, Env:DEPTH, Env:TIME, Env:SEQ, Env:SEQ_GAMES, Env:SEQ_VARIANTS
  if ($code -eq 0) { Set-Content "$out/profile-done.txt" (Get-Date -Format s) }
  Log "profile: exit $code (power $((Get-CimInstance Win32_Battery).BatteryStatus))"
}

if (-not (Test-Path "$out/tactics-done.txt")) {
  WaitAC
  $env:TACTICS = 'run'; $env:AGENTS = 'ab4,c1-d4,ab-300ms,c1-300ms'
  npx vitest run --config vitest.bench.config.ts bench/tactics.bench.test.ts *> "$out/tactics.log"
  $code = $LASTEXITCODE
  Remove-Item Env:TACTICS, Env:AGENTS
  if ($code -eq 0) { Set-Content "$out/tactics-done.txt" (Get-Date -Format s) }
  Log "tactics: exit $code"
}

WaitAC
powershell -ExecutionPolicy Bypass -File bench/run-shards.ps1 -Suite stage3c -Shards 4 -Out $out -Matchups G-E6-vs-guided-300
Log "baseline G-E6-vs-guided-300: exit $LASTEXITCODE"

WaitAC
powershell -ExecutionPolicy Bypass -File bench/run-shards.ps1 -Suite stage3c -Shards 4 -Out $out -Matchups P-C1-300
Log "pilot P-C1-300: exit $LASTEXITCODE"
$env:STAGE3B = 'gate'; $env:GATE_SUITE = 'stage3c'; $env:GATE_MATCHUP = 'P-C1-300'; $env:GATE_DIR = "$out/stage3c"; $env:GATE_OUT = "$out/gate-C1.txt"
npx vitest run --config vitest.bench.config.ts bench/stage3b.bench.test.ts *> "$out/gate.log"
Remove-Item Env:STAGE3B, Env:GATE_SUITE, Env:GATE_MATCHUP, Env:GATE_DIR, Env:GATE_OUT
$gate = Get-Content "$out/gate-C1.txt" -ErrorAction SilentlyContinue
Log "gate: $($gate -join ' | ')"

if ($gate -and $gate[0] -eq 'go') {
  WaitAC
  powershell -ExecutionPolicy Bypass -File bench/run-shards.ps1 -Suite stage3c -Shards 4 -Out $out -Matchups T-C1-300
  $code = $LASTEXITCODE
  $t = Status 'T-C1-300'
  Log "SPRT T-C1-300: exit $code, status $t"
  if ($t -eq 'accept-H1') {
    WaitAC
    powershell -ExecutionPolicy Bypass -File bench/run-shards.ps1 -Suite stage3c -Shards 4 -Out $out -Matchups C-C1-300
    $code = $LASTEXITCODE
    $c = Status 'C-C1-300'
    Log "confirmation C-C1-300: exit $code, status $c"
  } else {
    Log 'T-C1-300 did not accept H1: confirmation skipped'
  }
} else {
  Log 'gate did not say go: SPRT skipped'
}
Log 'stage3c pipeline done'
