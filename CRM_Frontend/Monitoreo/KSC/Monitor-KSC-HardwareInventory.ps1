<#
.SYNOPSIS
    Monitor KSC Hardware Inventory
.DESCRIPTION
    Lee el informe HTML "Informe de hardware" exportado desde Kaspersky
    Security Center y consolida informacion util para dashboard:
    - cantidad de dispositivos por sistema operativo
    - Windows Server, Windows 10, Windows 11 y otros
    - maquinas virtuales vs fisicas
    - clasificacion por "visible por ultima vez"

    No recolecta metricas de hardware detalladas; el foco es inventario
    y frescura de visibilidad de los dispositivos.
.USAGE
    PowerShell.exe -NonInteractive -NoProfile -ExecutionPolicy Bypass -File .\Monitor-KSC-HardwareInventory.ps1
    .\Monitor-KSC-HardwareInventory.ps1 -KasperskyReportsPath "F:\Informes KSC"
    .\Monitor-KSC-HardwareInventory.ps1 -ReportFile ".\Informe de hardware (9-6-2026 16-52-24).html" -SkipUpload
#>

param(
    [string]$BackendUrl           = "http://192.168.8.65:3001/api/monitoring/upload",
    [string]$KasperskyReportsPath = "F:\Informes KSC",
    [string]$ReportFile           = "",
    [string]$ServiceName          = "KSC-HARDWARE",
    [string]$NodeName             = "SERV-KSC",
    [switch]$SkipUpload
)

$ErrorActionPreference = "Continue"

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "   SKYLAB - Monitor KSC Hardware Inventory" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "Backend : $BackendUrl" -ForegroundColor Gray
Write-Host "Service : $ServiceName" -ForegroundColor Gray
Write-Host "Reports : $KasperskyReportsPath" -ForegroundColor Gray

function Get-LatestHardwareReport {
    if ($ReportFile -and (Test-Path -LiteralPath $ReportFile)) {
        return (Resolve-Path -LiteralPath $ReportFile).Path
    }

    if (-not (Test-Path -LiteralPath $KasperskyReportsPath)) {
        return $null
    }

    $file = Get-ChildItem -Path $KasperskyReportsPath -Filter "*.html" -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "Informe de hardware*" } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if ($file) { return $file.FullName }
    return $null
}

function Convert-HtmlToText {
    param([string]$Html)
    if ($null -eq $Html) { return "" }

    $text = $Html -replace '(?is)<script[^>]*>.*?</script>', ''
    $text = $text -replace '(?is)<style[^>]*>.*?</style>', ''
    $text = $text -replace '(?is)<[^>]+>', ' '
    $text = [System.Net.WebUtility]::HtmlDecode($text)
    $text = $text -replace '\s{2,}', ' '
    return $text.Trim()
}

function Get-HtmlTableRows {
    param([string]$FilePath)

    $raw = Get-Content -Path $FilePath -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    if (-not $raw) { return @() }

    $rows = [regex]::Matches($raw, '(?is)<tr[^>]*>(.*?)</tr>')
    $result = @()

    foreach ($row in $rows) {
        $cells = @()
        foreach ($cell in [regex]::Matches($row.Groups[1].Value, '(?is)<t[dh][^>]*>(.*?)</t[dh]>')) {
            $cells += Convert-HtmlToText -Html $cell.Groups[1].Value
        }
        if ($cells.Count -gt 0) { $result += ,$cells }
    }

    return $result
}

function Convert-SpanishKscDate {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value) -or $Value -eq "N/D") { return $null }

    $v = $Value.Trim().ToLowerInvariant()
    $v = $v -replace '\s+', ' '
    $v = $v -replace 'a\. m\.', 'AM'
    $v = $v -replace 'p\. m\.', 'PM'
    $v = $v -replace 'enero', 'January'
    $v = $v -replace 'febrero', 'February'
    $v = $v -replace 'marzo', 'March'
    $v = $v -replace 'abril', 'April'
    $v = $v -replace 'mayo', 'May'
    $v = $v -replace 'junio', 'June'
    $v = $v -replace 'julio', 'July'
    $v = $v -replace 'agosto', 'August'
    $v = $v -replace 'septiembre', 'September'
    $v = $v -replace 'setiembre', 'September'
    $v = $v -replace 'octubre', 'October'
    $v = $v -replace 'noviembre', 'November'
    $v = $v -replace 'diciembre', 'December'

    $formats = @(
        'MMMM d, yyyy hh:mm:ss tt',
        'MMMM dd, yyyy hh:mm:ss tt',
        'MMMM d, yyyy h:mm:ss tt',
        'MMMM dd, yyyy h:mm:ss tt',
        'MMMM d, yyyy HH:mm:ss',
        'MMMM dd, yyyy HH:mm:ss'
    )

    foreach ($format in $formats) {
        try {
            return [datetime]::ParseExact(
                $v,
                $format,
                [System.Globalization.CultureInfo]::InvariantCulture,
                [System.Globalization.DateTimeStyles]::AllowWhiteSpaces
            )
        } catch { }
    }

    try { return [datetime]::Parse($v, [System.Globalization.CultureInfo]::InvariantCulture) } catch { return $null }
}

