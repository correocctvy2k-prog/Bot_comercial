$ErrorActionPreference = 'Stop'
$taskName = 'Skylab CCTV - Ciclo operativo'
$runner = Join-Path $PSScriptRoot 'run-operational-cycle.ps1'
$pwsh = (Get-Command pwsh.exe -ErrorAction SilentlyContinue).Source
if (-not $pwsh) { $pwsh = (Get-Command powershell.exe).Source }

$action = New-ScheduledTaskAction -Execute $pwsh -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`""
$start = (Get-Date).AddMinutes(1)
$trigger = New-ScheduledTaskTrigger -Once -At $start -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Consulta Trello cada minuto; correo CCTV y ping SIIS conservan una cadencia independiente de cinco minutos. Visitantes conserva su tarea exclusiva de las 20:00.' -Force | Out-Null
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName,State
