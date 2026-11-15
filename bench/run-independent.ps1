# One frozen Stage 3-D replacement confirmation. Resumes the SAME run after interruption;
# never creates another seed, ID, schedule, test or a more favourable stopping rule.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
$out = 'bench/results/stage3d-independent'
$log = Join-Path $out 'runner.log'
if (Test-Path (Join-Path $out 'terminal.txt')) { throw 'The one confirmation already ended. No further run is authorized.' }
if (@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*QuoridorAI*forks.js*' }).Count -gt 0) { throw 'Another benchmark worker is running.' }
Remove-Item Env:ALLOW_BATTERY, Env:LIMIT, Env:REPORT -ErrorAction SilentlyContinue
$env:INDEPENDENT = 'verify'
npx vitest run --config vitest.bench.config.ts bench/stage3d-independent.test.ts *> (Join-Path $out 'preflight.log')
if ($LASTEXITCODE -ne 0) { throw 'Opening preflight failed; no games started.' }
Remove-Item Env:INDEPENDENT
Add-Content $log "$(Get-Date -Format s) one confirmation starts/resumes; AC guarded; seed/config/plan frozen"
$awake = Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'keep-awake.ps1'),'-WatchPid',$PID -WindowStyle Hidden -PassThru
$procs = @()
for ($i = 0; $i -lt 4; $i++) {
  $env:SUITE = 'stage3d-independent'; $env:SHARD = "$i/4"; $env:OUT = $out; $env:MATCHUPS = 'C-D-300-independent-1'
  $procs += Start-Process npx.cmd -ArgumentList 'vitest','run','--config','vitest.bench.config.ts','bench/stage1.bench.test.ts' -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $out "shard$i.log") -RedirectStandardError (Join-Path $out "shard$i.err")
}
$procs | Wait-Process
$failed = @($procs | Where-Object { $_.ExitCode -ne 0 })
Add-Content $log "$(Get-Date -Format s) workers finished; failures=$($failed.Count)"
if ($failed.Count -gt 0) { throw 'A worker failed. Inspect records; only the same frozen run may resume.' }
$env:REPORT = 'only'; $env:SHARD = '0/1'
npx vitest run --config vitest.bench.config.ts bench/stage1.bench.test.ts *> (Join-Path $out 'final-report.log')
if ($LASTEXITCODE -ne 0) { throw 'Final report failed' }
$result = Get-Content -Raw (Join-Path $out 'stage3d-independent/C-D-300-independent-1/summary.json') | ConvertFrom-Json
if ($result.sprt.status -eq 'continue') { throw 'No terminal result; inspect the same run without changing its plan.' }
Set-Content (Join-Path $out 'terminal.txt') $result.sprt.status
Add-Content $log "$(Get-Date -Format s) terminal=$($result.sprt.status); no second confirmation allowed"
