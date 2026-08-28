$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $projectRoot 'logs'
$logPath = Join-Path $logDirectory 'visitor-import-scheduled.log'

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
Set-Location -LiteralPath $projectRoot
"[$(Get-Date -Format o)] Inicio importación programada de visitantes" | Out-File -LiteralPath $logPath -Append -Encoding utf8
& npm run import:visitors 2>&1 | Out-File -LiteralPath $logPath -Append -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw "La importación terminó con código $LASTEXITCODE" }
"[$(Get-Date -Format o)] Importación terminada" | Out-File -LiteralPath $logPath -Append -Encoding utf8
