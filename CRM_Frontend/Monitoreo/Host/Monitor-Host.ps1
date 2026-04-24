<#
.SYNOPSIS
    Monitoreo de Host Físico Hyper-V (ANFIGANE)
.DESCRIPTION
    Envía métricas de salud del hardware y estado de las VMs al CRM.
#>

$BackendUrl = "http://192.168.8.65:3001/api/monitoring/upload"

# 1. Información del Sistema
$OS = Get-CimInstance Win32_OperatingSystem
$CS = Get-CimInstance Win32_ComputerSystem
$Uptime = (Get-Date) - $OS.LastBootUpTime

# 2. Estado de Hyper-V (VMs)
$VMs = Get-VM | Select-Object Name, State, Uptime, Status, @{N='MemoryGB';E={[math]::Round($_.MemoryAssigned/1GB, 2)}}

# 3. Espacio en Disco
$Disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID, 
    @{N='SizeGB';E={[math]::Round($_.Size/1GB, 2)}}, 
    @{N='FreeGB';E={[math]::Round($_.FreeSpace/1GB, 2)}},
    @{N='PercentFree';E={[math]::Round(($_.FreeSpace/$_.Size)*100, 2)}}

# 4. Servicios Críticos del Host
$Services = Get-Service -Name "vmms", "vds" -ErrorAction SilentlyContinue | Select-Object Name, Status

# 5. Estado de Actualizaciones
function Get-UpdateStatus {
    $rebootPending = $false
    if (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired") { $rebootPending = $true }
    if (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending") { $rebootPending = $true }
    
    $lastUpdate = Get-HotFix -ErrorAction SilentlyContinue | Sort-Object InstalledOn -Descending | Select-Object -First 1
    
    return @{
        RebootPending = $rebootPending
        LastInstalled = if ($lastUpdate.InstalledOn) { $lastUpdate.InstalledOn.ToString("yyyy-MM-dd") } else { "Desconocido" }
        LastKB = if ($lastUpdate.HotFixID) { $lastUpdate.HotFixID } else { "N/A" }
    }
}
$Updates = Get-UpdateStatus

# Consolidar Data
$reportData = @{
    Hostname = $env:COMPUTERNAME
    Model = $CS.Model
    Uptime = "$($Uptime.Days)d $($Uptime.Hours)h"
    RAM = @{
        TotalGB = [math]::Round($CS.TotalPhysicalMemory/1GB, 2)
        FreeGB = [math]::Round($OS.FreePhysicalMemory/1MB, 2)
    }
    Disks = $Disks
    VMs = $VMs
    Services = $Services
    Updates = $Updates
    ReportDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
}

# Enviar al Backend
$payload = @{
    service = "AD-HOST"
    data = $reportData
}

try {
    $jsonPayload = $payload | ConvertTo-Json -Depth 10
    Invoke-RestMethod -Uri $BackendUrl -Method Post -Body $jsonPayload -ContentType "application/json" -TimeoutSec 30
    Write-Host "✓ Datos de ANFIGANE enviados correctamente" -ForegroundColor Green
} catch {
    Write-Host "✗ Error enviando datos: $($_.Exception.Message)" -ForegroundColor Red
}
