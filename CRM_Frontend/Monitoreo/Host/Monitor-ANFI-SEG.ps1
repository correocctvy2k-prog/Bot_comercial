<#
.SYNOPSIS
    Monitor del Host Físico de Seguridad — ANFI-SEG13798 (ProLiant DL160)
.DESCRIPTION
    Envía métricas de salud del hardware, VMs Hyper-V alojadas y 
    servicios críticos al CRM/Dashboard de Monitoreo Skylab.
    Alineado con ISO 27001:2022.
#>

$BackendUrl = "http://192.168.8.65:3001/api/monitoring/upload"
$ErrorActionPreference = "Continue"

Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   SKYLAB — Monitor ANFI-SEG13798 (Security Host)     ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan

# ── 1. Sistema Operativo ────────────────────────────────────────────────
$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
$lastBoot = $os.LastBootUpTime
$uptime = (Get-Date) - $lastBoot
$uptimeStr = "{0} días, {1} horas" -f $uptime.Days, $uptime.Hours

Write-Host "[1/5] Sistema OK — Uptime: $uptimeStr" -ForegroundColor Green

# ── 2. VMs Hyper-V alojadas ─────────────────────────────────────────────
$VMs = @()
try {
    $VMs = Get-VM | Select-Object Name, State, Status,
        @{N='UptimeDays'; E={[math]::Round($_.Uptime.TotalDays, 1)}},
        @{N='MemoryGB'; E={[math]::Round($_.MemoryAssigned/1GB, 2)}}
    Write-Host "[2/5] VMs detectadas: $($VMs.Count)" -ForegroundColor Green
} catch {
    Write-Host "[2/5] Hyper-V no disponible o sin VMs: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ── 3. Espacio en Disco ─────────────────────────────────────────────────
$Disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,
    @{N='SizeGB';    E={[math]::Round($_.Size/1GB, 2)}},
    @{N='FreeGB';    E={[math]::Round($_.FreeSpace/1GB, 2)}},
    @{N='PercentFree'; E={[math]::Round(($_.FreeSpace/$_.Size)*100, 2)}}
Write-Host "[3/5] Discos: $($Disks.Count) unidad(es)" -ForegroundColor Green

# ── 4. Servicios Críticos del Host ──────────────────────────────────────
$ServiceNames = @("vmms", "vds", "WinRM", "W32Time", "EventLog", "wuauserv")
$Services = Get-Service -Name $ServiceNames -ErrorAction SilentlyContinue |
    Select-Object Name, Status
Write-Host "[4/5] Servicios monitoreados: $($Services.Count)" -ForegroundColor Green

# ── 5. Estado de Actualizaciones ────────────────────────────────────────
function Get-UpdateStatus {
    $rebootPending = (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired") -or
                     (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending")
    $pendingCount = 0
    try {
        $updateSession  = New-Object -ComObject Microsoft.Update.Session
        $updateSearcher = $updateSession.CreateUpdateSearcher()
        $searchResult   = $updateSearcher.Search("IsInstalled=0 and Type='Software' and IsHidden=0")
        $pendingCount   = $searchResult.Updates.Count
    } catch { }
    $lastUpdate = Get-HotFix -ErrorAction SilentlyContinue | Sort-Object InstalledOn -Descending | Select-Object -First 1
    return @{
        RebootRequired = $rebootPending
        PendingCount   = $pendingCount
        LastInstalled  = if ($lastUpdate.InstalledOn) { $lastUpdate.InstalledOn.ToString("yyyy-MM-dd") } else { "Desconocido" }
        LastKB         = if ($lastUpdate.HotFixID)    { $lastUpdate.HotFixID } else { "N/A" }
        Status         = if ($rebootPending) { "Reinicio Requerido" } elseif ($pendingCount -gt 0) { "$pendingCount Pendientes" } else { "OK" }
    }
}
$Updates = Get-UpdateStatus
Write-Host "[5/5] Actualizaciones: $($Updates.Status)" -ForegroundColor $(if($Updates.Status -eq "OK"){"Green"}else{"Yellow"})

# ── Consolidar Payload ──────────────────────────────────────────────────
$reportData = @{
    Timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Hostname  = $env:COMPUTERNAME
    Role      = "Security Host (Hyper-V)"
    Hardware  = "HPE ProLiant DL160"
    Uptime    = $uptimeStr
    System    = @{
        OS      = $os.Caption
        Version = $os.Version
        RAM_Total_GB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
        RAM_Free_GB  = [math]::Round($os.FreePhysicalMemory  / 1MB, 2)
        RAM_UsedPct  = [math]::Round((1 - $os.FreePhysicalMemory / $os.TotalVisibleMemorySize) * 100, 1)
    }
    Disks    = $Disks
    VMs      = $VMs
    Services = $Services
    Updates  = $Updates
    ReportDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
}

# ── Enviar al Backend ───────────────────────────────────────────────────
$payload = @{
    service = "ANFI-SEG"
    data    = $reportData
}

Write-Host ""
Write-Host "Enviando datos al backend ($BackendUrl)..." -ForegroundColor Cyan

try {
    $jsonPayload = $payload | ConvertTo-Json -Depth 10
    $response    = Invoke-RestMethod -Uri $BackendUrl -Method Post -Body $jsonPayload `
                   -ContentType "application/json" -TimeoutSec 30
    Write-Host "✅ Datos de ANFI-SEG13798 enviados correctamente: $($response.message)" -ForegroundColor Green
} catch {
    Write-Host "❌ Error al enviar datos: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Verifique que el backend esté activo en $BackendUrl" -ForegroundColor Yellow
}
