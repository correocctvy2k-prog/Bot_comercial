<#
.SYNOPSIS
    Monitor SERV-ZK (Windows 10 / ZKBio CVSecurity)
.DESCRIPTION
    Recolecta salud local de la VM Windows SERV-ZK y detecta servicios
    asociados a ZKBio CVSecurity, BioTime, ZKAccess y dependencias comunes.
    Tambien valida conectividad basica hacia el anfitrion Proxmox.
    Monitorea servicios BioPlatform, ZKBIOOnline y el servidor BabyWare (alarmas).

.USAGE
    PowerShell.exe -NonInteractive -NoProfile -ExecutionPolicy Bypass -File .\Monitor-SERV-ZK.ps1

    Parametros opcionales:
    .\Monitor-SERV-ZK.ps1 -BackendUrl "http://192.168.8.65:3001/api/monitoring/upload"
    .\Monitor-SERV-ZK.ps1 -BabyWareIP "192.168.8.XX" -BabyWarePort 16001
#>

param(
    [string]$BackendUrl      = "http://192.168.8.65:3001/api/monitoring/upload",
    [string]$ServiceName     = "SERV-ZK",
    [string]$ServerIP        = "192.168.8.112",
    [string]$ProxmoxHostName = "PROXMOX-ZK",
    [string]$ProxmoxHostIP   = "192.168.8.50",
    # BabyWare corre en la misma maquina que ZKBio (SERV-ZK)
    [string]$BabyWareIP      = "192.168.8.112",
    [int]$BabyWarePort       = 16001,
    # Servicios criticos ZKBio que DEBEN estar Running.
    # Algunas instalaciones no incluyen "BioPlat Dependent Business Service";
    # por eso solo ZKBIOOnline se valida como critico por defecto.
    [string[]]$CriticalZKServices = @(
        "ZKBIOOnline Service"
    )
)

$ErrorActionPreference = "Continue"

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "   SKYLAB - Monitor SERV-ZK (Windows 10 / ZKBio)"        -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "Backend  : $BackendUrl"                      -ForegroundColor Gray
Write-Host "Service  : $ServiceName"                     -ForegroundColor Gray
Write-Host "VM IP    : $ServerIP"                        -ForegroundColor Gray
Write-Host "Host     : $ProxmoxHostName ($ProxmoxHostIP)" -ForegroundColor Gray
Write-Host "BabyWare : ${BabyWareIP}:${BabyWarePort}"   -ForegroundColor Gray

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Get-SafeRound {
    param([double]$Value, [int]$Digits = 2)
    try { return [math]::Round($Value, $Digits) } catch { return 0 }
}

function Get-UpdateStatus {
    $rebootPending = $false
    $rebootKeys = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired",
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending",
        "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\PendingFileRenameOperations"
    )
    foreach ($key in $rebootKeys) {
        if (Test-Path $key) { $rebootPending = $true }
    }

    $pendingCount     = 0
    $updateQueryError = $null
    try {
        $updateSession  = New-Object -ComObject Microsoft.Update.Session
        $updateSearcher = $updateSession.CreateUpdateSearcher()
        $searchResult   = $updateSearcher.Search("IsInstalled=0 and Type='Software' and IsHidden=0")
        $pendingCount   = $searchResult.Updates.Count
    } catch {
        $updateQueryError = $_.Exception.Message
    }

    $lastUpdate = $null
    try {
        $lastUpdate = Get-HotFix -ErrorAction SilentlyContinue |
            Sort-Object InstalledOn -Descending |
            Select-Object -First 1
    } catch { }

    return @{
        PendingCount   = $pendingCount
        RebootRequired = $rebootPending
        LastInstalled  = if ($lastUpdate -and $lastUpdate.InstalledOn) { $lastUpdate.InstalledOn.ToString("yyyy-MM-dd") } else { "Desconocido" }
        LastKB         = if ($lastUpdate -and $lastUpdate.HotFixID)   { $lastUpdate.HotFixID } else { "N/A" }
        Status         = if ($rebootPending) { "Reinicio Requerido" } elseif ($pendingCount -gt 0) { "$pendingCount Pendientes" } else { "OK" }
        QueryError     = $updateQueryError
    }
}

function Get-DiskHealth {
    $disks = @()
    try {
        $disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" |
            Select-Object DeviceID,
                @{N='SizeGB';     E={Get-SafeRound ($_.Size / 1GB)}},
                @{N='FreeGB';     E={Get-SafeRound ($_.FreeSpace / 1GB)}},
                @{N='PercentFree';E={Get-SafeRound (($_.FreeSpace / $_.Size) * 100)}}
    } catch { }

    $status = "OK"
    $issues = @()
    foreach ($disk in $disks) {
        if ($disk.PercentFree -lt 15) {
            $status  = "CRITICAL"
            $issues += "Disco $($disk.DeviceID) con espacio critico: $($disk.PercentFree)% libre"
        } elseif ($disk.PercentFree -lt 25 -and $status -ne "CRITICAL") {
            $status  = "WARNING"
            $issues += "Disco $($disk.DeviceID) con espacio bajo: $($disk.PercentFree)% libre"
        }
    }
    return @{ Status=$status; Disks=@($disks); Issues=$issues }
}

