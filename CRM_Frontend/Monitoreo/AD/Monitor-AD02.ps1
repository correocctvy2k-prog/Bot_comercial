<#
.SYNOPSIS
    Monitor AD02 (Secondary Domain Controller)
.DESCRIPTION
    Salud Local + Replicación.
#>

$BackendUrl = "http://192.168.8.65:3001/api/monitoring/upload"

# --- Salud Local ---
$OS = Get-CimInstance Win32_OperatingSystem
$Disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID, 
    @{N='PercentFree';E={[math]::Round(($_.FreeSpace/$_.Size)*100, 2)}}

# --- Replicación (Verificar desde este nodo) ---
$Replica = repadmin /showrepl /errorsonly 2>&1
$ReplicaStatus = if ($Replica -match "error|fail") { "ERROR" } else { "OK" }

# --- Actualizaciones ---
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

$reportData = @{
    Node = "AD-DC02"
    Role = "BDC (Backup Domain Controller)"
    Uptime = "$([math]::Round(((Get-Date) - $OS.LastBootUpTime).TotalDays, 1)) días"
    LocalHealth = @{
        Disk = $Disks
        Services = Get-Service -Name "NTDS", "DNS", "KDC", "Netlogon", "DFSR" -ErrorAction SilentlyContinue | Select-Object Name, Status
        Replication = $ReplicaStatus
        Updates = $Updates
    }
    ReportDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
}

# Enviar Payload
$payload = @{
    service = "AD-DC02"
    data = $reportData
}

try {
    $jsonPayload = $payload | ConvertTo-Json -Depth 10
    Invoke-RestMethod -Uri $BackendUrl -Method Post -Body $jsonPayload -ContentType "application/json"
    Write-Host "✓ Datos de AD02 enviados" -ForegroundColor Green
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}
