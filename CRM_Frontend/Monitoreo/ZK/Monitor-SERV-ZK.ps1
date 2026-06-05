<#
.SYNOPSIS
    Monitor SERV-ZK (Windows 10 / ZKBio CVSecurity)
.DESCRIPTION
    Recolecta salud local de la VM Windows SERV-ZK y detecta servicios
    asociados a ZKBio CVSecurity, BioTime, ZKAccess y dependencias comunes.
    Tambien valida conectividad basica hacia el anfitrion Proxmox.

    En esta primera fase no consulta la plataforma ZKBio por API o base de datos.
    El objetivo es enviar al CRM un snapshot confiable de sistema operativo,
    recursos, disco, Windows Update y servicios relevantes.
.USAGE
    PowerShell.exe -NonInteractive -NoProfile -ExecutionPolicy Bypass -File .\Monitor-SERV-ZK.ps1

    Parametros opcionales:
    .\Monitor-SERV-ZK.ps1 -BackendUrl "http://192.168.8.65:3001/api/monitoring/upload"
    .\Monitor-SERV-ZK.ps1 -ServiceName "SERV-ZK" -ServerIP "192.168.8.112" -ProxmoxHostIP "192.168.8.50"
#>

param(
    [string]$BackendUrl = "http://192.168.8.65:3001/api/monitoring/upload",
    [string]$ServiceName = "SERV-ZK",
    [string]$ServerIP = "192.168.8.112",
    [string]$ProxmoxHostName = "PROXMOX-ZK",
    [string]$ProxmoxHostIP = "192.168.8.50",
    [string[]]$CriticalZKServices = @("ZKBIOOnline Service")
)

$ErrorActionPreference = "Continue"

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "   SKYLAB - Monitor SERV-ZK (Windows 10 / ZKBio)" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "Backend : $BackendUrl" -ForegroundColor Gray
Write-Host "Service : $ServiceName" -ForegroundColor Gray
Write-Host "VM IP   : $ServerIP" -ForegroundColor Gray
Write-Host "Host    : $ProxmoxHostName ($ProxmoxHostIP)" -ForegroundColor Gray

function Get-SafeRound {
    param(
        [double]$Value,
        [int]$Digits = 2
    )
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

    $pendingCount = 0
    $updateQueryError = $null
    try {
        $updateSession = New-Object -ComObject Microsoft.Update.Session
        $updateSearcher = $updateSession.CreateUpdateSearcher()
        $searchResult = $updateSearcher.Search("IsInstalled=0 and Type='Software' and IsHidden=0")
        $pendingCount = $searchResult.Updates.Count
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
        PendingCount = $pendingCount
        RebootRequired = $rebootPending
        LastInstalled = if ($lastUpdate -and $lastUpdate.InstalledOn) { $lastUpdate.InstalledOn.ToString("yyyy-MM-dd") } else { "Desconocido" }
        LastKB = if ($lastUpdate -and $lastUpdate.HotFixID) { $lastUpdate.HotFixID } else { "N/A" }
        Status = if ($rebootPending) { "Reinicio Requerido" } elseif ($pendingCount -gt 0) { "$pendingCount Pendientes" } else { "OK" }
        QueryError = $updateQueryError
    }
}

function Get-DiskHealth {
    $disks = @()
    try {
        $disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" |
            Select-Object DeviceID,
                @{N='SizeGB';E={Get-SafeRound ($_.Size / 1GB)}},
                @{N='FreeGB';E={Get-SafeRound ($_.FreeSpace / 1GB)}},
                @{N='PercentFree';E={Get-SafeRound (($_.FreeSpace / $_.Size) * 100)}}
    } catch { }

    $status = "OK"
    $issues = @()
    foreach ($disk in $disks) {
        if ($disk.PercentFree -lt 15) {
            $status = "CRITICAL"
            $issues += "Disco $($disk.DeviceID) con espacio critico: $($disk.PercentFree)% libre"
        } elseif ($disk.PercentFree -lt 25 -and $status -ne "CRITICAL") {
            $status = "WARNING"
            $issues += "Disco $($disk.DeviceID) con espacio bajo: $($disk.PercentFree)% libre"
        }
    }

    return @{
        Status = $status
        Disks = @($disks)
        Issues = $issues
    }
}

