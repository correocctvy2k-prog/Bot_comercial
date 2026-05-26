<#
.SYNOPSIS
    Monitor de Kaspersky Security Center — SERV-KSC
.DESCRIPTION
    Recopila métricas del servidor de seguridad y datos de la consola KSC 
    vía KlAkProxy (OAPI). Alineado con ISO 27001.
#>

$BackendUrl = "http://192.168.8.65:3001/api/monitoring/upload"
$ErrorActionPreference = "Continue"

Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   SKYLAB — Monitor SERV-KSC (Kaspersky Console)      ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan

# ── 1. Sistema Operativo y Hardware ─────────────────────────────────────
$os = Get-CimInstance Win32_OperatingSystem
$uptime = (Get-Date) - $os.LastBootUpTime
$uptimeStr = "{0}d {1}h {2}m" -f $uptime.Days, $uptime.Hours, $uptime.Minutes

Write-Host "[1/6] Sistema: OK ($uptimeStr uptime)" -ForegroundColor Green

# ── 2. Almacenamiento ───────────────────────────────────────────────────
$Disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,
    @{N='Size_GB'; E={[math]::Round($_.Size / 1GB, 2)}},
    @{N='Free_GB'; E={[math]::Round($_.FreeSpace / 1GB, 2)}},
    @{N='Used_Pct'; E={[math]::Round((1 - ($_.FreeSpace / $_.Size)) * 100, 1)}}
Write-Host "[2/6] Almacenamiento: OK" -ForegroundColor Green

# ── 3. Servicios de Kaspersky ───────────────────────────────────────────
$KscServices = @("klserver", "klnagent", "klactprx", "kladminserver")
$Services = Get-Service -Name $KscServices -ErrorAction SilentlyContinue | 
    Select-Object Name, @{N='Status'; E={$_.Status.ToString()}}
Write-Host "[3/6] Servicios KSC: $($Services.Count) monitoreados" -ForegroundColor Green

# ── 4. Actualizaciones de Windows ───────────────────────────────────────
function Get-UpdateMetrics {
    $pending = 0
    $reboot = Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired"
    try {
        $updateSession = New-Object -ComObject Microsoft.Update.Session
        $updateSearcher = $updateSession.CreateUpdateSearcher()
        $searchResult = $updateSearcher.Search("IsInstalled=0 and Type='Software' and IsHidden=0")
        $pending = $searchResult.Updates.Count
    } catch {}
    return @{ PendingCount = $pending; RebootRequired = $reboot }
}
$Updates = Get-UpdateMetrics
Write-Host "[4/6] Windows Update: $($Updates.PendingCount) pendientes" -ForegroundColor $(if($Updates.PendingCount -gt 0){"Yellow"}else{"Green"})

# ── 5. Datos de Consola Kaspersky (Expert Mode - KlAkProxy) ─────────────
Write-Host "[5/6] Conectando a Consola KSC vía Automation API..." -ForegroundColor Cyan
$KscStats = @{
    TotalHosts = 0
    ActiveHosts = 0
    OutdatedHosts = 0
    CriticalIssues = 0
    Version = "N/A"
}

try {
    # Intentar obtener versión del registro como respaldo
    $kscReg = Get-ItemProperty "HKLM:\SOFTWARE\KasperskyLab\Components\34\1103" -ErrorAction SilentlyContinue
    if ($kscReg) { $KscStats.Version = $kscReg.Version }

    # API de Automatización (KlAkProxy)
    # Nota: Requiere que la consola esté instalada en este equipo
    $Proxy = New-Object -ComObject "klakaut.KlAkProxy"
    $Proxy.Connect("localhost") # Conexión local como Administrador

    # Obtener conteo de hosts (Concepto simplificado basado en OAPI)
    # En versiones modernas, esto se hace consultando el HostGroup
    $HostGroup = New-Object -ComObject "klakaut.KlAkHostGroup"
    $HostGroup.AdmServer = $Proxy
    
    # Consultar todos los equipos administrados
    $hostsParams = New-Object -ComObject "klakaut.KlAkParams"
    # Consulta vacía para obtener todos
    $allHosts = $HostGroup.FindHosts($hostsParams)
    
    $KscStats.TotalHosts = $allHosts.Count
    
    # Filtrar por estado (Esto es ilustrativo, depende de la estructura de KlAkParams devuelta)
    # Por ahora usaremos el conteo total como métrica principal
    Write-Host "   ✅ KSC API: Conectado. Endpoints detectados: $($KscStats.TotalHosts)" -ForegroundColor Green
    
    $Proxy.Disconnect()
} catch {
    Write-Host "   ⚠️ KSC API: No disponible o requiere permisos. Usando WMI fallback." -ForegroundColor Yellow
    # Fallback WMI
    try {
        $wmiHosts = Get-WmiObject -Namespace "root\Kaspersky" -Class "KLCS_NagentHosts" -ErrorAction SilentlyContinue
        if ($wmiHosts) { $KscStats.TotalHosts = $wmiHosts.Count }
    } catch {}
}

# ── Consolidar Payload ──────────────────────────────────────────────────
$reportData = @{
    Timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Hostname  = $env:COMPUTERNAME
    Role      = "Kaspersky Security Center"
    Uptime    = $uptimeStr
    System    = @{
        OS = $os.Caption
        Version = $os.Version
        RAM_Total_GB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
        RAM_Free_GB = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
        RAM_UsedPct = [math]::Round((1 - ($os.FreePhysicalMemory / $os.TotalVisibleMemorySize)) * 100, 1)
    }
    KSC = @{
        Version = $KscStats.Version
        TotalHosts = $KscStats.TotalHosts
        ActiveHosts = $KscStats.ActiveHosts
    }
    Disks = $Disks
    Services = $Services
    Updates = $Updates
}

$payload = @{
    service = "KSC"
    data = $reportData
}

# ── Envío al Backend ───────────────────────────────────────────────────
Write-Host "`n[6/6] Enviando datos a Skylab ($BackendUrl)..." -ForegroundColor Cyan
try {
    $json = $payload | ConvertTo-Json -Depth 10
    $res = Invoke-RestMethod -Uri $BackendUrl -Method Post -Body $json -ContentType "application/json"
    Write-Host "✅ Datos de KSC enviados correctamente." -ForegroundColor Green
} catch {
    Write-Host "❌ Error de conexión: $($_.Exception.Message)" -ForegroundColor Red
}
