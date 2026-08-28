$ErrorActionPreference = 'Stop'
$taskName = 'Skylab CCTV - Visitantes ZK 20h'
$runner = Join-Path $PSScriptRoot 'run-visitor-import.ps1'
$pwsh = (Get-Command pwsh.exe -ErrorAction SilentlyContinue).Source
if (-not $pwsh) { $pwsh = (Get-Command powershell.exe).Source }

$action = New-ScheduledTaskAction -Execute $pwsh -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runner`""
$trigger = New-ScheduledTaskTrigger -Daily -At '20:00'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Importa el consolidado diario de visitantes ZK una hora después de su generación.' -Force | Out-Null
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName,State
