$ErrorActionPreference = 'Continue'
$env:PATH = 'C:\tools\node-v18.20.8-win-x64;' + $env:PATH
$env:PM2_HOME = 'C:\Users\Administrator\.pm2'
Set-Location -LiteralPath 'C:\www\daily-report'
pm2 resurrect