function Test-TcpPort {
    param([string]$ComputerName, [int]$Port, [int]$TimeoutMs = 1500)
    $client = $null
    try {
        $client  = New-Object System.Net.Sockets.TcpClient
        $async   = $client.BeginConnect($ComputerName, $Port, $null, $null)
        $success = $async.AsyncWaitHandle.WaitOne($TimeoutMs, $false)
        if (-not $success) { return $false }
        $client.EndConnect($async)
        return $true
    } catch {
        return $false
    } finally {
        if ($client) { $client.Close() }
    }
}

function Test-NodePing {
    param([string]$IP, [int]$Count = 2)
    try {
        $responses = @(Test-Connection -ComputerName $IP -Count $Count -ErrorAction SilentlyContinue)
        if ($responses.Count -eq 0) {
            return @{ Status="DOWN"; Pingable=$false; LatencyMs=$null; CheckedAt=(Get-Date).ToString("yyyy-MM-dd HH:mm:ss") }
        }
        $avg = ($responses | Measure-Object -Property ResponseTime -Average).Average
        return @{
            Status    = "UP"
            Pingable  = $true
            LatencyMs = [int][math]::Round($avg, 0)
            CheckedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        }
    } catch {
        return @{
            Status    = "DOWN"
            Pingable  = $false
            LatencyMs = $null
            Error     = $_.Exception.Message
            CheckedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        }
    }
}

function Get-ProxmoxHostHealth {
    param([string]$Name, [string]$IP)
    $ping     = Test-NodePing -IP $IP
    $pingable = $ping.Pingable
    $webUi    = Test-TcpPort -ComputerName $IP -Port 8006
    $ssh      = Test-TcpPort -ComputerName $IP -Port 22
    $status   = "OK"
    $issues   = @()
    if (-not $pingable) { $status = "CRITICAL"; $issues += "Anfitrion Proxmox $Name ($IP) no responde a ping" }
    if (-not $webUi)    { if ($status -ne "CRITICAL") { $status = "WARNING" }; $issues += "Puerto Proxmox Web UI 8006 no responde en $IP" }
    if (-not $ssh)      { if ($status -ne "CRITICAL") { $status = "WARNING" }; $issues += "Puerto SSH 22 no responde en $IP" }
    return @{
        Name      = $Name
        IP        = $IP
        Type      = "Proxmox VE Host"
        Status    = $status
        Pingable  = $pingable
        LatencyMs = $ping.LatencyMs
        Ping      = $ping
        Ports     = @{ WebUI8006=$webUi; SSH22=$ssh }
        Checks    = @{ ICMP=$pingable; TCP8006=$webUi; TCP22=$ssh }
        Issues    = $issues
        Note      = "Chequeo basico desde la VM Windows. Metricas reales requieren API token o SSH."
    }
}

# ---------------------------------------------------------------------------
# BabyWare - Servidor de alarmas
# ---------------------------------------------------------------------------

function Get-BabyWareHealth {
    param([string]$IP, [int]$Port = 16001)
    # BabyWare corre en la misma VM que ZKBio, el chequeo relevante es TCP al puerto
    $tcpOk  = Test-TcpPort -ComputerName $IP -Port $Port

    # Verificar tambien si el proceso BabyWare existe
    $bwProc = $null
    try {
        $bwProc = Get-Process -Name "BabyWare*" -ErrorAction SilentlyContinue | Select-Object -First 1
    } catch { }

    $status = "OK"
    $issues = @()

    if (-not $tcpOk) {
        $status  = "CRITICAL"
        $issues += "Puerto BabyWare TCP/$Port no responde en $IP (misma VM que ZKBio)"
    }

    if (-not $bwProc -and $tcpOk) {
        # Puerto activo pero proceso no identificado - solo informativo
    } elseif (-not $bwProc -and -not $tcpOk) {
        $issues += "Proceso BabyWare no encontrado en la VM"
    }

    return @{
        IP          = $IP
        Port        = $Port
        Status      = $status
        TcpOk       = $tcpOk
        ProcessFound = ($null -ne $bwProc)
        ProcessName  = if ($bwProc) { $bwProc.ProcessName } else { "N/A" }
        Issues      = $issues
        Note        = "BabyWare corre en la misma maquina que ZKBio (SERV-ZK). Monitoreo via TCP/$Port local."
    }
}