function Test-TcpPort {
    param(
        [string]$ComputerName,
        [int]$Port,
        [int]$TimeoutMs = 1500
    )

    $client = $null
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $async = $client.BeginConnect($ComputerName, $Port, $null, $null)
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
    param(
        [string]$IP,
        [int]$Count = 2
    )

    try {
        $responses = @(Test-Connection -ComputerName $IP -Count $Count -ErrorAction SilentlyContinue)
        if ($responses.Count -eq 0) {
            return @{
                Status = "DOWN"
                Pingable = $false
                LatencyMs = $null
                CheckedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
            }
        }

        $avg = ($responses | Measure-Object -Property ResponseTime -Average).Average
        return @{
            Status = "UP"
            Pingable = $true
            LatencyMs = [int][math]::Round($avg, 0)
            CheckedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        }
    } catch {
        return @{
            Status = "DOWN"
            Pingable = $false
            LatencyMs = $null
            Error = $_.Exception.Message
            CheckedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        }
    }
}

function Get-ProxmoxHostHealth {
    param(
        [string]$Name,
        [string]$IP
    )

    $ping = Test-NodePing -IP $IP
    $pingable = $ping.Pingable

    $webUi = Test-TcpPort -ComputerName $IP -Port 8006
    $ssh = Test-TcpPort -ComputerName $IP -Port 22

    $status = "OK"
    $issues = @()

    if (-not $pingable) {
        $status = "CRITICAL"
        $issues += "Anfitrion Proxmox $Name ($IP) no responde a ping"
    }

    if (-not $webUi) {
        if ($status -ne "CRITICAL") { $status = "WARNING" }
        $issues += "Puerto Proxmox Web UI 8006 no responde en $IP"
    }

    if (-not $ssh) {
        if ($status -ne "CRITICAL") { $status = "WARNING" }
        $issues += "Puerto SSH 22 no responde en $IP"
    }

    return @{
        Name = $Name
        IP = $IP
        Type = "Proxmox VE Host"
        Status = $status
        Pingable = $pingable
        LatencyMs = $ping.LatencyMs
        Ping = $ping
        Ports = @{
            WebUI8006 = $webUi
            SSH22 = $ssh
        }
        Checks = @{
            ICMP = $pingable
            TCP8006 = $webUi
            TCP22 = $ssh
        }
        Issues = $issues
        Note = "Chequeo basico desde la VM Windows. Metricas reales de Proxmox requieren API token o SSH."
    }
}

