<#
.SYNOPSIS
    Configura tareas programadas de monitoreo Skylab — VERSION CORREGIDA v2.0
.DESCRIPTION
    CORRECCIONES vs v1.0:
    - Nombre de tarea único por servidor (evita sobreescritura entre DCs)
    - Script correcto por hostname (Monitor-AD01.ps1 / Monitor-AD02.ps1)
    - Soporte para ANFI-SEG13798 y KSC
    - Sin Read-Host: totalmente desatendido para SYSTEM
    - Repetición horaria para datos en tiempo real en el dashboard
.USAGE
    Ejecutar como Administrador en cada servidor:
    Set-ExecutionPolicy Bypass -Scope Process -Force
    .\Create-MonitoringTasks-FIXED.ps1
#>

$Hostname = $env:COMPUTERNAME
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   SKYLAB — Configurador de Tareas de Monitoreo v2.0  ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host "Hostname detectado: $Hostname" -ForegroundColor White
Write-Host ""

# ── Rutas base donde se buscarán los scripts ────────────────────────────
$SearchPaths = @(
    (Split-Path -Parent $MyInvocation.MyCommand.Definition),
    "C:\Skylab\Monitoreo",
    "C:\Monitoreo"
)

function Find-Script {
    param([string]$SubDir, [string]$FileName)
    foreach ($base in $SearchPaths) {
        $full = Join-Path $base "$SubDir\$FileName"
        if (Test-Path $full) { return $full }
    }
    return $null
}

# ── Mapa de configuración por servidor ─────────────────────────────────
# Formato: TaskName, ScriptSubDir, ScriptFile, StartTime, ServiceId
$Config = switch ($Hostname) {
    "ANFIGANE" {
        @{
            TaskName   = "Skylab_Monitor_ANFIGANE"
            SubDir     = "Host"
            ScriptFile = "Monitor-Host.ps1"
            StartTime  = "06:00:00"
            ServiceId  = "AD-HOST"
        }
    }
    "AD01" {
        @{
            TaskName   = "Skylab_Monitor_AD01"
            SubDir     = "AD"
            ScriptFile = "Monitor-AD01.ps1"
            StartTime  = "06:05:00"
            ServiceId  = "AD"
        }
    }
    "AD02" {
        @{
            TaskName   = "Skylab_Monitor_AD02"
            SubDir     = "AD"
            ScriptFile = "Monitor-AD02.ps1"
            StartTime  = "06:10:00"
            ServiceId  = "AD-DC02"
        }
    }
    # ── BUG FIX: Servidores del host de seguridad (antes sin soporte) ──
    "ANFI-SEG13798" {
        @{
            TaskName   = "Skylab_Monitor_ANFI_SEG"
            SubDir     = "Host"
            ScriptFile = "Monitor-ANFI-SEG.ps1"
            StartTime  = "06:15:00"
            ServiceId  = "ANFI-SEG"
        }
    }
    "KSC" {
        @{
            TaskName   = "Skylab_Monitor_KSC"
            SubDir     = "KSC"
            ScriptFile = "Monitor-KSC.ps1"
            StartTime  = "06:20:00"
            ServiceId  = "KSC"
        }
    }
    default {
        Write-Host "❌ Servidor '$Hostname' no reconocido en la configuración." -ForegroundColor Red
        Write-Host "   Servidores soportados: ANFIGANE, AD01, AD02, ANFI-SEG13798, KSC" -ForegroundColor Yellow
        Write-Host "   Agregue su servidor al bloque switch de este script." -ForegroundColor Yellow
        exit 1
    }
}

# ── Localizar el script de monitoreo ───────────────────────────────────
$ActionScript = Find-Script -SubDir $Config.SubDir -FileName $Config.ScriptFile

