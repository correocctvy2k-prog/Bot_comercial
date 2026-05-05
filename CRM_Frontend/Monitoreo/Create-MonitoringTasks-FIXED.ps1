<#
.SYNOPSIS
    Configura tareas programadas de monitoreo Skylab — VERSION CORREGIDA v2.1
.DESCRIPTION
    ALCANCE: 3 servidores del Directorio Activo (ANFIGANE, AD01, AD02)
    CORRECCIONES vs v1.0:
    - Nombre de tarea ÚNICO por servidor (evita sobreescritura entre DCs)
    - Script correcto por hostname (Monitor-AD.ps1 / Monitor-AD02.ps1)
    - Sin Read-Host: totalmente desatendido para SYSTEM
    - Ejecucion DIARIA una vez por dia (sin repeticion horaria)
    HORARIO:
      ANFIGANE   → 06:00 diario
      AD01       → 06:05 diario
      AD02       → 06:10 diario
.USAGE
    Ejecutar como Administrador en cada servidor:
    Set-ExecutionPolicy Bypass -Scope Process -Force
    .\Create-MonitoringTasks-FIXED.ps1
#>

$Hostname = $env:COMPUTERNAME

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  SKYLAB — Configurador de Tareas de Monitoreo v2.1   ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host "Hostname detectado: $Hostname" -ForegroundColor White
Write-Host ""

# ── Rutas donde se buscarán los scripts ─────────────────────────────────
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
    # Fallback: si es AD02 y no existe Monitor-AD02.ps1, intentar Monitor-AD.ps1
    if ($FileName -eq "Monitor-AD02.ps1") {
        Write-Host "⚠ Monitor-AD02.ps1 no encontrado. Usando Monitor-AD.ps1 como fallback." -ForegroundColor Yellow
        Write-Host "  (Recomendado: copiar Monitor-AD02.ps1 a este servidor para monitoreo específico de DC secundario)" -ForegroundColor Gray
        return Find-Script -SubDir $SubDir -FileName "Monitor-AD.ps1"
    }
    return $null
}

# ── Configuración por servidor ───────────────────────────────────────────
# Formato: TaskName, SubDir, ScriptFile, StartTime
$Config = switch ($Hostname) {

    "ANFIGANE" {
        @{
            TaskName   = "Skylab_Monitor_ANFIGANE"
            SubDir     = "Host"
            ScriptFile = "Monitor-Host.ps1"
            StartTime  = "06:00:00"
        }
    }

    "AD01" {
        @{
            TaskName   = "Skylab_Monitor_AD01"
            SubDir     = "AD"
            ScriptFile = "Monitor-AD.ps1"
            StartTime  = "06:05:00"
        }
    }

    "AD02" {
        @{
            TaskName   = "Skylab_Monitor_AD02"
            SubDir     = "AD"
            ScriptFile = "Monitor-AD02.ps1"    # Script ligero exclusivo de AD02
            StartTime  = "06:10:00"
        }
    }

    default {
        Write-Host "❌ Servidor '$Hostname' no está en el alcance actual." -ForegroundColor Red
        Write-Host "   Servidores soportados en esta fase: ANFIGANE, AD01, AD02" -ForegroundColor Yellow
        exit 1
    }
}

# ── Localizar el script ──────────────────────────────────────────────────
$ActionScript = Find-Script -SubDir $Config.SubDir -FileName $Config.ScriptFile

if ($null -eq $ActionScript) {
    Write-Host "❌ No se encontró el script: $($Config.SubDir)\$($Config.ScriptFile)" -ForegroundColor Red
    Write-Host "   Rutas buscadas:" -ForegroundColor Yellow
    $SearchPaths | ForEach-Object {
        Write-Host "   - $_\$($Config.SubDir)\$($Config.ScriptFile)" -ForegroundColor Gray
    }
    Write-Host ""
    Write-Host "   Solución: Copie la carpeta Monitoreo\ a C:\Skylab\Monitoreo\" -ForegroundColor Cyan
    exit 1
}