function Get-ZKRelatedServices {
    param([string[]]$CriticalServices = @("ZKBIOOnline Service"))

    $platformPatterns = @(
        "ZK",
        "ZKBio",
        "BioTime",
        "ZKAccess",
        "CVSecurity",
        "Access",
        "Attendance"
    )

    $dependencyPatterns = @(
        "MySQL",
        "MariaDB",
        "PostgreSQL",
        "Postgres",
        "SQL Server",
        "MSSQL",
        "Redis",
        "Nginx",
        "Apache",
        "Tomcat"
    )

    $allServices = @()
    try {
        $allServices = Get-CimInstance Win32_Service |
            Select-Object Name, DisplayName, State, Status, StartMode, StartName, PathName
    } catch { }

    $platformRegex = ($platformPatterns | ForEach-Object { [regex]::Escape($_) }) -join "|"
    $dependencyRegex = ($dependencyPatterns | ForEach-Object { [regex]::Escape($_) }) -join "|"

    $platformServices = @($allServices | Where-Object {
        ($_.Name -match $platformRegex) -or
        ($_.DisplayName -match $platformRegex) -or
        ($_.PathName -match $platformRegex)
    } | Sort-Object DisplayName, Name)

    $dependencyServices = @($allServices | Where-Object {
        ($_.Name -match $dependencyRegex) -or
        ($_.DisplayName -match $dependencyRegex) -or
        ($_.PathName -match $dependencyRegex)
    } | Sort-Object DisplayName, Name)

    $serviceMap = @{}
    foreach ($svc in @($platformServices + $dependencyServices)) {
        if (-not $serviceMap.ContainsKey($svc.Name)) {
            $kind = if ($platformServices.Name -contains $svc.Name) { "Platform" } else { "Dependency" }
            $serviceMap[$svc.Name] = @{
                Name = $svc.Name
                DisplayName = $svc.DisplayName
                Kind = $kind
                State = $svc.State
                Status = $svc.Status
                StartMode = $svc.StartMode
                StartName = $svc.StartName
                PathName = $svc.PathName
            }
        }
    }

    $services = @($serviceMap.Values | Sort-Object Kind, DisplayName, Name)
    $autoServices = @($services | Where-Object { $_.StartMode -eq "Auto" -or $_.StartMode -eq "Automatic" })
    $failedAuto = @($autoServices | Where-Object { $_.State -ne "Running" })
    $criticalDetected = @()

    foreach ($critical in $CriticalServices) {
        $match = $allServices | Where-Object {
            $_.Name -eq $critical -or
            $_.DisplayName -eq $critical -or
            $_.Name -like "*$critical*" -or
            $_.DisplayName -like "*$critical*"
        } | Select-Object -First 1

        if ($match) {
            $criticalItem = @{
                Name = $match.Name
                DisplayName = $match.DisplayName
                Kind = "Critical"
                State = $match.State
                Status = $match.Status
                StartMode = $match.StartMode
                StartName = $match.StartName
                PathName = $match.PathName
                Healthy = ($match.State -eq "Running")
            }
            $criticalDetected += $criticalItem

            if (-not $serviceMap.ContainsKey($match.Name)) {
                $serviceMap[$match.Name] = $criticalItem
            }
        } else {
            $criticalDetected += @{
                Name = $critical
                DisplayName = $critical
                Kind = "Critical"
                State = "NotFound"
                Status = "NotFound"
                StartMode = "N/A"
                Healthy = $false
            }
        }
    }

    $services = @($serviceMap.Values | Sort-Object Kind, DisplayName, Name)
    $autoServices = @($services | Where-Object { $_.StartMode -eq "Auto" -or $_.StartMode -eq "Automatic" })
    $failedAuto = @($autoServices | Where-Object { $_.State -ne "Running" })

    $status = "OK"
    $issues = @()

    if ($platformServices.Count -eq 0) {
        $status = "WARNING"
        $issues += "No se detectaron servicios con patrones ZK/ZKBio/BioTime/CVSecurity. Revisar nombres reales en services.msc."
    }

    if ($failedAuto.Count -gt 0) {
        $status = "CRITICAL"
        foreach ($svc in $failedAuto) {
            $issues += "Servicio automatico no esta Running: $($svc.DisplayName) [$($svc.Name)] = $($svc.State)"
        }
    }

    foreach ($svc in $criticalDetected) {
        if (-not $svc.Healthy) {
            $status = "CRITICAL"
            $issues += "Servicio critico ZK no esta Running: $($svc.DisplayName) [$($svc.Name)] = $($svc.State)"
        }
    }

    return @{
        Status = $status
        Services = $services
        CriticalServices = $criticalDetected
        CriticalServicesOk = @($criticalDetected | Where-Object { $_.Healthy }).Count
        CriticalServicesTotal = $criticalDetected.Count
        ZKBIOOnline = @($criticalDetected | Where-Object { $_.Name -like "*ZKBIOOnline*" -or $_.DisplayName -like "*ZKBIOOnline*" } | Select-Object -First 1)[0]
        PlatformServicesFound = $platformServices.Count
        DependencyServicesFound = $dependencyServices.Count
        RunningCount = @($services | Where-Object { $_.State -eq "Running" }).Count
        TotalCount = $services.Count
        Issues = $issues
        DetectionPatterns = @{
            Platform = $platformPatterns
            Dependencies = $dependencyPatterns
        }
    }
}

