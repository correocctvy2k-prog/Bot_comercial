<#
.SYNOPSIS
    Instalador y configurador infalible de la tarea de monitoreo para ANFIGANE.
.DESCRIPTION
    1. Asegura la existencia de C:\Monitoreo\Host
    2. Copia Monitor-Host.ps1 al directorio destino.
    3. Elimina tareas previas conflictivas.
    4. Registra la nueva tarea programada con triggers de repetición cada 5 minutos bajo la cuenta SYSTEM.
    5. Inicia la tarea de prueba inmediatamente.
#>

$ErrorActionPreference = "Stop"

# Directorio y archivo destino
$DestDir = "C:\Monitoreo\Host"
$DestScript = Join-Path $DestDir "Monitor-Host.ps1"

# Intentar ubicar el script Monitor-Host.ps1 localmente en la carpeta del instalador
$CurrentDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
if ([string]::IsNullOrEmpty($CurrentDir)) { $CurrentDir = Get-Location }
$SourceScript = Join-Path $CurrentDir "Monitor-Host.ps1"

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "  SKYLAB - CONFIGURADOR DE TAREA ANFIGANE INFALIBLE" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

# 1. Asegurar directorios
if (-not (Test-Path $DestDir)) {
    Write-Host "[*] Creando directorio destino: $DestDir..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $DestDir -Force | Out-Null
}

# 2. Copiar script (solo si el origen y el destino son distintos)
$SourceScriptFullPath = [System.IO.Path]::GetFullPath($SourceScript)
$DestScriptFullPath = [System.IO.Path]::GetFullPath($DestScript)

if ($SourceScriptFullPath -eq $DestScriptFullPath) {
    Write-Host "[*] El script ya se encuentra en la ruta de destino ($DestScriptFullPath). Omitiendo copia." -ForegroundColor Green
} else {
    if (Test-Path $SourceScript) {
        Write-Host "[*] Copiando script desde $SourceScript a $DestScript..." -ForegroundColor Yellow
        Copy-Item -Path $SourceScript -Destination $DestScript -Force
        Write-Host "✔ Script copiado exitosamente." -ForegroundColor Green
    } else {
        if (-not (Test-Path $DestScript)) {
            Write-Host "❌ ERROR: No se encontró Monitor-Host.ps1 en $SourceScript ni en el destino $DestScript." -ForegroundColor Red
            Write-Host "   Asegúrese de colocar el script en una de estas rutas antes de ejecutar." -ForegroundColor Yellow
            exit 1
        } else {
            Write-Host "[!] Advertencia: No se encontró script fuente para copiar, pero ya existe uno en el destino." -ForegroundColor Yellow
        }
    }
}

# 3. Eliminar tareas antiguas
$TasksToClean = @("Skylab_Infrastructure_Monitoring", "Skylab_Monitor_ANFIGANE")
foreach ($t in $TasksToClean) {
    if (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue) {
        Write-Host "[*] Eliminando tarea antigua: $t..." -ForegroundColor Yellow
        Unregister-ScheduledTask -TaskName $t -Confirm:$false | Out-Null
        Write-Host "✔ Tarea antigua '$t' eliminada." -ForegroundColor Green
    }
}

# 4. Configurar Acción
# Buscar si pwsh está disponible, de lo contrario usar powershell.exe
$Executable = "PowerShell.exe"
if (Get-Command pwsh.exe -ErrorAction SilentlyContinue) {
    $Executable = (Get-Command pwsh.exe).Source
}

$Action = New-ScheduledTaskAction `
    -Execute $Executable `
    -Argument "-NonInteractive -NoProfile -ExecutionPolicy Bypass -File `"$DestScript`""

# 5. Configurar Trigger: Inicia hoy a las 06:00:00 AM y se repite cada 5 minutos indefinidamente
$Trigger = New-ScheduledTaskTrigger -Once -At "06:00:00" -RepetitionInterval (New-TimeSpan -Minutes 5)

# 6. Configurar Ajustes
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

# 7. Registrar Tarea
Write-Host "[*] Registrando nueva tarea 'Skylab_Monitor_ANFIGANE' bajo SYSTEM..." -ForegroundColor Yellow

Register-ScheduledTask `
    -Action      $Action `
    -Trigger     $Trigger `
    -TaskName    "Skylab_Monitor_ANFIGANE" `
    -Description "Skylab Monitoreo ISO 27001 - ANFIGANE - Repetición 5 Minutos" `
    -User        "SYSTEM" `
    -Settings    $Settings `
    -RunLevel    Highest | Out-Null

Write-Host "✔ Tarea programada 'Skylab_Monitor_ANFIGANE' registrada con éxito." -ForegroundColor Green

# 8. Ejecución de prueba inmediata
Write-Host "[*] Iniciando ejecución de prueba inmediata de la tarea..." -ForegroundColor Yellow
Start-ScheduledTask -TaskName "Skylab_Monitor_ANFIGANE"

Start-Sleep -Seconds 3

# Verificar resultado
$TaskInfo = Get-ScheduledTask -TaskName "Skylab_Monitor_ANFIGANE" | Get-ScheduledTaskInfo
Write-Host "   Estado actual de ejecución: $($TaskInfo.LastTaskResult)" -ForegroundColor Cyan
Write-Host "   Próxima ejecución programada: $($TaskInfo.NextRunTime)" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "✔ Proceso de instalación finalizado con éxito." -ForegroundColor Green