if ($null -eq $ActionScript) {
    Write-Host "❌ No se encontró el script: $($Config.SubDir)\$($Config.ScriptFile)" -ForegroundColor Red
    Write-Host "   Rutas buscadas:" -ForegroundColor Yellow
    $SearchPaths | ForEach-Object { Write-Host "   - $_\$($Config.SubDir)\$($Config.ScriptFile)" -ForegroundColor Gray }
    Write-Host ""
    Write-Host "   Solución: Copie la carpeta Monitoreo a C:\Skylab\Monitoreo\" -ForegroundColor Cyan
    exit 1
}

Write-Host "✓ Script encontrado: $ActionScript" -ForegroundColor Green

# ── Construir la tarea programada ──────────────────────────────────────
$TaskName   = $Config.TaskName
$StartTime  = $Config.StartTime

# Acción: PowerShell con bypass de política de ejecución
$Action = New-ScheduledTaskAction `
    -Execute "PowerShell.exe" `
    -Argument "-NonInteractive -NoProfile -ExecutionPolicy Bypass -File `"$ActionScript`""

# Trigger diario + repetición cada hora (para datos en tiempo real en el dashboard)
$DailyTrigger = New-ScheduledTaskTrigger -Daily -At $StartTime
$DailyTrigger.RepetitionInterval = (New-TimeSpan -Hours 1)
$DailyTrigger.RepetitionDuration = (New-TimeSpan -Hours 23)  # Todo el día

# Ajustes: ejecutar aunque el equipo esté "idle", arrancar si estaba pendiente
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Write-Host ""
Write-Host "Configurando tarea: $TaskName" -ForegroundColor Cyan
Write-Host "  Script  : $ActionScript"
Write-Host "  Inicio  : $StartTime (Diario)"
Write-Host "  Repite  : Cada 1 hora durante 23h"
Write-Host "  Usuario : SYSTEM"
Write-Host ""

# ── Registrar la tarea ─────────────────────────────────────────────────
try {
    # Eliminar si ya existe (para actualización limpia)
    Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | 
        Unregister-ScheduledTask -Confirm:$false

    Register-ScheduledTask `
        -Action   $Action `
        -Trigger  $DailyTrigger `
        -TaskName $TaskName `
        -Description "Monitoreo Skylab ISO 27001 — $($Config.ServiceId) — v2.0" `
        -User     "SYSTEM" `
        -Settings $Settings `
        -RunLevel Highest | Out-Null

    Write-Host "✅ Tarea '$TaskName' creada con éxito." -ForegroundColor Green

} catch {
    Write-Host "❌ Error al crear la tarea. Ejecute este script como Administrador." -ForegroundColor Red
    Write-Host "   $($_.Exception.Message)" -ForegroundColor Gray
    exit 1
}

# ── Ejecución inicial inmediata ─────────────────────────────────────────
Write-Host ""
$RunNow = Read-Host "¿Ejecutar el monitoreo ahora para validar? (S/N)"
if ($RunNow -eq "S" -or $RunNow -eq "s") {
    Write-Host "Ejecutando tarea..." -ForegroundColor Cyan
    Start-ScheduledTask -TaskName $TaskName
    Start-Sleep -Seconds 5
    $State = (Get-ScheduledTask -TaskName $TaskName).State
    Write-Host "Estado de la tarea: $State" -ForegroundColor $(if($State -eq "Running"){"Green"}else{"Yellow"})
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║           Configuración completada ✓                 ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Para verificar en cualquier momento:" -ForegroundColor Cyan
Write-Host "  Get-ScheduledTask -TaskName 'Skylab_Monitor_*' | Select TaskName, State, LastRunTime" -ForegroundColor Gray
Write-Host ""
Write-Host "Para ver el último resultado:" -ForegroundColor Cyan
Write-Host "  Get-ScheduledTaskInfo -TaskName '$TaskName' | Select LastRunTime, LastTaskResult" -ForegroundColor Gray
Write-Host "  (LastTaskResult = 0 significa ÉXITO)" -ForegroundColor Gray