function Get-InstalledZKSoftware {
    $patterns = "ZK|ZKBio|BioTime|ZKAccess|CVSecurity"
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
    $portsOfInterest = @(80, 443, 3306, 5432, 6379, 8000, 8080, 8081, 8090, 8098, 9000)
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
            LocalPort = $item.LocalPort
            ProcessId = $item.OwningProcess
            ProcessName = if ($proc) { $proc.ProcessName } else { "N/A" }
        }
    }

    return @($result | Sort-Object LocalPort, ProcessName)
}

function Get-RecentSystemEvents {
    $since = (Get-Date).AddDays(-1)
    $events = @()
    try {
        $events = Get-WinEvent -FilterHashtable @{ LogName = "System"; Level = 1,2,3; StartTime = $since } -MaxEvents 20 -ErrorAction SilentlyContinue |
            Select-Object TimeCreated, Id, ProviderName, LevelDisplayName, Message
    } catch { }

    return @($events | ForEach-Object {
        @{
            TimeCreated = $_.TimeCreated.ToString("yyyy-MM-dd HH:mm:ss")
            Id = $_.Id
            ProviderName = $_.ProviderName
            Level = $_.LevelDisplayName
            Message = if ($_.Message -and $_.Message.Length -gt 500) { $_.Message.Substring(0, 500) } else { $_.Message }
        }
    })
}

