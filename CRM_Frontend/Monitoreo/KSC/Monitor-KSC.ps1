<#
.SYNOPSIS
    Monitor del Servidor KSC (Kaspersky Security Center)
.DESCRIPTION
    Envía métricas de salud del servidor, servicios de Kaspersky y 
    estado de agentes al CRM/Dashboard de Monitoreo Skylab.
    Alineado con ISO 27001:2022 — Control A.8.8 (Gestión de vulnerabilidades).
#>

$BackendUrl = "http://192.168.8.65:3001/api/monitoring/upload"
$ErrorActionPreference = "Continue"

Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   SKYLAB — Monitor KSC (Kaspersky Security Center)   ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan

# ── 1. Sistema Operativo ────────────────────────────────────────────────
$os = Get-CimInstance Win32_OperatingSystem
$lastBoot = $os.LastBootUpTime
$uptime = (Get-Date) - $lastBoot
$uptimeStr = "{0} días, {1} horas" -f $uptime.Days, $uptime.Hours
Write-Host "[1/5] Sistema OK — Uptime: $uptimeStr" -ForegroundColor Green

# ── 2. Espacio en Disco ─────────────────────────────────────────────────
$Disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,
    @{N='SizeGB';      E={[math]::Round($_.Size/1GB, 2)}},
    @{N='FreeGB';      E={[math]::Round($_.FreeSpace/1GB, 2)}},
    @{N='PercentFree'; E={[math]::Round(($_.FreeSpace/$_.Size)*100, 2)}}
Write-Host "[2/5] Discos: $($Disks.Count) unidad(es)" -ForegroundColor Green

# ── 3. Servicios de Kaspersky ───────────────────────────────────────────
# Nombres típicos de servicios KSC — se omiten silenciosamente si no existen
$KscServiceNames = @(
    "KAVFSGT",          # Kaspersky Security for Windows Server
    "klnagent",         # Kaspersky Network Agent
    "klserver",         # Administration Server
    "klactprx",         # Activation Proxy
    "SrvSvc",           # Server service (general)
    "WinRM",
    "W32Time",
    "EventLog"
)
$Services = Get-Service -Name $KscServiceNames -ErrorAction SilentlyContinue |
    Select-Object Name, Status
Write-Host "[3/5] Servicios KSC monitoreados: $($Services.Count)" -ForegroundColor Green

# ── 4. Estado de Actualizaciones ────────────────────────────────────────
function Get-UpdateStatus {
    $rebootPending = (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired") -or
                     (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending")
    $pendingCount = 0
    try {
        $session  = New-Object -ComObject Microsoft.Update.Session
        $searcher = $session.CreateUpdateSearcher()
        $result   = $searcher.Search("IsInstalled=0 and Type='Software' and IsHidden=0")
        $pendingCount = $result.Updates.Count
    } catch { }
    $lastHotfix = Get-HotFix -ErrorAction SilentlyContinue | Sort-Object InstalledOn -Descending | Select-Object -First 1
    return @{
        RebootRequired = $rebootPending
        PendingCount   = $pendingCount
        LastInstalled  = if ($lastHotfix.InstalledOn) { $lastHotfix.InstalledOn.ToString("yyyy-MM-dd") } else { "Desconocido" }
        LastKB         = if ($lastHotfix.HotFixID)    { $lastHotfix.HotFixID } else { "N/A" }
        Status         = if ($rebootPending) { "Reinicio Requerido" } elseif ($pendingCount -gt 0) { "$pendingCount Pendientes" } else { "OK" }
    }
}
$Updates = Get-UpdateStatus
Write-Host "[4/5] Actualizaciones: $($Updates.Status)" -ForegroundColor $(if($Updates.Status -eq "OK"){"Green"}else{"Yellow"})

# ── 5. Agentes KSC conectados (vía WMI si está disponible) ─────────────
$KscAgentCount = 0
$KscVersion    = "N/A"
try {
    # Intentar leer la versión de KSC desde el registro
    $kscReg = Get-ItemProperty "HKLM:\SOFTWARE\KasperskyLab\Components\34\1103" -ErrorAction SilentlyContinue
    if ($kscReg) {
        $KscVersion = $kscReg.Version
    }
    # Intentar leer conteo de hosts administrados
    $wmi = Get-WmiObject -Namespace "root\Kaspersky" -Class "KLCS_NagentHosts" -ErrorAction SilentlyContinue
    if ($wmi) { $KscAgentCount = $wmi.Count }
    Write-Host "[5/5] KSC Version: $KscVersion | Agentes conectados: $KscAgentCount" -ForegroundColor Green
} catch {
    Write-Host "[5/5] Información KSC por WMI no disponible (normal si KSC no está instalado aquí)" -ForegroundColor Yellow
}

# ── Consolidar Payload ──────────────────────────────────────────────────
$reportData = @{
    Timestamp  = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Hostname   = $env:COMPUTERNAME
    Role       = "Kaspersky Security Center"
    HostParent = "ANFI-SEG13798"
    Uptime     = $uptimeStr
    System     = @{
        OS      = $os.Caption
        Version = $os.Version
        RAM_Total_GB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
        RAM_Free_GB  = [math]::Round($os.FreePhysicalMemory  / 1MB, 2)
        RAM_UsedPct  = [math]::Round((1 - $os.FreePhysicalMemory / $os.TotalVisibleMemorySize) * 100, 1)
    }
    Disks      = $Disks
    Services   = $Services
    KSC        = @{
        Version      = $KscVersion
        AgentsOnline = $KscAgentCount
    }
    Updates    = $Updates
    ReportDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
}

# ── Enviar al Backend ───────────────────────────────────────────────────
$payload = @{
    service = "KSC"
    data    = $reportData
}

Write-Host ""
Write-Host "Enviando datos al backend ($BackendUrl)..." -ForegroundColor Cyan

try {
    $jsonPayload = $payload | ConvertTo-Json -Depth 10
    $response    = Invoke-RestMethod -Uri $BackendUrl -Method Post -Body $jsonPayload `
                   -ContentType "application/json" -TimeoutSec 30
    Write-Host "✅ Datos de KSC enviados correctamente: $($response.message)" -ForegroundColor Green
} catch {
    Write-Host "❌ Error al enviar datos: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Verifique que el backend esté activo en $BackendUrl" -ForegroundColor Yellow
}