function Get-OsBucket {
    param([string]$OperatingSystem)

    $os = ($OperatingSystem | ForEach-Object { "$_" }).Trim()
    if ($os -match 'Windows\s+Server') { return "Windows Server" }
    if ($os -match 'Windows\s+11')     { return "Windows 11" }
    if ($os -match 'Windows\s+10')     { return "Windows 10" }
    if ([string]::IsNullOrWhiteSpace($os) -or $os -eq "N/D") { return "Sin datos" }
    return "Otros"
}

function Test-IsVirtualMachine {
    param(
        [string]$Provider,
        [string]$Motherboard,
        [string]$Cpu,
        [string]$Serial
    )

    $text = "$Provider $Motherboard $Cpu $Serial"
    return ($text -match 'Virtual Machine|VirtualBox|VMware|KVM|Hyper-V|QEMU|Bochs|Xen|Parallels')
}

function Get-VisibilityBucket {
    param($LastSeen)

    if (-not $LastSeen) { return "Sin datos" }

    $days = ((Get-Date) - ([datetime]$LastSeen)).TotalDays
    if ($days -le 1)  { return "UltimoDia" }
    if ($days -le 7)  { return "UltimaSemana" }
    if ($days -le 30) { return "MasDeUnaSemana" }
    return "MasDeUnMes"
}

function Increment-Count {
    param([hashtable]$Table, [string]$Key)
    if (-not $Table.ContainsKey($Key)) { $Table[$Key] = 0 }
    $Table[$Key]++
}

function Get-CountValue {
    param([hashtable]$Table, [string]$Key)
    if ($Table.ContainsKey($Key)) { return [int]$Table[$Key] }
    return 0
}

function Parse-HardwareInventory {
    param([string]$FilePath)

    $rows = Get-HtmlTableRows -FilePath $FilePath
    $header = $null
    $devices = @()

    foreach ($row in $rows) {
        if (-not $header -and ($row -contains "Nombre") -and ($row -contains "Sistema operativo") -and ($row -contains "Visible por última vez")) {
            $header = $row
            continue
        }

        if (-not $header) { continue }
        if ($row.Count -lt $header.Count) { continue }

        $record = @{}
        for ($i = 0; $i -lt $header.Count; $i++) {
            $record[$header[$i]] = $row[$i]
        }

        if (-not $record["Nombre"] -or $record["Nombre"] -eq "Nombre") { continue }

        $lastSeen = Convert-SpanishKscDate -Value $record["Visible por última vez"]
        $osBucket = Get-OsBucket -OperatingSystem $record["Sistema operativo"]
        $isVirtual = Test-IsVirtualMachine `
            -Provider $record["Proveedor"] `
            -Motherboard $record["Placa madre"] `
            -Cpu $record["CPU"] `
            -Serial $record["Número de serie"]

        $devices += [pscustomobject]@{
            Name              = $record["Nombre"]
            Provider          = $record["Proveedor"]
            OperatingSystem   = $record["Sistema operativo"]
            OsBucket          = $osBucket
            IsVirtual         = [bool]$isVirtual
            LastSeen          = if ($lastSeen) { $lastSeen.ToString("yyyy-MM-dd HH:mm:ss") } else { $null }
            LastSeenDays      = if ($lastSeen) { [math]::Round(((Get-Date) - $lastSeen).TotalDays, 2) } else { $null }
            VisibilityBucket  = Get-VisibilityBucket -LastSeen $lastSeen
        }
    }

    $byOs = @{}
    $byVisibility = @{
        UltimoDia       = 0
        UltimaSemana    = 0
        MasDeUnaSemana  = 0
        MasDeUnMes      = 0
        SinDatos        = 0
    }

    foreach ($device in $devices) {
        Increment-Count -Table $byOs -Key $device.OsBucket
        if ($byVisibility.ContainsKey($device.VisibilityBucket)) {
            $byVisibility[$device.VisibilityBucket]++
        } else {
            $byVisibility.SinDatos++
        }
    }

    $virtualCount = @($devices | Where-Object { $_.IsVirtual }).Count
    $physicalCount = $devices.Count - $virtualCount

    return @{
        SourceFile = Split-Path -Path $FilePath -Leaf
        SourcePath = $FilePath
        ParsedAt   = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        TotalDevices = $devices.Count
        OperatingSystems = @{
            WindowsServer = Get-CountValue -Table $byOs -Key "Windows Server"
            Windows10     = Get-CountValue -Table $byOs -Key "Windows 10"
            Windows11     = Get-CountValue -Table $byOs -Key "Windows 11"
            Otros         = Get-CountValue -Table $byOs -Key "Otros"
            SinDatos      = Get-CountValue -Table $byOs -Key "Sin datos"
            Breakdown     = $byOs
        }
        Virtualization = @{
            VirtualMachines = $virtualCount
            PhysicalDevices = $physicalCount
        }
        LastSeen = $byVisibility
        Devices = @($devices | Sort-Object Name)
    }
}

