$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $projectRoot 'logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$logPath = Join-Path $logDirectory 'operational-cycle.log'

Set-Location -LiteralPath $projectRoot
& npm.cmd run cycle:operational *>> $logPath
exit $LASTEXITCODE