# ---------------------------------------------------------------------------
# ZKBio + BioPlatform services
# ---------------------------------------------------------------------------

function Get-ZKRelatedServices {
    param([string[]]$CriticalServices = @("ZKBIOOnline Service"))

    # Patrones de busqueda dinamica por nombre/ruta
    $platformPatterns = @(
        "ZK", "ZKBio", "BioTime", "ZKAccess", "CVSecurity",
        "BioPlatform", "BioPlat", "BalloonService", "Access", "Attendance"
    )

    # Lista exacta de servicios BioPlatform conocidos en ZKBio CVSecurity
    $bioPlatformExact = @(
        "BalloonService",
        "BioPlatform Cache Service",
        "BioPlatform Camera Service",
        "BioPlatform Comparison Service",
        "BioPlatform Core Service",
        "BioPlatform CUServer Service",
        "BioPlatform Database Service",
        "BioPlat Dependent Business Service",
        "BioPlatform DetectFace Service",
        "BioPlatform Finger Service",
        "BioPlatform ISSONline Service",
        "BioPlatform Online Protect Service",
        "BioPlatform Pedestrian Service",
        "ZKBIOOnline Service"
    )

    $dependencyPatterns = @(
        "MySQL", "MariaDB", "PostgreSQL", "Postgres",
        "SQL Server", "MSSQL", "Redis", "Nginx", "Apache", "Tomcat"
    )

    $allServices = @()
    try {
        $allServices = Get-CimInstance Win32_Service |
            Select-Object Name, DisplayName, State, Status, StartMode, StartName, PathName
    } catch { }

    $platformRegex   = ($platformPatterns   | ForEach-Object { [regex]::Escape($_) }) -join "|"
    $dependencyRegex = ($dependencyPatterns | ForEach-Object { [regex]::Escape($_) }) -join "|"

    $platformServices = @($allServices | Where-Object {
        ($_.Name -match $platformRegex) -or ($_.DisplayName -match $platformRegex) -or ($_.PathName -match $platformRegex)
    } | Sort-Object DisplayName, Name)

    $dependencyServices = @($allServices | Where-Object {
        ($_.Name -match $dependencyRegex) -or ($_.DisplayName -match $dependencyRegex) -or ($_.PathName -match $dependencyRegex)
    } | Sort-Object DisplayName, Name)

    $serviceMap = @{}
    foreach ($svc in @($platformServices + $dependencyServices)) {
        if (-not $serviceMap.ContainsKey($svc.Name)) {
            $kind = if ($platformServices.Name -contains $svc.Name) { "Platform" } else { "Dependency" }
            if ($bioPlatformExact -contains $svc.DisplayName -or $bioPlatformExact -contains $svc.Name) {
                $kind = "BioPlatform"
            }
            $serviceMap[$svc.Name] = @{
                Name        = $svc.Name
                DisplayName = $svc.DisplayName
                Kind        = $kind
                State       = $svc.State
                Status      = $svc.Status
                StartMode   = $svc.StartMode
                StartName   = $svc.StartName
                PathName    = $svc.PathName
            }
        }
    }

    # Servicios criticos declarados en parametros
    $criticalDetected = @()
    foreach ($critical in $CriticalServices) {
        $match = $allServices | Where-Object {
            $_.Name -eq $critical -or $_.DisplayName -eq $critical -or
            $_.Name -like "*$critical*" -or $_.DisplayName -like "*$critical*"
        } | Select-Object -First 1

        if ($match) {
            $criticalItem = @{
                Name        = $match.Name
                DisplayName = $match.DisplayName
                Kind        = "Critical"
                State       = $match.State
                Status      = $match.Status
                StartMode   = $match.StartMode
                StartName   = $match.StartName
                PathName    = $match.PathName
                Healthy     = ($match.State -eq "Running")
            }
            $criticalDetected += $criticalItem
            if (-not $serviceMap.ContainsKey($match.Name)) { $serviceMap[$match.Name] = $criticalItem }
        } else {
            $criticalDetected += @{
                Name        = $critical
                DisplayName = $critical
                Kind        = "Critical"
                State       = "NotFound"
                Status      = "NotFound"
                StartMode   = "N/A"
                Healthy     = $false
            }
        }
    }

    # Verificacion detallada de cada servicio BioPlatform de la lista exacta
    $bioPlatformStatus = @()
    foreach ($bpName in $bioPlatformExact) {
        $found = $allServices | Where-Object {
            $_.DisplayName -eq $bpName -or $_.Name -eq $bpName -or $_.DisplayName -like "*$bpName*"
        } | Select-Object -First 1
        $bioPlatformStatus += @{
            DisplayName = $bpName
            Found       = ($null -ne $found)
            State       = if ($found) { $found.State } else { "NotFound" }
            StartMode   = if ($found) { $found.StartMode } else { "N/A" }
            Healthy     = if ($found) { ($found.State -eq "Running") } else { $false }
        }
    }

    $services     = @($serviceMap.Values | Sort-Object Kind, DisplayName, Name)
    $autoServices = @($services | Where-Object { $_.StartMode -eq "Auto" -or $_.StartMode -eq "Automatic" })
    $failedAuto   = @($autoServices | Where-Object { $_.State -ne "Running" })

    $status = "OK"
    $issues = @()

    if ($platformServices.Count -eq 0) {
        $status  = "WARNING"
        $issues += "No se detectaron servicios ZK/ZKBio/BioPlatform. Revisar nombres en services.msc."
    }

    if ($failedAuto.Count -gt 0) {
        $status = "CRITICAL"
        foreach ($svc in $failedAuto) {
            $issues += "Servicio automatico no esta Running: $($svc.DisplayName) [$($svc.Name)] = $($svc.State)"
        }
    }

    foreach ($svc in $criticalDetected) {
        if (-not $svc.Healthy) {
            $status  = "CRITICAL"
            $issues += "Servicio critico no esta Running: $($svc.DisplayName) = $($svc.State)"
        }
    }

    $bpInstalled = @($bioPlatformStatus | Where-Object { $_.Found })
    $bpHealthy = @($bpInstalled | Where-Object { $_.Healthy }).Count
    $bpTotal   = $bpInstalled.Count
    $bpFailed  = @($bioPlatformStatus | Where-Object { $_.Found -and -not $_.Healthy })
    foreach ($bp in $bpFailed) {
        if ($status -ne "CRITICAL") { $status = "WARNING" }
        $issues += "Servicio BioPlatform caido: $($bp.DisplayName) = $($bp.State)"
    }

    return @{
        Status                  = $status
        Services                = $services
        CriticalServices        = $criticalDetected
        CriticalServicesOk      = @($criticalDetected | Where-Object { $_.Healthy }).Count
        CriticalServicesTotal   = $criticalDetected.Count
        BioPlatformServices     = $bioPlatformStatus
        BioPlatformHealthy      = $bpHealthy
        BioPlatformTotal        = $bpTotal
        BioPlatformExpectedTotal = $bioPlatformStatus.Count
        BioPlatformMissing      = @($bioPlatformStatus | Where-Object { -not $_.Found }).Count
        ZKBIOOnline             = @($criticalDetected | Where-Object { $_.Name -like "*ZKBIOOnline*" -or $_.DisplayName -like "*ZKBIOOnline*" } | Select-Object -First 1)[0]
        PlatformServicesFound   = $platformServices.Count
        DependencyServicesFound = $dependencyServices.Count
        RunningCount            = @($services | Where-Object { $_.State -eq "Running" }).Count
        TotalCount              = $services.Count
        Issues                  = $issues
        DetectionPatterns       = @{
            Platform         = $platformPatterns
            Dependencies     = $dependencyPatterns
            BioPlatformExact = $bioPlatformExact
        }
    }
}

