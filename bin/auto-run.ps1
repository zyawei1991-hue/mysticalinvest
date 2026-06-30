$ErrorActionPreference = 'Continue'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir '..')
$BackendDir = Join-Path $ProjectRoot 'backend'
$LogPath = Join-Path $ProjectRoot 'cron.log'
$EnvPath = Join-Path $ProjectRoot '.env'

$env:PATH = 'C:\tools\node-v18.20.8-win-x64;' + $env:PATH
$env:TZ = 'Asia/Shanghai'

if (Test-Path -LiteralPath $EnvPath) {
  Get-Content -LiteralPath $EnvPath | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#') -or $line -notmatch '=') {
      return
    }

    $parts = $line -split '=', 2
    $name = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"').Trim("'")

    if ($name -match '^[A-Za-z_][A-Za-z0-9_]*$') {
      [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
  }
}

function Write-LogLine {
  param([string]$Message)
  $Message | Tee-Object -FilePath $LogPath -Append
}

function Invoke-Logged {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )
  & $FilePath @Arguments 2>&1 | Tee-Object -FilePath $LogPath -Append
  $script:LastCommandExitCode = $LASTEXITCODE
}

Set-Location -LiteralPath $BackendDir

Write-LogLine "=== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz') start daily report ==="
Invoke-Logged -FilePath 'node' -Arguments @('..\bin\daily-auto-generate.js')
$generateExit = $script:LastCommandExitCode

if ($generateExit -eq 0) {
  $hour = [int](Get-Date -Format 'HH')
  if ($hour -ge 9 -and $hour -lt 10) {
    $reportType = 'morning'
  } elseif ($hour -ge 11 -and $hour -lt 14) {
    $reportType = 'noon'
  } else {
    $reportType = 'evening'
  }

  Write-LogLine "=== push to Feishu [$reportType] ==="
  Invoke-Logged -FilePath 'node' -Arguments @('feishu_push.js', $reportType) | Out-Null
} else {
  Write-LogLine '=== daily report generation failed, skip push ==='
}

Write-LogLine "=== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz') done ==="
