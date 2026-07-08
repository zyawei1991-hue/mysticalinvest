$ErrorActionPreference = 'Continue'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir '..')
$LogPath = Join-Path $ProjectRoot 'cron.log'

$env:PATH = 'C:\tools\node-v18.20.8-win-x64;' + $env:PATH
$env:TZ = 'Asia/Shanghai'

function Write-LogLine {
  param([string]$Message)
  $Message | Tee-Object -FilePath $LogPath -Append
}

Set-Location -LiteralPath $ProjectRoot

Write-LogLine "=== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz') start todo reminder ==="
& 'C:\tools\node-v18.20.8-win-x64\node.exe' 'bin\send-todo-reminder.js' 2>&1 | Tee-Object -FilePath $LogPath -Append
$exitCode = $LASTEXITCODE
Write-LogLine "=== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz') todo reminder done exit=$exitCode ==="
exit $exitCode