function Get-InstalledZKSoftware {
    $patterns = "ZK|ZKBio|BioTime|ZKAccess|CVSecurity|BioPlatform"
    $paths = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    $items = @()
    foreach ($path in $paths) {
        try {
            $items += Get-ItemProperty $path -ErrorAction SilentlyContinue |
                Where-Object { $_.DisplayName -and $_.DisplayName -match $patterns } |
                Select-Object DisplayName, DisplayVersion, Publisher, InstallDate, InstallLocation
        } catch { }
    }
    return @($items | Sort-Object DisplayName -Unique)
}

function Get-ListeningPorts {
    # Puerto 16001 incluido para BabyWare
    $portsOfInterest = @(80, 443, 3306, 5432, 6379, 8000, 8080, 8081, 8090, 8098, 9000, 16001)
    $listeners = @()
    try {
        $listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
            Where-Object { $portsOfInterest -contains $_.LocalPort } |
            Select-Object LocalAddress, LocalPort, OwningProcess
    } catch { }
    $result = @()
    foreach ($item in $listeners) {
        $proc = $null
        try { $proc = Get-Process -Id $item.OwningProcess -ErrorAction SilentlyContinue } catch { }
        $result += @{
            LocalAddress = $item.LocalAddress
            LocalPort    = $item.LocalPort
            ProcessId    = $item.OwningProcess
            ProcessName  = if ($proc) { $proc.ProcessName } else { "N/A" }
        }
    }
    return @($result | Sort-Object LocalPort, ProcessName)
}