function New-HardwareInventoryHtml {
    param($Data)

    $inv = $Data.Kaspersky.HardwareInventory
    $ls = $inv.LastSeen
    $os = $inv.OperatingSystems
    $vm = $inv.Virtualization
    $generated = $Data.ReportDate

    return @"
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>KSC Hardware Inventory</title>
  <style>
    body{font-family:Segoe UI,Arial,sans-serif;background:#07111f;color:#dbe7f3;margin:0;padding:28px}
    h1{margin:0 0 6px;font-size:24px}
    .muted{color:#8ea0b5;font-size:12px}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:22px 0}
    .card{border:1px solid #1f3146;background:#0b1626;border-radius:10px;padding:14px}
    .label{color:#8ea0b5;text-transform:uppercase;font-size:11px;font-weight:700;letter-spacing:.06em}
    .value{font-size:26px;font-weight:800;margin-top:6px;color:#34d399}
    table{border-collapse:collapse;width:100%;margin-top:14px;font-size:12px}
    th,td{border:1px solid #1f3146;padding:7px 9px;text-align:left}
    th{background:#101f33;color:#dbe7f3}
  </style>
</head>
<body>
  <h1>KSC Hardware Inventory</h1>
  <div class="muted">Nodo: $($Data.Node) · Generado: $generated · Fuente: $($inv.SourceFile)</div>
  <div class="grid">
    <div class="card"><div class="label">Dispositivos</div><div class="value">$($inv.TotalDevices)</div></div>
    <div class="card"><div class="label">Windows Server</div><div class="value">$($os.WindowsServer)</div></div>
    <div class="card"><div class="label">Windows 10</div><div class="value">$($os.Windows10)</div></div>
    <div class="card"><div class="label">Windows 11</div><div class="value">$($os.Windows11)</div></div>
    <div class="card"><div class="label">Maquinas virtuales</div><div class="value">$($vm.VirtualMachines)</div></div>
    <div class="card"><div class="label">Fisicos</div><div class="value">$($vm.PhysicalDevices)</div></div>
  </div>
  <h2>Visible por ultima vez</h2>
  <table>
    <tr><th>Ultimo dia</th><th>Ultima semana</th><th>Mas de una semana</th><th>Mas de un mes</th><th>Sin datos</th></tr>
    <tr><td>$($ls.UltimoDia)</td><td>$($ls.UltimaSemana)</td><td>$($ls.MasDeUnaSemana)</td><td>$($ls.MasDeUnMes)</td><td>$($ls.SinDatos)</td></tr>
  </table>
</body>
</html>
"@
}

$hardwareReport = Get-LatestHardwareReport
if (-not $hardwareReport) {
    Write-Host "[ERROR] No se encontro Informe de hardware en $KasperskyReportsPath" -ForegroundColor Red
    exit 1
}

Write-Host "Informe : $hardwareReport" -ForegroundColor Gray

$inventory = Parse-HardwareInventory -FilePath $hardwareReport

$reportData = @{
    Node       = $NodeName
    Role       = "Kaspersky Security Center Hardware Inventory"
    ReportDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Kaspersky  = @{
        HardwareInventory = $inventory
    }
}

$htmlReport = New-HardwareInventoryHtml -Data $reportData
$payload = @{
    service = $ServiceName
    data    = $reportData
    html    = $htmlReport
}

Write-Host "Dispositivos       : $($inventory.TotalDevices)" -ForegroundColor Gray
Write-Host "Windows Server     : $($inventory.OperatingSystems.WindowsServer)" -ForegroundColor Gray
Write-Host "Windows 10         : $($inventory.OperatingSystems.Windows10)" -ForegroundColor Gray
Write-Host "Windows 11         : $($inventory.OperatingSystems.Windows11)" -ForegroundColor Gray
Write-Host "Maquinas virtuales : $($inventory.Virtualization.VirtualMachines)" -ForegroundColor Gray
Write-Host "Ultimo dia         : $($inventory.LastSeen.UltimoDia)" -ForegroundColor Gray
Write-Host "Ultima semana      : $($inventory.LastSeen.UltimaSemana)" -ForegroundColor Gray
Write-Host "Mas de una semana  : $($inventory.LastSeen.MasDeUnaSemana)" -ForegroundColor Gray
Write-Host "Mas de un mes      : $($inventory.LastSeen.MasDeUnMes)" -ForegroundColor Gray

if ($SkipUpload) {
    Write-Host "[INFO] SkipUpload activo. No se enviaron datos al backend." -ForegroundColor Yellow
    exit 0
}

try {
    $jsonPayload = $payload | ConvertTo-Json -Depth 20
    Invoke-RestMethod -Uri $BackendUrl -Method Post -Body $jsonPayload -ContentType "application/json"
    Write-Host "[OK] Inventario KSC-HARDWARE enviado correctamente." -ForegroundColor Green
} catch {
    Write-Host "[ERROR] No se pudo enviar el inventario: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
