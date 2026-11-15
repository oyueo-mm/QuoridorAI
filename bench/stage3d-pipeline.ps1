# Stage 3-D measurement pipeline (independent of any Claude session; resumable — re-run to continue).
#   $p = Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"$PWD/bench/stage3d-pipeline.ps1" -WindowStyle Hidden -PassThru
# Refuses to start while another benchmark worker runs. Before every measured step it waits for
# AC power (timed results depend on it) and logs the power state.
#   1. speed A/B of the exact evaluation optimisations (fixed depth, 300 ms, persistent tables)  [skipped if done]
#   2. E6 evaluation profiles, reference and fast                                                 [skipped if done]
#   3. tactics: ab4 / c1-d4 / d-d4 / ab-300ms / c1-300ms / d-300ms                                 [skipped if done]
#   4. pilot P-D-300 (40 pairs) -> gate (rule: bench/stage3b.bench.test.ts gate())
#   5. SPRT T-D-300 if the gate says go
#   6. confirmation SPRT C-D-300 only if T-D-300 accepted H1
# Log: bench/results/stage3d/pipeline.log
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path -Parent $PSScriptRoot)
$out = 'bench/results/stage3d'
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
  $env:STAGE3B = 'status'; $env:STATUS_SUITE = 'stage3d'; $env:STATUS_MATCHUP = $id; $env:STATUS_DIR = "$out/stage3d"; $env:STATUS_OUT = "$out/status-$id.txt"
  npx vitest run --config vitest.bench.config.ts bench/stage3b.bench.test.ts *> "$out/status-$id.log"
  Remove-Item Env:STAGE3B, Env:STATUS_SUITE, Env:STATUS_MATCHUP, Env:STATUS_DIR, Env:STATUS_OUT
  return (Get-Content "$out/status-$id.txt" -ErrorAction SilentlyContinue | Select-Object -First 1)
}
Remove-Item Env:MATCHUPS, Env:LIMIT, Env:REPORT, Env:TACTICS, Env:AGENTS, Env:STAGE3B -ErrorAction SilentlyContinue

if ((OtherWorkers).Count -gt 0) { Log 'another benchmark worker is running: not starting'; exit 1 }
Log 'stage3d pipeline start'

if (-not (Test-Path "$out/speed-done.txt")) {
  WaitAC
  $env:PER_PHASE = '30'; $env:DEPTH = '5'; $env:TIME = '300'; $env:REPS = '3'; $env:SEQ_GAMES = '6'
  npx vitest run --config vitest.bench.config.ts bench/eval-speed.bench.test.ts *> "$out/speed.log"
  $code = $LASTEXITCODE
  Remove-Item Env:PER_PHASE, Env:DEPTH, Env:TIME, Env:REPS, Env:SEQ_GAMES
  if ($code -eq 0) { Set-Content "$out/speed-done.txt" (Get-Date -Format s) }
  Log "speed A/B: exit $code (power $((Get-CimInstance Win32_Battery).BatteryStatus))"
}

if (-not (Test-Path "$out/profile-done.txt")) {
  foreach ($k in 'reference', 'fast') {
    WaitAC
    $env:PER_PHASE = '30'; $env:DEPTH = '5'; $env:KERNEL = $k
    npx vitest run --config vitest.bench.config.ts bench/eval-profile.bench.test.ts *> "$out/profile-$k.log"
    $code = $LASTEXITCODE
    Remove-Item Env:PER_PHASE, Env:DEPTH, Env:KERNEL
    Log "profile $k: exit $code (power $((Get-CimInstance Win32_Battery).BatteryStatus))"
  }
  Set-Content "$out/profile-done.txt" (Get-Date -Format s)
}

if (-not (Test-Path "$out/tactics-done.txt")) {
  WaitAC
  $env:TACTICS = 'run'; $env:AGENTS = 'ab4,c1-d4,d-d4,ab-300ms,c1-300ms,d-300ms'
  npx vitest run --config vitest.bench.config.ts bench/tactics.bench.test.ts *> "$out/tactics.log"
  $code = $LASTEXITCODE
  Remove-Item Env:TACTICS, Env:AGENTS
  if ($code -eq 0) { Set-Content "$out/tactics-done.txt" (Get-Date -Format s) }
  Log "tactics: exit $code"
}

WaitAC
powershell -ExecutionPolicy Bypass -File bench/run-shards.ps1 -Suite stage3d -Shards 4 -Out $out -Matchups P-D-300
Log "pilot P-D-300: exit $LASTEXITCODE"
$env:STAGE3B = 'gate'; $env:GATE_SUITE = 'stage3d'; $env:GATE_MATCHUP = 'P-D-300'; $env:GATE_DIR = "$out/stage3d"; $env:GATE_OUT = "$out/gate-D.txt"
npx vitest run --config vitest.bench.config.ts bench/stage3b.bench.test.ts *> "$out/gate.log"
Remove-Item Env:STAGE3B, Env:GATE_SUITE, Env:GATE_MATCHUP, Env:GATE_DIR, Env:GATE_OUT
$gate = Get-Content "$out/gate-D.txt" -ErrorAction SilentlyContinue
Log "gate: $($gate -join ' | ')"

if ($gate -and $gate[0] -eq 'go') {
  WaitAC
  powershell -ExecutionPolicy Bypass -File bench/run-shards.ps1 -Suite stage3d -Shards 4 -Out $out -Matchups T-D-300
  $code = $LASTEXITCODE
  $t = Status 'T-D-300'
  Log "SPRT T-D-300: exit $code, status $t"
  if ($t -eq 'accept-H1') {
    WaitAC
    powershell -ExecutionPolicy Bypass -File bench/run-shards.ps1 -Suite stage3d -Shards 4 -Out $out -Matchups C-D-300
    $code = $LASTEXITCODE
    $c = Status 'C-D-300'
    Log "confirmation C-D-300: exit $code, status $c"
  } else {
    Log 'T-D-300 did not accept H1: confirmation skipped'
  }
} else {
  Log 'gate did not say go: SPRT skipped'
}
Log 'stage3d pipeline done'
