# E6 confirmation SPRT (independent of any Claude session; resumable — re-run to continue).
#   $p = Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"$PWD/bench/stage3b-confirm-pipeline.ps1" -WindowStyle Hidden -PassThru
# Refuses to start while another benchmark worker runs or on battery power (timed results depend
# on the power state). Log: bench/results/stage3b/confirm-pipeline.log
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path -Parent $PSScriptRoot)
$log = 'bench/results/stage3b/confirm-pipeline.log'
function Log($m) { $l = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m"; Add-Content $log $l; Write-Output $l }
Remove-Item Env:MATCHUPS, Env:LIMIT, Env:REPORT, Env:TACTICS, Env:AGENTS, Env:STAGE3B -ErrorAction SilentlyContinue
if (@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*QuoridorAI*forks.js*' }).Count -gt 0) { Log 'another benchmark worker is running: not starting'; exit 1 }
if ((Get-CimInstance Win32_Battery).BatteryStatus -eq 1) { Log 'on battery power: not starting'; exit 1 }
Log 'confirm pipeline start (AC power)'
powershell -ExecutionPolicy Bypass -File bench/run-shards.ps1 -Suite stage3b-confirm -Shards 4 -Out bench/results/stage3b
Log "C-E6-300: exit $LASTEXITCODE"
Log 'confirm pipeline done'
