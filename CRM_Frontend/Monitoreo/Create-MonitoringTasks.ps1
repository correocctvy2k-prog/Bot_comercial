<#
.SYNOPSIS
    Configura tareas programadas para el monitoreo de infraestructura de Skylab.
    
.DESCRIPTION
    Crea una tarea programada que ejecuta el script de monitoreo local (.ps1)
    diariamente en el horario especificado según el rol del servidor.
#>

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$BaseMonitoringDir = $ScriptDir

# Función para buscar los scripts en lugares comunes si no están aquí
function Get-MonitoringPath {
    param($SubDir, $FileName)
    $Attempt1 = Join-Path $BaseMonitoringDir "$SubDir\$FileName"
    if (Test-Path $Attempt1) { return $Attempt1 }
    
    # Intentar buscar en la ruta típica del proyecto si se ejecutó desde C:\
    $ProjectPath = "C:\Users\johnathan.beltran\.gemini\antigravity\playground\final-skylab\CRM_Frontend\Monitoreo"
    $Attempt2 = Join-Path $ProjectPath "$SubDir\$FileName"
    if (Test-Path $Attempt2) { return $Attempt2 }
    
    return $null
}

$HostScript = Get-MonitoringPath "Host" "Monitor-Host.ps1"
$ADScript = Get-MonitoringPath "AD" "Monitor-AD.ps1"

# Si aún no se encuentran, pedir la ruta al usuario
if ($null -eq $HostScript -and $null -eq $ADScript) {
    Write-Host "⚠️ No se encontraron los scripts de monitoreo automáticamente." -ForegroundColor Yellow
    $ManualPath = Read-Host "Por favor, pegue la ruta de la carpeta 'Monitoreo' (ej: C:\Skylab\Monitoreo)"
    if (Test-Path $ManualPath) {
        $BaseMonitoringDir = $ManualPath
        $HostScript = Join-Path $BaseMonitoringDir "Host\Monitor-Host.ps1"
        $ADScript = Join-Path $BaseMonitoringDir "AD\Monitor-AD.ps1"
    }
}

# Determinar el rol del servidor por Hostname o pedir al usuario
$Hostname = $env:COMPUTERNAME
Write-Host "--- Configuración de Tareas de Monitoreo Skylab ---" -ForegroundColor Cyan
Write-Host "Detectado Hostname: $Hostname"

$TaskName = "Skylab_Infrastructure_Monitoring"
$Description = "Ejecuta el monitoreo diario de Skylab y envía datos al panel central."

# Configuración por rol
if ($Hostname -eq "ANFIGANE") {
    $ActionScript = $HostScript
    $StartTime = "06:00:00"
    $User = "SYSTEM"
} elseif ($Hostname -eq "AD01") {
    $ActionScript = $ADScript
    $StartTime = "06:05:00"
    $User = "SYSTEM"
} elseif ($Hostname -eq "AD02") {
    $ActionScript = $ADScript
    $StartTime = "06:10:00"
    $User = "SYSTEM"
} else {
    Write-Host "Servidor no reconocido automáticamente." -ForegroundColor Yellow
    Write-Host "1. Anfitrión (ANFIGANE)"
    Write-Host "2. AD01"
    Write-Host "3. AD02"
    $Choice = Read-Host "Seleccione el tipo de servidor (1-3)"
    
    switch ($Choice) {
        "1" { $ActionScript = $HostScript; $StartTime = "06:00:00"; $User = "SYSTEM" }
        "2" { $ActionScript = $ADScript; $StartTime = "06:05:00"; $User = "SYSTEM" }
        "3" { $ActionScript = $ADScript; $StartTime = "06:10:00"; $User = "SYSTEM" }
        default { Write-Error "Selección inválida"; exit }
    }
}

if (!(Test-Path $ActionScript)) {
    Write-Error "No se encontró el script en: $ActionScript"
    exit
}

# Crear la acción
$Action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-ExecutionPolicy Bypass -File `"$ActionScript`""

# Crear el disparador (Diario)
$Trigger = New-ScheduledTaskTrigger -Daily -At $StartTime

# Configurar ajustes (Permitir ejecución si no hay corriente, despertar, etc)
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

# Registrar la tarea
try {
    # Eliminar si ya existe
    Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false
    
    Register-ScheduledTask -Action $Action -Trigger $Trigger -TaskName $TaskName -Description $Description -User $User -Settings $Settings -RunLevel Highest
    
    Write-Host "`n✅ Tarea programada creada con éxito:" -ForegroundColor Green
    Write-Host "Nombre: $TaskName"
    Write-Host "Horario: $StartTime (Diario)"
    Write-Host "Script: $ActionScript"
} catch {
    Write-Host "`n❌ Error al crear la tarea programada. Asegúrese de ejecutar como Administrador." -ForegroundColor Red
    $PSItem.Exception.Message
}