function Get-RecentSystemEvents {
    $since  = (Get-Date).AddDays(-1)
    $events = @()
    try {
        $events = Get-WinEvent -FilterHashtable @{ LogName="System"; Level=1,2,3; StartTime=$since } `
            -MaxEvents 20 -ErrorAction SilentlyContinue |
            Select-Object TimeCreated, Id, ProviderName, LevelDisplayName, Message
    } catch { }
    return @($events | ForEach-Object {
        @{
            TimeCreated  = $_.TimeCreated.ToString("yyyy-MM-dd HH:mm:ss")
            Id           = $_.Id
            ProviderName = $_.ProviderName
            Level        = $_.LevelDisplayName
            Message      = if ($_.Message -and $_.Message.Length -gt 500) { $_.Message.Substring(0,500) } else { $_.Message }
        }
    })
}

function Get-OverallStatus {
    param(
        [hashtable]$HostHealth,
        [hashtable]$Disk,
        [hashtable]$Services,
        [hashtable]$Updates,
        [hashtable]$BabyWare,
        [int]$CpuLoadPct,
        [double]$RamUsedPct
    )
    $status = "OK"
    $issues = @()

    if ($Disk.Status -eq "CRITICAL" -or $Services.Status -eq "CRITICAL") { $status = "CRITICAL" }
    elseif ($Disk.Status -eq "WARNING" -or $Services.Status -eq "WARNING") { $status = "WARNING" }

    $issues += @($Disk.Issues)
    $issues += @($Services.Issues)

    if ($HostHealth.Status -eq "CRITICAL") {
        $status = "CRITICAL"; $issues += @($HostHealth.Issues)
    } elseif ($HostHealth.Status -eq "WARNING" -and $status -ne "CRITICAL") {
        $status = "WARNING";  $issues += @($HostHealth.Issues)
    }

    if ($BabyWare.Status -eq "CRITICAL") {
        $status = "CRITICAL"; $issues += @($BabyWare.Issues)
    } elseif ($BabyWare.Status -eq "WARNING" -and $status -ne "CRITICAL") {
        $status = "WARNING";  $issues += @($BabyWare.Issues)
    }

    if ($CpuLoadPct -ge 90) {
        $status = "CRITICAL"; $issues += "CPU en nivel critico: $CpuLoadPct%"
    } elseif ($CpuLoadPct -ge 80 -and $status -ne "CRITICAL") {
        $status = "WARNING";  $issues += "CPU alto: $CpuLoadPct%"
    }

    if ($RamUsedPct -ge 90) {
        $status = "CRITICAL"; $issues += "RAM en nivel critico: $RamUsedPct%"
    } elseif ($RamUsedPct -ge 80 -and $status -ne "CRITICAL") {
        $status = "WARNING";  $issues += "RAM alta: $RamUsedPct%"
    }

    if ($Updates.RebootRequired -and $status -ne "CRITICAL") {
        $status = "WARNING"; $issues += "Windows requiere reinicio"
    }

    return @{ Status=$status; Issues=$issues }
}

# ---------------------------------------------------------------------------
# HTML Report
# ---------------------------------------------------------------------------

function New-ZKHtmlReport {
    param([hashtable]$Data)

    $statusColor = if ($Data.Overall.Status -eq "CRITICAL") { "#dc2626" } elseif ($Data.Overall.Status -eq "WARNING") { "#d97706" } else { "#059669" }

    $issuesHtml = if ($Data.Overall.Issues.Count -gt 0) {
        "<ul>" + (($Data.Overall.Issues | ForEach-Object { "<li>$_</li>" }) -join "") + "</ul>"
    } else {
        "<p>Sin hallazgos criticos en esta ejecucion.</p>"
    }

    $diskRows = ($Data.Disk.Disks | ForEach-Object {
        $c = if ($_.PercentFree -lt 15) { "#dc2626" } elseif ($_.PercentFree -lt 25) { "#d97706" } else { "#059669" }
        "<tr><td>$($_.DeviceID)</td><td>$($_.SizeGB) GB</td><td>$($_.FreeGB) GB</td><td style='color:$c;font-weight:700'>$($_.PercentFree)%</td></tr>"
    }) -join ""

    $serviceRows = ($Data.ZKBio.Services | ForEach-Object {
        $c = if ($_.State -eq "Running") { "#059669" } else { "#dc2626" }
        "<tr><td><strong>$($_.DisplayName)</strong><br><span>$($_.Name)</span></td><td>$($_.Kind)</td><td style='color:$c;font-weight:700'>$($_.State)</td><td>$($_.StartMode)</td></tr>"
    }) -join ""
    if (-not $serviceRows) { $serviceRows = "<tr><td colspan='4'>No se detectaron servicios por patrones. Revisar DetectionPatterns en el JSON.</td></tr>" }

    $bioPlatformRows = ($Data.ZKBio.BioPlatformServices | ForEach-Object {
        $sc = if ($_.Healthy) { "#059669" } elseif (-not $_.Found) { "#94a3b8" } else { "#dc2626" }
        $sl = if (-not $_.Found) { "No encontrado" } else { $_.State }
        "<tr><td>$($_.DisplayName)</td><td style='color:$sc;font-weight:700'>$sl</td><td>$($_.StartMode)</td></tr>"
    }) -join ""

    $bwColor  = if ($Data.BabyWare.TcpOk)     { "#059669" } else { "#dc2626" }
    $bwStatus = if ($Data.BabyWare.Status -eq "OK") { "#059669" } elseif ($Data.BabyWare.Status -eq "WARNING") { "#d97706" } else { "#dc2626" }
    $bwProc   = if ($Data.BabyWare.ProcessFound) { "#059669" } else { "#94a3b8" }

    $softwareRows = ($Data.ZKBio.InstalledSoftware | ForEach-Object {
        "<tr><td>$($_.DisplayName)</td><td>$($_.DisplayVersion)</td><td>$($_.Publisher)</td><td>$($_.InstallDate)</td></tr>"
    }) -join ""
    if (-not $softwareRows) { $softwareRows = "<tr><td colspan='4'>No se detecto software ZK en el registro de programas instalados.</td></tr>" }

    $zkOnlineState = if ($Data.ZKBio.ZKBIOOnline) { $Data.ZKBio.ZKBIOOnline.State } else { "NotFound" }
    $zkOnlineColor = if ($zkOnlineState -eq "Running") { "#059669" } else { "#dc2626" }
    $bpSummaryColor = if ($Data.ZKBio.BioPlatformHealthy -eq $Data.ZKBio.BioPlatformTotal) { "#059669" } else { "#d97706" }

    $proxmoxPingColor = if ($Data.Host.Pingable) { "#059669" } else { "#dc2626" }
    $proxmoxWebColor  = if ($Data.Host.Ports.WebUI8006) { "#059669" } else { "#dc2626" }
    $proxmoxSshColor  = if ($Data.Host.Ports.SSH22) { "#059669" } else { "#dc2626" }
    $proxmoxStatusColor = if ($Data.Host.Status -eq "OK") { "#059669" } else { "#dc2626" }

    return @"
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Monitor SERV-ZK</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; background:#0f172a; color:#e2e8f0; padding:28px; }
    h1 { color:#c084fc; margin-bottom:4px; }
    h2 { color:#94a3b8; font-size:14px; text-transform:uppercase; letter-spacing:.06em; margin-top:28px; border-bottom:1px solid #334155; padding-bottom:4px; }
    .meta { color:#94a3b8; margin-bottom:22px; }
    .grid5 { display:grid; grid-template-columns:repeat(5, minmax(0,1fr)); gap:12px; margin:18px 0; }
    .grid2 { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px; margin:12px 0; }
    .card { background:#111827; border:1px solid #334155; border-radius:8px; padding:14px; }
    .label { color:#94a3b8; font-size:11px; text-transform:uppercase; font-weight:700; }
    .value { font-size:22px; font-weight:800; margin-top:6px; }
    .value-sm { font-size:16px; font-weight:800; margin-top:6px; }
    table { width:100%; border-collapse:collapse; margin-top:10px; background:#111827; }
    th, td { border:1px solid #334155; padding:8px 10px; text-align:left; font-size:13px; vertical-align:top; }
    th { background:#1e293b; color:#cbd5e1; }
    span { color:#94a3b8; font-size:11px; }
    .status { color:$statusColor; font-weight:900; }
    .issues { border-left:4px solid $statusColor; background:#111827; padding:12px 16px; border-radius:6px; }
  </style>
</head>
<body>
  <h1>Monitor SERV-ZK</h1>
  <div class="meta">$($Data.ReportDate) | $($Data.Node) | $($Data.IP) | $($Data.Role)</div>
  <div class="issues">
    <strong>Estado general: <span class="status">$($Data.Overall.Status)</span></strong>
    $issuesHtml
  </div>

  <div class="grid5">
    <div class="card"><div class="label">Host Proxmox</div><div class="value" style="color:$proxmoxStatusColor">$($Data.Host.Status)</div></div>
    <div class="card"><div class="label">Uptime</div><div class="value-sm">$($Data.Uptime)</div></div>
    <div class="card"><div class="label">CPU</div><div class="value">$($Data.System.CPU_LoadPct)%</div></div>
    <div class="card"><div class="label">RAM usada</div><div class="value">$($Data.RAM.UsedPct)%</div></div>
    <div class="card"><div class="label">ZKBIOOnline</div><div class="value-sm" style="color:$zkOnlineColor">$zkOnlineState</div></div>
  </div>

  <div class="grid2">
    <div class="card">
      <div class="label">BioPlatform Services</div>
      <div class="value" style="color:$bpSummaryColor">$($Data.ZKBio.BioPlatformHealthy) / $($Data.ZKBio.BioPlatformTotal) running</div>
    </div>
    <div class="card">
      <div class="label">BabyWare TCP/$($Data.BabyWare.Port)</div>
      <div class="value" style="color:$bwStatus">$($Data.BabyWare.Status)</div>
    </div>
  </div>

  <h2>Anfitrion Proxmox</h2>
  <table>
    <tr><th>Nombre</th><th>IP</th><th>Ping</th><th>Web UI 8006</th><th>SSH 22</th></tr>
    <tr>
      <td>$($Data.Host.Name)</td>
      <td>$($Data.Host.IP)</td>
      <td style="color:$proxmoxPingColor;font-weight:700">$($Data.Host.Pingable)</td>
      <td style="color:$proxmoxWebColor;font-weight:700">$($Data.Host.Ports.WebUI8006)</td>
      <td style="color:$proxmoxSshColor;font-weight:700">$($Data.Host.Ports.SSH22)</td>
    </tr>
  </table>

  <h2>BabyWare (Alarmas) - misma VM que ZKBio</h2>
  <table>
    <tr><th>IP</th><th>Puerto</th><th>TCP/$($Data.BabyWare.Port)</th><th>Proceso</th><th>Estado</th></tr>
    <tr>
      <td>$($Data.BabyWare.IP)</td>
      <td>$($Data.BabyWare.Port)</td>
      <td style="color:$bwColor;font-weight:700">$($Data.BabyWare.TcpOk)</td>
      <td style="color:$bwProc;font-weight:700">$($Data.BabyWare.ProcessName)</td>
      <td style="color:$bwStatus;font-weight:700">$($Data.BabyWare.Status)</td>
    </tr>
  </table>

  <h2>Discos</h2>
  <table><tr><th>Unidad</th><th>Total</th><th>Libre</th><th>% Libre</th></tr>$diskRows</table>

  <h2>Servicios BioPlatform (ZKBio CVSecurity)</h2>
  <table><tr><th>Servicio</th><th>Estado</th><th>Inicio</th></tr>$bioPlatformRows</table>

  <h2>Todos los servicios ZK detectados</h2>
  <table><tr><th>Servicio</th><th>Tipo</th><th>Estado</th><th>Inicio</th></tr>$serviceRows</table>

  <h2>Software ZK instalado</h2>
  <table><tr><th>Nombre</th><th>Version</th><th>Publisher</th><th>InstallDate</th></tr>$softwareRows</table>
</body>
</html>
"@
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

try {
    Write-Host "[1/8] Recolectando sistema operativo..." -ForegroundColor Cyan
    $os      = Get-CimInstance Win32_OperatingSystem
    $cs      = Get-CimInstance Win32_ComputerSystem
    $cpu     = @(Get-CimInstance Win32_Processor | Select-Object -ExpandProperty LoadPercentage)
    $cpuLoad = if ($cpu.Count -gt 0) { [int](($cpu | Measure-Object -Average).Average) } else { 0 }

    $uptime     = (Get-Date) - $os.LastBootUpTime
    $uptimeStr  = "{0}d {1}h {2}m" -f $uptime.Days, $uptime.Hours, $uptime.Minutes
    $ramTotalGB = Get-SafeRound ($os.TotalVisibleMemorySize / 1MB)
    $ramFreeGB  = Get-SafeRound ($os.FreePhysicalMemory     / 1MB)
    $ramUsedPct = Get-SafeRound ((1 - ($os.FreePhysicalMemory / $os.TotalVisibleMemorySize)) * 100) 1

    Write-Host "[2/8] Validando anfitrion Proxmox..." -ForegroundColor Cyan
    $hostHealth = Get-ProxmoxHostHealth -Name $ProxmoxHostName -IP $ProxmoxHostIP

    Write-Host "[3/8] Recolectando discos..." -ForegroundColor Cyan
    $disk = Get-DiskHealth

    Write-Host "[4/8] Detectando servicios ZKBio / BioPlatform..." -ForegroundColor Cyan
    $zkServices = Get-ZKRelatedServices -CriticalServices $CriticalZKServices

    Write-Host "[5/8] Detectando software instalado..." -ForegroundColor Cyan
    $installedZK = Get-InstalledZKSoftware
    $zkServices.InstalledSoftware = $installedZK

    Write-Host "[6/8] Chequeando servidor BabyWare (${BabyWareIP}:${BabyWarePort})..." -ForegroundColor Cyan
    $babyWare = Get-BabyWareHealth -IP $BabyWareIP -Port $BabyWarePort

    Write-Host "[7/8] Recolectando Windows Update, puertos y eventos..." -ForegroundColor Cyan
    $updates   = Get-UpdateStatus
    $listeners = Get-ListeningPorts
    $events    = Get-RecentSystemEvents

    $vmPing  = Test-NodePing -IP $ServerIP
    $overall = Get-OverallStatus `
        -HostHealth $hostHealth `
        -Disk       $disk `
        -Services   $zkServices `
        -Updates    $updates `
        -BabyWare   $babyWare `
        -CpuLoadPct $cpuLoad `
        -RamUsedPct $ramUsedPct

    $reportData = @{
        Node         = $env:COMPUTERNAME
        ExpectedNode = "SERV-ZK"
        IP           = $ServerIP
        Role         = "VM Windows 10 - Control de Acceso / ZKBio CVSecurity"
        Platform     = "ZKBio CVSecurity"
        Timestamp    = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        ReportDate   = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Uptime       = $uptimeStr
        Overall      = $overall
        Host         = $hostHealth
        BabyWare     = $babyWare
        VM = @{
            Name   = "SERV-ZK"
            IP     = $ServerIP
            Type   = "Windows 10 VM"
            Ping   = $vmPing
            Status = if ($vmPing.Pingable) { "OK" } else { "CRITICAL" }
        }
        Virtualization = @{
            Type         = "Proxmox VE"
            HostName     = $ProxmoxHostName
            HostIP       = $ProxmoxHostIP
            VMName       = "SERV-ZK"
            VMIP         = $ServerIP
            Relationship = "SERV-ZK corre como VM Windows dentro del anfitrion Proxmox"
            MetricsMode  = "Basic reachability only"
            NextStep     = "Para metricas reales del anfitrion y estado de VM, configurar Proxmox API token o SSH."
        }
        System = @{
            OS           = $os.Caption
            Version      = $os.Version
            BuildNumber  = $os.BuildNumber
            Architecture = $os.OSArchitecture
            Manufacturer = $cs.Manufacturer
            Model        = $cs.Model
            CPU_LoadPct  = $cpuLoad
            LastBoot     = $os.LastBootUpTime.ToString("yyyy-MM-dd HH:mm:ss")
        }
        RAM   = @{ TotalGB=$ramTotalGB; FreeGB=$ramFreeGB; UsedPct=$ramUsedPct }
        Disk  = $disk
        Disks = $disk.Disks
        Services = $zkServices.Services
        Updates  = $updates
        ZKBio    = $zkServices
        Network  = @{
            SelfPing        = $vmPing
            ListeningPorts  = $listeners
            PortsOfInterest = @(80, 443, 3306, 5432, 6379, 8000, 8080, 8081, 8090, 8098, 9000, 16001)
        }
        Events = @{
            SystemLast24h = $events
            Count         = $events.Count
        }
    }

    $htmlReport = New-ZKHtmlReport -Data $reportData

    $payload = @{
        service = $ServiceName
        data    = $reportData
        html    = $htmlReport
    }

    Write-Host "[8/8] Enviando datos a Skylab..." -ForegroundColor Cyan
    $jsonPayload = $payload | ConvertTo-Json -Depth 15
    $response    = Invoke-RestMethod -Uri $BackendUrl -Method Post -Body $jsonPayload -ContentType "application/json" -TimeoutSec 60

    Write-Host "[OK] Datos enviados: $($response.message)" -ForegroundColor Green
    Write-Host "Estado general : $($overall.Status)"       -ForegroundColor $(if ($overall.Status -eq "OK") { "Green" } elseif ($overall.Status -eq "WARNING") { "Yellow" } else { "Red" })
    Write-Host "Host Proxmox   : $($hostHealth.Status) | Ping=$($hostHealth.Pingable) | 8006=$($hostHealth.Ports.WebUI8006) | SSH=$($hostHealth.Ports.SSH22)" -ForegroundColor Gray
    Write-Host "ZKBIOOnline    : $($zkServices.ZKBIOOnline.State)" -ForegroundColor Gray
    Write-Host "BioPlatform    : $($zkServices.BioPlatformHealthy)/$($zkServices.BioPlatformTotal) running" -ForegroundColor Gray
    Write-Host "BabyWare       : $($babyWare.Status) | Ping=$($babyWare.Pingable) | TCP/${BabyWarePort}=$($babyWare.TcpOk)" -ForegroundColor Gray
    Write-Host "Discos         : $($disk.Status) | Updates: $($updates.Status)" -ForegroundColor Gray
    exit 0
} catch {
    Write-Host "[ERROR] Error ejecutando Monitor-SERV-ZK: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ScriptStackTrace) { Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray }
    exit 1
}
