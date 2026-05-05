<#
.SYNOPSIS
    Monitor DA02 (Secondary Domain Controller / BDC)
.DESCRIPTION
    Salud Local + Replicación. Hostname real del servidor: DA02
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
    
    $pendingCount = 0
    try {
        $updateSession = New-Object -ComObject Microsoft.Update.Session
        $updateSearcher = $updateSession.CreateUpdateSearcher()
        $searchResult = $updateSearcher.Search("IsInstalled=0 and Type='Software' and IsHidden=0")
        $pendingCount = $searchResult.Updates.Count
    } catch { }

    $lastUpdate = Get-HotFix -ErrorAction SilentlyContinue | Sort-Object InstalledOn -Descending | Select-Object -First 1
    
    return @{
        RebootRequired = $rebootPending
        PendingCount = $pendingCount
        LastInstalled = if ($lastUpdate.InstalledOn) { $lastUpdate.InstalledOn.ToString("yyyy-MM-dd") } else { "Desconocido" }
        Status = if ($rebootPending) { "Reinicio Requerido" } elseif ($pendingCount -gt 0) { "$pendingCount Pendientes" } else { "OK" }
    }
}
$Updates = Get-UpdateStatus

$reportData = @{
    Node = "DA02"        # Hostname real del servidor
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
    Write-Host "✓ Datos de DA02 (AD-DC02) enviados correctamente" -ForegroundColor Green
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}