function Get-OverallStatus {
    param(
        [hashtable]$HostHealth,
        [hashtable]$Disk,
        [hashtable]$Services,
        [hashtable]$Updates,
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
        $status = "CRITICAL"
        $issues += @($HostHealth.Issues)
    } elseif ($HostHealth.Status -eq "WARNING" -and $status -ne "CRITICAL") {
        $status = "WARNING"
        $issues += @($HostHealth.Issues)
    }

    if ($CpuLoadPct -ge 90) {
        $status = "CRITICAL"
        $issues += "CPU en nivel critico: $CpuLoadPct%"
    } elseif ($CpuLoadPct -ge 80 -and $status -ne "CRITICAL") {
        $status = "WARNING"
        $issues += "CPU alto: $CpuLoadPct%"
    }

    if ($RamUsedPct -ge 90) {
        $status = "CRITICAL"
        $issues += "RAM en nivel critico: $RamUsedPct%"
    } elseif ($RamUsedPct -ge 80 -and $status -ne "CRITICAL") {
        $status = "WARNING"
        $issues += "RAM alta: $RamUsedPct%"
    }

    if ($Updates.RebootRequired -and $status -ne "CRITICAL") {
        $status = "WARNING"
        $issues += "Windows requiere reinicio"
    }

    return @{
        Status = $status
        Issues = $issues
    }
}

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

    $softwareRows = ($Data.ZKBio.InstalledSoftware | ForEach-Object {
        "<tr><td>$($_.DisplayName)</td><td>$($_.DisplayVersion)</td><td>$($_.Publisher)</td><td>$($_.InstallDate)</td></tr>"
    }) -join ""
    if (-not $softwareRows) { $softwareRows = "<tr><td colspan='4'>No se detecto software ZK en el registro de programas instalados.</td></tr>" }

    return @"
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Monitor SERV-ZK</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; background:#0f172a; color:#e2e8f0; padding:28px; }
    h1 { color:#c084fc; margin-bottom:4px; }
    h2 { color:#94a3b8; font-size:14px; text-transform:uppercase; letter-spacing:.06em; margin-top:28px; }
    .meta { color:#94a3b8; margin-bottom:22px; }
    .grid { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:12px; margin:18px 0; }
    .card { background:#111827; border:1px solid #334155; border-radius:8px; padding:14px; }
    .label { color:#94a3b8; font-size:11px; text-transform:uppercase; font-weight:700; }
    .value { font-size:24px; font-weight:800; margin-top:6px; }
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
  <div class="grid">
    <div class="card"><div class="label">Host Proxmox</div><div class="value">$($Data.Host.Status)</div></div>
    <div class="card"><div class="label">Uptime</div><div class="value">$($Data.Uptime)</div></div>
    <div class="card"><div class="label">CPU</div><div class="value">$($Data.System.CPU_LoadPct)%</div></div>
    <div class="card"><div class="label">RAM usada</div><div class="value">$($Data.RAM.UsedPct)%</div></div>
  </div>
  <h2>Anfitrion Proxmox</h2>
  <table>
    <tr><th>Nombre</th><th>IP</th><th>Ping</th><th>Web UI 8006</th><th>SSH 22</th></tr>
    <tr><td>$($Data.Host.Name)</td><td>$($Data.Host.IP)</td><td>$($Data.Host.Pingable)</td><td>$($Data.Host.Ports.WebUI8006)</td><td>$($Data.Host.Ports.SSH22)</td></tr>
  </table>
  <h2>Discos</h2>
  <table><tr><th>Unidad</th><th>Total</th><th>Libre</th><th>% Libre</th></tr>$diskRows</table>
  <h2>Servicios detectados</h2>
  <table><tr><th>Servicio</th><th>Tipo</th><th>Estado</th><th>Inicio</th></tr>$serviceRows</table>
  <h2>Software ZK instalado</h2>
  <table><tr><th>Nombre</th><th>Version</th><th>Publisher</th><th>InstallDate</th></tr>$softwareRows</table>
</body>
</html>
"@
}

try {
    Write-Host "[1/7] Recolectando sistema operativo..." -ForegroundColor Cyan
    $os = Get-CimInstance Win32_OperatingSystem
    $cs = Get-CimInstance Win32_ComputerSystem
    $cpu = @(Get-CimInstance Win32_Processor | Select-Object -ExpandProperty LoadPercentage)
    $cpuLoad = if ($cpu.Count -gt 0) { [int](($cpu | Measure-Object -Average).Average) } else { 0 }

    $uptime = (Get-Date) - $os.LastBootUpTime
    $uptimeStr = "{0}d {1}h {2}m" -f $uptime.Days, $uptime.Hours, $uptime.Minutes
    $ramTotalGB = Get-SafeRound ($os.TotalVisibleMemorySize / 1MB)
    $ramFreeGB = Get-SafeRound ($os.FreePhysicalMemory / 1MB)
    $ramUsedPct = Get-SafeRound ((1 - ($os.FreePhysicalMemory / $os.TotalVisibleMemorySize)) * 100) 1

    Write-Host "[2/8] Validando anfitrion Proxmox..." -ForegroundColor Cyan
    $hostHealth = Get-ProxmoxHostHealth -Name $ProxmoxHostName -IP $ProxmoxHostIP

    Write-Host "[3/8] Recolectando discos..." -ForegroundColor Cyan
    $disk = Get-DiskHealth

    Write-Host "[4/8] Detectando servicios ZKBio/CVSecurity..." -ForegroundColor Cyan
    $zkServices = Get-ZKRelatedServices -CriticalServices $CriticalZKServices

    Write-Host "[5/8] Detectando software instalado..." -ForegroundColor Cyan
    $installedZK = Get-InstalledZKSoftware
    $zkServices.InstalledSoftware = $installedZK

    Write-Host "[6/8] Recolectando Windows Update y puertos..." -ForegroundColor Cyan
    $updates = Get-UpdateStatus
    $listeners = Get-ListeningPorts

    Write-Host "[7/8] Recolectando eventos recientes del sistema..." -ForegroundColor Cyan
    $events = Get-RecentSystemEvents

    $vmPing = Test-NodePing -IP $ServerIP
    $overall = Get-OverallStatus -HostHealth $hostHealth -Disk $disk -Services $zkServices -Updates $updates -CpuLoadPct $cpuLoad -RamUsedPct $ramUsedPct

    $reportData = @{
        Node = $env:COMPUTERNAME
        ExpectedNode = "SERV-ZK"
        IP = $ServerIP
        Role = "VM Windows 10 - Control de Acceso / ZKBio CVSecurity"
        Platform = "ZKBio CVSecurity"
        Timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        ReportDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Uptime = $uptimeStr
        Overall = $overall
        Host = $hostHealth
        VM = @{
            Name = "SERV-ZK"
            IP = $ServerIP
            Type = "Windows 10 VM"
            Ping = $vmPing
            Status = if ($vmPing.Pingable) { "OK" } else { "CRITICAL" }
        }
        Virtualization = @{
            Type = "Proxmox VE"
            HostName = $ProxmoxHostName
            HostIP = $ProxmoxHostIP
            VMName = "SERV-ZK"
            VMIP = $ServerIP
            Relationship = "SERV-ZK corre como VM Windows dentro del anfitrion Proxmox"
            MetricsMode = "Basic reachability only"
            NextStep = "Para CPU/RAM/storage reales del anfitrion y estado de VM, configurar Proxmox API token o SSH."
        }
        System = @{
            OS = $os.Caption
            Version = $os.Version
            BuildNumber = $os.BuildNumber
            Architecture = $os.OSArchitecture
            Manufacturer = $cs.Manufacturer
            Model = $cs.Model
            CPU_LoadPct = $cpuLoad
            LastBoot = $os.LastBootUpTime.ToString("yyyy-MM-dd HH:mm:ss")
        }
        RAM = @{
            TotalGB = $ramTotalGB
            FreeGB = $ramFreeGB
            UsedPct = $ramUsedPct
        }
        Disk = $disk
        Disks = $disk.Disks
        Services = $zkServices.Services
        Updates = $updates
        ZKBio = $zkServices
        Network = @{
            SelfPing = $vmPing
            ListeningPorts = $listeners
            PortsOfInterest = @(80, 443, 3306, 5432, 6379, 8000, 8080, 8081, 8090, 8098, 9000)
        }
        Events = @{
            SystemLast24h = $events
            Count = $events.Count
        }
    }

    $htmlReport = New-ZKHtmlReport -Data $reportData

    $payload = @{
        service = $ServiceName
        data = $reportData
        html = $htmlReport
    }

    Write-Host "[8/8] Enviando datos a Skylab..." -ForegroundColor Cyan
    $jsonPayload = $payload | ConvertTo-Json -Depth 15
    $response = Invoke-RestMethod -Uri $BackendUrl -Method Post -Body $jsonPayload -ContentType "application/json" -TimeoutSec 60

    Write-Host "[OK] Datos de SERV-ZK enviados correctamente: $($response.message)" -ForegroundColor Green
    Write-Host "Estado general: $($overall.Status)" -ForegroundColor $(if ($overall.Status -eq "OK") { "Green" } elseif ($overall.Status -eq "WARNING") { "Yellow" } else { "Red" })
    Write-Host "Host Proxmox: $($hostHealth.Status) | Ping=$($hostHealth.Pingable) | 8006=$($hostHealth.Ports.WebUI8006) | SSH=$($hostHealth.Ports.SSH22)" -ForegroundColor Gray
    Write-Host "Servicios detectados: $($zkServices.RunningCount)/$($zkServices.TotalCount) running" -ForegroundColor Gray
    Write-Host "Discos: $($disk.Status) | Updates: $($updates.Status)" -ForegroundColor Gray
    exit 0
} catch {
    Write-Host "[ERROR] Error ejecutando Monitor-SERV-ZK: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ScriptStackTrace) {
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
    }
    exit 1
}
