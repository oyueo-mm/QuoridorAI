# Keeps Windows from idle-sleeping while a benchmark process is alive (no power settings are
# changed; the request ends when this script exits). Equal-time results are invalid across sleep.
#   powershell -ExecutionPolicy Bypass -File bench/keep-awake.ps1 -WatchPid <pid>
param([Parameter(Mandatory = $true)][int]$WatchPid)
Add-Type -Namespace Win32 -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
$ES_CONTINUOUS = [uint32]'0x80000000'; $ES_SYSTEM_REQUIRED = [uint32]'0x00000001'
[Win32.Power]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED) | Out-Null
try {
  while (Get-Process -Id $WatchPid -ErrorAction SilentlyContinue) { Start-Sleep 30 }
} finally {
  [Win32.Power]::SetThreadExecutionState($ES_CONTINUOUS) | Out-Null
}