Write-Host "✓ Script encontrado: $ActionScript" -ForegroundColor Green

# ── Construir la tarea ───────────────────────────────────────────────────

# Acción: PowerShell desatendido con bypass de política de ejecución
$Action = New-ScheduledTaskAction `
    -Execute "PowerShell.exe" `
    -Argument "-NonInteractive -NoProfile -ExecutionPolicy Bypass -File `"$ActionScript`""

# Trigger: Diario a la hora configurada — SIN repetición horaria
$Trigger = New-ScheduledTaskTrigger -Daily -At $Config.StartTime

# Ajustes: ejecutar aunque estuviese pendiente, no parar si va a batería
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Write-Host ""
Write-Host "Configurando tarea: $($Config.TaskName)" -ForegroundColor Cyan
Write-Host "  Script  : $ActionScript"
Write-Host "  Horario : $($Config.StartTime) — Diario (una vez al día)"
Write-Host "  Usuario : SYSTEM"
Write-Host ""

# ── Registrar la tarea ───────────────────────────────────────────────────
try {
    # Eliminar si ya existe para actualización limpia
    Get-ScheduledTask -TaskName $Config.TaskName -ErrorAction SilentlyContinue |
        Unregister-ScheduledTask -Confirm:$false

    Register-ScheduledTask `
        -Action      $Action `
        -Trigger     $Trigger `
        -TaskName    $Config.TaskName `
        -Description "Skylab Monitoreo ISO 27001 — $Hostname — v2.1 — Diario $($Config.StartTime)" `
        -User        "SYSTEM" `
        -Settings    $Settings `
        -RunLevel    Highest | Out-Null

    Write-Host "✅ Tarea '$($Config.TaskName)' creada con éxito." -ForegroundColor Green

} catch {
    Write-Host "❌ Error al crear la tarea. Asegúrese de ejecutar como Administrador." -ForegroundColor Red
    Write-Host "   $($_.Exception.Message)" -ForegroundColor Gray
    exit 1
}

# ── Verificación ─────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Estado de la tarea:" -ForegroundColor Cyan
Get-ScheduledTask -TaskName $Config.TaskName | Select-Object TaskName, State | Format-Table -AutoSize

Write-Host "Próximas ejecuciones:" -ForegroundColor Cyan
Get-ScheduledTaskInfo -TaskName $Config.TaskName |
    Select-Object @{N='Próxima Ejecución'; E={$_.NextRunTime}},
                  @{N='Último Resultado'; E={$_.LastTaskResult}} |
    Format-Table -AutoSize

# ── Ejecución manual de validación ───────────────────────────────────────
Write-Host ""
$RunNow = Read-Host "¿Ejecutar el monitoreo AHORA para validar el envío al dashboard? (S/N)"
if ($RunNow -eq "S" -or $RunNow -eq "s") {
    Write-Host "Iniciando ejecución..." -ForegroundColor Cyan
    Start-ScheduledTask -TaskName $Config.TaskName
    Start-Sleep -Seconds 8
    $info = Get-ScheduledTaskInfo -TaskName $Config.TaskName
    Write-Host "Estado      : $((Get-ScheduledTask -TaskName $Config.TaskName).State)" -ForegroundColor White
    Write-Host "Última vez  : $($info.LastRunTime)" -ForegroundColor White
    Write-Host "Resultado   : $($info.LastTaskResult) $(if($info.LastTaskResult -eq 0){'(✅ Exitoso)'}else{'(❌ Revisar logs)'})" -ForegroundColor $(if($info.LastTaskResult -eq 0){"Green"}else{"Red"})
}

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║            Configuración completada ✓                 ║" -ForegroundColor Green
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Comando de verificación rápida:" -ForegroundColor Cyan
Write-Host "  Get-ScheduledTaskInfo -TaskName '$($Config.TaskName)' | Select LastRunTime, LastTaskResult" -ForegroundColor Gray
Write-Host "  (LastTaskResult = 0 significa ÉXITO)" -ForegroundColor Gray
Write-Host ""
