<#
.SYNOPSIS
    Monitor SERV-KSC (Kaspersky Security Center Server)
.DESCRIPTION
    Salud local del servidor + Lectura y extracción de datos clave
    de los 5 informes HTML generados por la consola de Kaspersky.
    Los resultados se envían en un único JSON al servidor de monitoreo
    y se genera un informe HTML consolidado en la carpeta de informes.
#>

$BackendUrl           = "http://192.168.8.65:3001/api/monitoring/upload"
$KasperskyReportsPath = "F:\Informes KSC"
$BackupPath           = "E:\BackUp KSC"

function Get-BackupStatus {
    if (-not (Test-Path $BackupPath)) {
        return @{
            Estado          = "ERROR - Ruta no encontrada"
            UltimoBackup    = "N/D"
            ArchivoNombre   = "N/D"
            TamanoMB        = 0
            DiasTranscurridos = -1
        }
    }

    $ultimoArchivo = Get-ChildItem -Path $BackupPath -Recurse -File -ErrorAction SilentlyContinue |
                     Sort-Object LastWriteTime -Descending |
                     Select-Object -First 1

    if (-not $ultimoArchivo) {
        return @{
            Estado          = "SIN BACKUPS"
            UltimoBackup    = "N/D"
            ArchivoNombre   = "N/D"
            TamanoMB        = 0
            DiasTranscurridos = -1
        }
    }

    $dias   = [math]::Round(((Get-Date) - $ultimoArchivo.LastWriteTime).TotalDays, 1)
    $tamano = [math]::Round($ultimoArchivo.Length / 1MB, 2)

    $estado = if ($dias -le 1)     { "OK - Menos de 24h" } `
              elseif ($dias -le 7) { "ADVERTENCIA - $dias días" } `
              else                 { "CRITICO - $dias días sin backup" }

    return @{
        Estado            = $estado
        UltimoBackup      = $ultimoArchivo.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
        ArchivoNombre     = $ultimoArchivo.Name
        TamanoMB          = $tamano
        DiasTranscurridos = $dias
    }
}

$BackupKSC = Get-BackupStatus

# ===========================================================
# SECCIÓN 1: SALUD LOCAL DEL SERVIDOR
# ===========================================================

$OS = Get-CimInstance Win32_OperatingSystem
$Disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" |
         Where-Object { $_.DeviceID -eq "C:" } |        # Solo unidad C:
         Select-Object DeviceID,
             @{N='PercentFree'; E={[math]::Round(($_.FreeSpace / $_.Size) * 100, 2)}},
             @{N='FreeGB';      E={[math]::Round($_.FreeSpace / 1GB, 2)}},
             @{N='TotalGB';     E={[math]::Round($_.Size / 1GB, 2)}}

function Get-UpdateStatus {
    $rebootPending = $false
    if (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired") { $rebootPending = $true }
    if (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending")  { $rebootPending = $true }

    $pendingCount = 0
    try {
        $updateSession  = New-Object -ComObject Microsoft.Update.Session
        $updateSearcher = $updateSession.CreateUpdateSearcher()
        $searchResult   = $updateSearcher.Search("IsInstalled=0 and Type='Software' and IsHidden=0")
        $pendingCount   = $searchResult.Updates.Count
    } catch { }

    $lastUpdate = Get-HotFix -ErrorAction SilentlyContinue |
                  Sort-Object InstalledOn -Descending |
                  Select-Object -First 1

    return @{
        RebootRequired = $rebootPending
        PendingCount   = $pendingCount
        LastInstalled  = if ($lastUpdate.InstalledOn) { $lastUpdate.InstalledOn.ToString("yyyy-MM-dd") } else { "Desconocido" }
        Status         = if ($rebootPending) { "Reinicio Requerido" } elseif ($pendingCount -gt 0) { "$pendingCount Pendientes" } else { "OK" }
    }
}

$Updates = Get-UpdateStatus

$LocalHealth = @{
    Uptime   = "$([math]::Round(((Get-Date) - $OS.LastBootUpTime).TotalDays, 1)) días"
    Disk     = $Disks
    Services = Get-Service -Name "KSC*", "klnagent", "kavfsgt", "KAVFS" -ErrorAction SilentlyContinue |
               Select-Object Name, Status
    Updates  = $Updates
    Backup   = $BackupKSC
}

# ===========================================================
# SECCIÓN 2: PARSEO DE INFORMES HTML DE KASPERSKY
# ===========================================================

function Get-LatestKasperskyReport {
    param([string]$Prefix)
    $files = Get-ChildItem -Path $KasperskyReportsPath -Filter "*.html" -ErrorAction SilentlyContinue |
             Where-Object { $_.Name -like "$Prefix*" } |
             Sort-Object LastWriteTime -Descending
    if ($files.Count -gt 0) { return $files[0].FullName }
    return $null
}

function Get-HtmlText {
    param([string]$FilePath)
    if (-not $FilePath -or -not (Test-Path $FilePath)) { return "" }
    $raw = Get-Content -Path $FilePath -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    $raw = $raw -replace '(?s)<script[^>]*>.*?</script>', ''
    $raw = $raw -replace '(?s)<style[^>]*>.*?</style>',  ''
    $raw = $raw -replace '<[^>]+>', ' '
    $raw = $raw -replace '&nbsp;', ' '
    $raw = $raw -replace '&amp;',  '&'
    $raw = $raw -replace '&lt;',   '<'
    $raw = $raw -replace '&gt;',   '>'
    $raw = [System.Text.RegularExpressions.Regex]::Replace($raw, '\s{2,}', ' ')
    return $raw.Trim()
}

function Get-HtmlTextWithRows {
    param([string]$FilePath)
    if (-not $FilePath -or -not (Test-Path $FilePath)) { return @() }
    $raw = Get-Content -Path $FilePath -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    $raw = $raw -replace '(?s)<script[^>]*>.*?</script>', ''
    $raw = $raw -replace '(?s)<style[^>]*>.*?</style>',  ''
    # Reemplazar celdas con tabulador y filas con salto de línea
    $raw = $raw -replace '<tr[^>]*>',  ''
    $raw = $raw -replace '</tr>',      "`n"
    $raw = $raw -replace '<td[^>]*>',  "`t"
    $raw = $raw -replace '<th[^>]*>',  "`t"
    $raw = $raw -replace '</td>',      ''
    $raw = $raw -replace '</th>',      ''
    $raw = $raw -replace '<[^>]+>',    ''
    $raw = $raw -replace '&nbsp;',     ' '
    $raw = $raw -replace '&amp;',      '&'
    $raw = $raw -replace '&lt;',       '<'
    $raw = $raw -replace '&gt;',       '>'
    return $raw -split "`n" | Where-Object { $_.Trim() -ne '' }
}

function Get-LabeledValue {
    param([string]$Text, [string]$Label)
    if ($Text -match [regex]::Escape($Label) + '\s*[:\s]+(\d[\d,\.]*)') {
        return $matches[1].Trim()
    }
    return "N/D"
}

# -------------------------------------------------------
# 2.1 Informe de Amenazas — dispositivos y acción
# -------------------------------------------------------
function Parse-InformeAmenazas {
    $file = Get-LatestKasperskyReport -Prefix "Informe de amenazas"
    if (-not $file) { return @{ Error = "Archivo no encontrado" } }

    $raw  = Get-Content -Path $file -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    $text = Get-HtmlText -FilePath $file
    $rows = Get-HtmlTextWithRows -FilePath $file

    # Resumen: extraer desde el bloque de texto con los contadores pegados
    # Ej: "Amenazas detectadas:\n1Archivos diferentes:\n2..."
    $amenazasDetectadas = "0"; $archivos = "0"; $dispositivosInfect = "0"; $gruposInfectados = "0"
    foreach ($row in $rows) {
        $cols = $row -split "`t" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
        if ($cols.Count -eq 1 -and $cols[0] -match 'Amenazas detectadas') {
            $bloque = $cols[0]
            if ($bloque -match 'Amenazas detectadas[:\s]+(\d+)')       { $amenazasDetectadas = $matches[1] }
            if ($bloque -match 'Archivos diferentes[:\s]+(\d+)')        { $archivos           = $matches[1] }
            if ($bloque -match 'Dispositivos infectados[:\s]+(\d+)')    { $dispositivosInfect = $matches[1] }
            if ($bloque -match 'Grupos infectados[:\s]+(\d+)')          { $gruposInfectados   = $matches[1] }
        }
        # También puede venir en filas separadas de la tabla de resumen
        if ($cols.Count -ge 3 -and $cols[2] -match '^\d+$' -and $cols[0] -notmatch 'KLA') {
            if ($amenazasDetectadas -eq "0" -and $cols[2] -match '^\d+$') { $amenazasDetectadas = $cols[2] }
        }
    }
    # Fallback: buscar en el HTML crudo la tabla de resumen
    if ($amenazasDetectadas -eq "0") {
        $m = [regex]::Match($raw, 'Amenazas detectadas[^\d]*(\d+)')
        if ($m.Success) { $amenazasDetectadas = $m.Groups[1].Value }
    }

    # ── Detalles por dispositivo ──────────────────────────
    # Columnas reales (primera celda del HTML está vacía, el parser la omite):
    # [0]=Grupo [1]=Dispositivo [2]=Objeto [3]=Hora [4]=Ruta [5]=Tipo [6]=Accion(texto completo)
    $detalles = @{}
    $enDetalles = $false
    foreach ($row in $rows) {
        $cols = $row -split "`t" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
        if ($cols.Count -ge 3 -and $cols[0] -eq 'Servidor de administración virtual') { $enDetalles = $true; continue }
        if ($enDetalles -and $cols.Count -ge 7) {
            $grupo       = $cols[0]
            $dispositivo = $cols[1]
            $objeto      = $cols[2]
            $accionRaw   = $cols[6]
            $accion = "Desconocida"
            if     ($accionRaw -match 'Bloqueado')    { $accion = "Bloqueado" }
            elseif ($accionRaw -match 'Eliminado')    { $accion = "Eliminado" }
            elseif ($accionRaw -match 'Desinfectado') { $accion = "Desinfectado" }

            if (-not $detalles.ContainsKey($dispositivo)) {
                $detalles[$dispositivo] = @{ Grupo = $grupo; Dispositivo = $dispositivo; Amenaza = $objeto; Accion = $accion; Eventos = 1 }
            } else {
                $detalles[$dispositivo].Eventos++
            }
        }
    }

    $amenazasUnicas = @()
    $mObj = [regex]::Matches($text, 'not-a-virus:[^\s,]+|(?:Trojan|Virus|Worm|Exploit|Backdoor|Ransom)[^\s,]+')
    foreach ($m in $mObj) { if ($amenazasUnicas -notcontains $m.Value) { $amenazasUnicas += $m.Value } }

    $fecha = if ($text -match '(\w+ \d+, \d{4} \d+:\d+:\d+)') { $matches[1] } else { "N/D" }

    return @{
        ArchivoLeido        = (Split-Path $file -Leaf)
        FechaInforme        = $fecha
        AmenazasDetectadas  = $amenazasDetectadas
        ArchivesDiferentes  = $archivos
        DispositivosInfect  = $dispositivosInfect
        GruposInfectados    = $gruposInfectados
        ObjetosDetectados   = $amenazasUnicas
        DispositivosDetalle = @($detalles.Values)
    }
}

# -------------------------------------------------------
# 2.2 Informe de Vulnerabilidades — conteo por dispositivo
# -------------------------------------------------------
function Parse-InformeVulnerabilidades {
    $file = Get-LatestKasperskyReport -Prefix "Informe de vulnerabilidades"
    if (-not $file) { return @{ Error = "Archivo no encontrado" } }

    $raw  = Get-Content -Path $file -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    $text = Get-HtmlText -FilePath $file
    $rows = Get-HtmlTextWithRows -FilePath $file

    # ── Conteo de DISPOSITIVOS por categoría (del gráfico de torta en el HTML) ──
    # Kaspersky embeds these as: "Dispositivos con vulnerabilidades de gravedad crítica y...: 90"
    $dispSinVuln  = 0; $dispCritica = 0; $dispAlta = 0; $dispMedia = 0
    $m = [regex]::Match($raw, 'gravedad cr[íi]tica[^:\"]*:\s*(\d+)')
    if ($m.Success) { $dispCritica = [int]$m.Groups[1].Value }
    $m = [regex]::Match($raw, 'gravedad alta o alta y media[^:\"]*:\s*(\d+)')
    if ($m.Success) { $dispAlta = [int]$m.Groups[1].Value }
    $m = [regex]::Match($raw, 'gravedad media[^:\"]*:\s*(\d+)')
    if ($m.Success) { $dispMedia = [int]$m.Groups[1].Value }
    $m = [regex]::Match($raw, 'sin vulnerabilidades[^:\"]*:\s*(\d+)')
    if ($m.Success) { $dispSinVuln = [int]$m.Groups[1].Value }

    # ── Top 4 vulnerabilidades por dispositivos afectados ──
    # Columnas: [0]=Nivel [1]=ID [2]=Proveedor [3]=Aplicacion [4]=Dispositivos [5]=Grupos
    $vulnItems = @{}
    $nivelActual = ""
    foreach ($row in $rows) {
        $cols = $row -split "`t" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
        if ($cols.Count -ge 2) {
            if ($cols[0] -match '^(Crítico|Alto|Medio)$') { $nivelActual = $cols[0] }
            if ($cols[1] -match '^KLA\d+$' -and $cols.Count -ge 5 -and $cols[4] -match '^\d+$') {
                $id   = $cols[1]
                $app  = if ($cols.Count -ge 5 -and $cols[3] -ne '') { "$($cols[2]) $($cols[3])" } else { $cols[2] }
                $disp = [int]$cols[4]
                if (-not $vulnItems.ContainsKey($id) -or $vulnItems[$id].Dispositivos -lt $disp) {
                    $vulnItems[$id] = @{ ID = $id; Aplicacion = $app.Trim(); Dispositivos = $disp; Nivel = $nivelActual }
                }
            }
        }
    }
    $topVulns = @($vulnItems.Values | Sort-Object Dispositivos -Descending | Select-Object -First 4)

    $fecha = if ($text -match '(\w+ \d+, \d{4} \d+:\d+:\d+)') { $matches[1] } else { "N/D" }

    return @{
        ArchivoLeido          = (Split-Path $file -Leaf)
        FechaInforme          = $fecha
        DispSinVulnerabilidad = $dispSinVuln
        DispCritica           = $dispCritica
        DispAlta              = $dispAlta
        DispMedia             = $dispMedia
        TopVulns              = $topVulns
    }
}

# -------------------------------------------------------
# 2.3 Informe de Bases de Datos Antivirus
# -------------------------------------------------------
function Parse-InformeBasesDatos {
    $file = Get-LatestKasperskyReport -Prefix "Informe de uso de las bases de datos antivirus"
    if (-not $file) { return @{ Error = "Archivo no encontrado" } }

    $raw  = Get-Content -Path $file -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    $text = Get-HtmlText -FilePath $file

    # Extraer conteos por categoría usando regex sobre el HTML crudo
    # Kaspersky embeds these as chart data: "Al día: 96", "las últimas 24 horas: 34", etc.
    $alDia    = 0; $h24 = 0; $d3 = 0; $d7 = 0; $semana = 0

    $m = [regex]::Match($raw, 'Al d[íi]a[^:]*:\s*(\d+)')
    if ($m.Success) { $alDia = [int]$m.Groups[1].Value }
    $m = [regex]::Match($raw, 'ltimas 24 horas[^:]*:\s*(\d+)')
    if ($m.Success) { $h24 = [int]$m.Groups[1].Value }
    $m = [regex]::Match($raw, 'ltimos 3 d[íi]as[^:]*:\s*(\d+)')
    if ($m.Success) { $d3 = [int]$m.Groups[1].Value }
    $m = [regex]::Match($raw, 'ltimos 7 d[íi]as[^:]*:\s*(\d+)')
    if ($m.Success) { $d7 = [int]$m.Groups[1].Value }
    $m = [regex]::Match($raw, 'm[áa]s de una semana[^:]*:\s*(\d+)')
    if ($m.Success) { $semana = [int]$m.Groups[1].Value }

    $fecha = if ($text -match '(\w+ \d+, \d{4} \d+:\d+:\d+)') { $matches[1] } else { "N/D" }
    $estadoGeneral = if ($semana -gt 0) { "ADVERTENCIA" } else { "OK" }

    return @{
        ArchivoLeido     = (Split-Path $file -Leaf)
        FechaInforme     = $fecha
        AlDia            = $alDia
        Ultimas24h       = $h24
        Ultimos3Dias     = $d3
        Ultimos7Dias     = $d7
        MasDeUnaSemana   = $semana
        EstadoGeneral    = $estadoGeneral
    }
}

# -------------------------------------------------------
# 2.4 Informe de Actualizaciones de Software
# -------------------------------------------------------
function Parse-InformeActualizaciones {
    $file = Get-LatestKasperskyReport -Prefix "Informe de actualizaciones de software"
    if (-not $file) { return @{ Error = "Archivo no encontrado" } }

    $raw  = Get-Content -Path $file -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    $text = Get-HtmlText -FilePath $file

    # Extraer contadores del bloque de resumen (texto pegado)
    $totalActualizaciones = "0"; $noAsignadas = "0"; $asignadas = "0"
    $instalandose = "0"; $instaladas = "0"; $errores = "0"; $requierenReinicio = "0"
    foreach ($bloque in ([regex]::Matches($text, 'Actualizaciones:[^\d]*\d[\s\S]{0,500}'))) {
        $b = $bloque.Value
        if ($b -match 'Actualizaciones:[^\d]*(\d+)')                      { $totalActualizaciones = $matches[1] }
        if ($b -match 'Instalaci[oó]n no asignada:[^\d]*(\d+)')           { $noAsignadas          = $matches[1] }
        if ($b -match 'Asignado para la instalaci[oó]n:[^\d]*(\d+)')      { $asignadas            = $matches[1] }
        if ($b -match 'Instal[aá]ndose:[^\d]*(\d+)')                      { $instalandose         = $matches[1] }
        if ($b -match 'Instalada:[^\d]*(\d+)')                            { $instaladas           = $matches[1] }
        if ($b -match 'Error:[^\d]*(\d+)')                                { $errores              = $matches[1] }
        if ($b -match 'reiniciar el dispositivo:[^\d]*(\d+)')             { $requierenReinicio    = $matches[1] }
    }

    # Total de registros de vulnerabilidades que repara: "Detalles (1000 de 1334)"
    $totalVulnsRepara = "N/D"
    $mDet = [regex]::Match($raw, 'Detalles\s*\(\d+\s+de\s+(\d+)\)')
    if ($mDet.Success) { $totalVulnsRepara = $mDet.Groups[1].Value }

    $fecha = if ($text -match '(\w+ \d+, \d{4} \d+:\d+:\d+)') { $matches[1] } else { "N/D" }

    $estadoGeneral = if ([int]($errores -replace '\D','0') -gt 0) { "ERRORES" } `
                     elseif ([int]($requierenReinicio -replace '\D','0') -gt 0) { "REINICIO REQUERIDO" } `
                     else { "OK" }

    return @{
        ArchivoLeido         = (Split-Path $file -Leaf)
        FechaInforme         = $fecha
        TotalActualizaciones = $totalActualizaciones
        NoAsignadas          = $noAsignadas
        Asignadas            = $asignadas
        Instalandose         = $instalandose
        Instaladas           = $instaladas
        Errores              = $errores
        RequierenReinicio    = $requierenReinicio
        TotalVulnsRepara     = $totalVulnsRepara
        EstadoGeneral        = $estadoGeneral
    }
}

# -------------------------------------------------------
# 2.5 Informe de Licencias — sin mostrar claves, solo uso
# -------------------------------------------------------
function Parse-InformeLicencias {
    $file = Get-LatestKasperskyReport -Prefix "Informe de uso de claves de licencia"
    if (-not $file) { return @{ Error = "Archivo no encontrado" } }

    $text = Get-HtmlText -FilePath $file
    $rows = Get-HtmlTextWithRows -FilePath $file

    $totalClaves         = "0"; $usoCritico = "0"; $restriccionExcedida = "0"
    foreach ($row in $rows) {
        $cols = $row -split "`t" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
        if ($cols.Count -eq 1 -and $cols[0] -match 'Claves de licencia') {
            $b = $cols[0]
            if ($b -match 'Claves de licencia:[^\d]*(\d+)')                             { $totalClaves         = $matches[1] }
            if ($b -match 'uso de m[áa]s del 90[^\d]*(\d+)')                            { $usoCritico          = $matches[1] }
            if ($b -match 'restricci[oó]n excedida[^\d]*(\d+)')                         { $restriccionExcedida = $matches[1] }
        }
    }

    # ── Resumen: totalClaves, usoCritico, restriccionExcedida desde texto ──
    $raw = Get-Content -Path $file -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    $m = [regex]::Match($raw, 'Claves de licencia:[^\d]*(\d+)')
    if ($m.Success) { $totalClaves = $m.Groups[1].Value }
    $m = [regex]::Match($raw, '90\s*%[^:]*:\s*(\d+)')
    if ($m.Success) { $usoCritico = $m.Groups[1].Value }
    $m = [regex]::Match($raw, 'restricci[oó]n excedida[^:]*:\s*(\d+)')
    if ($m.Success) { $restriccionExcedida = $m.Groups[1].Value }

    # ── Filas de resumen: parsear directamente del HTML crudo por <tr> ──
    # Cada fila de resumen tiene: Clave | UsadaActiva | UsadaReserva | Limite | FechaCad ...
    $licencias = @()
    $trBlocks = [regex]::Matches($raw, '(?s)<tr[^>]*>(.*?)</tr>')
    foreach ($trBlock in $trBlocks) {
        $tdValues = [regex]::Matches($trBlock.Groups[1].Value, '(?s)<td[^>]*>(.*?)</td>') |
                    ForEach-Object {
                        $v = $_.Groups[1].Value -replace '<[^>]+>',' ' -replace '&nbsp;',' ' -replace '\s+',' '
                        $v.Trim()
                    }
        $cols = @($tdValues)
        # Fila válida de resumen: col[1] y col[3] numéricos, col[2]='0', entre 7 y 9 celdas
        if ($cols.Count -ge 7 -and $cols.Count -le 9 `
            -and $cols[1] -match '^\d+$' `
            -and $cols[2] -match '^\d+$' `
            -and $cols[3] -match '^\d+$') {
            $usado  = [int]$cols[1]
            $limite = [int]$cols[3]
            if ($limite -gt 0) {
                $pct      = [math]::Round(($usado / $limite) * 100, 1)
                $fechaCad = $cols[4]
                $licencias += @{
                    DispositivosUsados = $usado
                    LimiteDispositivos = $limite
                    PorcentajeUso      = $pct
                    FechaCaducidad     = $fechaCad
                }
            }
        }
    }

    $fecha = if ($text -match '(\w+ \d+, \d{4} \d+:\d+:\d+)') { $matches[1] } else { "N/D" }

    $estadoGeneral = if ([int]($usoCritico -replace '\D','0') -gt 0)              { "CRITICO - Uso >90%" } `
                     elseif ([int]($restriccionExcedida -replace '\D','0') -gt 0)  { "CRITICO - Límite excedido" } `
                     else { "OK" }

    return @{
        ArchivoLeido        = (Split-Path $file -Leaf)
        FechaInforme        = $fecha
        TotalClaves         = $totalClaves
        UsoCritico          = $usoCritico
        RestriccionExcedida = $restriccionExcedida
        Licencias           = $licencias
        EstadoGeneral       = $estadoGeneral
    }
}

# ===========================================================
# SECCIÓN 3: CONSTRUCCIÓN Y ENVÍO DEL PAYLOAD JSON
# ===========================================================

$reportData = @{
    Node       = "SERV-KSC"
    Role       = "Kaspersky Security Center Server"
    ReportDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    LocalHealth = $LocalHealth
    Kaspersky   = @{
        Amenazas         = Parse-InformeAmenazas
        Vulnerabilidades = Parse-InformeVulnerabilidades
        BasesDatos       = Parse-InformeBasesDatos
        Actualizaciones  = Parse-InformeActualizaciones
        Licencias        = Parse-InformeLicencias
    }
}

$payload = @{ service = "SERV-KSC"; data = $reportData }

try {
    $jsonPayload = $payload | ConvertTo-Json -Depth 15
    Invoke-RestMethod -Uri $BackendUrl -Method Post -Body $jsonPayload -ContentType "application/json"
    Write-Host "[OK] Datos de SERV-KSC enviados correctamente al servidor de monitoreo." -ForegroundColor Green
} catch {
    Write-Host "[ERROR] No se pudo enviar el reporte: $($_.Exception.Message)" -ForegroundColor Red
}

# ===========================================================
# SECCIÓN 4: GENERACIÓN DE INFORME HTML CONSOLIDADO
#            Estilo Kaspersky — verde #00B388, negro, blanco
# ===========================================================

$kd  = $reportData.Kaspersky
$lh  = $reportData.LocalHealth
$now = $reportData.ReportDate

# ── Helpers ──────────────────────────────────────────────

function Get-BadgeHtml {
    param([string]$Status)
    $cls = switch -Regex ($Status) {
        'OK'              { 'ok' }
        'ADVERTENCIA'     { 'warn' }
        'ERRORES|CRITICO' { 'err' }
        'REINICIO'        { 'warn' }
        default           { 'neutral' }
    }
    return "<span class='badge $cls'>$Status</span>"
}

function Get-DiskRowHtml {
    param($Disk)
    if (-not $Disk) { return "" }
    $pct   = $Disk.PercentFree
    $used  = 100 - $pct
    $color = if ($pct -lt 10) { '#d9291c' } elseif ($pct -lt 20) { '#f5a623' } else { '#00B388' }
    return @"
<div class='disk-row'>
  <span class='disk-lbl'>$($Disk.DeviceID)</span>
  <div class='bar-wrap'><div class='bar-fill' style='width:${used}%;background:$color'></div></div>
  <span class='disk-info'>$($Disk.FreeGB) GB libres / $($Disk.TotalGB) GB &nbsp;&mdash;&nbsp; <strong>$pct% libre</strong></span>
</div>
"@
}

function Get-SvcTableRows {
    param($Services)
    $out = ""
    foreach ($s in $Services) {
        $dot   = if ($s.Status -eq 'Running') { "dot-g" } else { "dot-r" }
        $badge = if ($s.Status -eq 'Running') { "<span class='badge ok'>Running</span>" } else { "<span class='badge err'>$($s.Status)</span>" }
        $out  += "<tr><td><span class='dot $dot'></span>$($s.Name)</td><td style='text-align:right'>$badge</td></tr>"
    }
    return $out
}

function Get-ThreatTableRows {
    param($Detalles)
    if (-not $Detalles -or $Detalles.Count -eq 0) {
        return "<tr><td colspan='5' style='text-align:center;color:#00B388;font-weight:600;padding:16px'>Sin dispositivos afectados en el período</td></tr>"
    }
    $out = ""
    foreach ($d in $Detalles) {
        $acBadge = if ($d.Accion -match 'Bloqueado|Eliminado|Desinfectado') { "<span class='badge ok'>$($d.Accion)</span>" } `
                   else { "<span class='badge warn'>$($d.Accion)</span>" }
        $out += "<tr><td><strong>$($d.Dispositivo)</strong></td><td style='color:#666;font-size:12px'>$($d.Amenaza)</td><td>$acBadge</td><td style='font-weight:700;color:#d9291c;text-align:center'>$($d.Eventos)</td></tr>"
    }
    return $out
}

function Get-LicTableRows {
    param($Licencias)
    $out = ""
    foreach ($lic in $Licencias) {
        $pct      = $lic.PorcentajeUso
        $barColor = if ($pct -ge 90) { '#d9291c' } elseif ($pct -ge 70) { '#f5a623' } else { '#00B388' }
        $dateColor = if ($lic.FechaCaducidad -match '2025') { "color:#d9291c;font-weight:700" } else { "" }
        $out += @"
<tr>
  <td style='font-weight:700'>$($lic.DispositivosUsados) / $($lic.LimiteDispositivos)</td>
  <td>
    <div class='bar-wrap' style='margin-bottom:3px'><div class='bar-fill' style='width:${pct}%;background:$barColor'></div></div>
    <span style='font-size:11px;color:#888'>$pct%</span>
  </td>
  <td style='font-size:12px;$dateColor'>$($lic.FechaCaducidad)</td>
</tr>
"@
    }
    if ($out -eq "") { $out = "<tr><td colspan='3' style='text-align:center;color:#888'>Sin datos de licencias</td></tr>" }
    return $out
}

function Get-VulnTopRows {
    param($Vulnerabilidades)
    # Extraer top 4 filas de la tabla de vulnerabilidades (pre-calculadas en Parse)
    if ($Vulnerabilidades.TopVulns -and $Vulnerabilidades.TopVulns.Count -gt 0) {
        $out = ""
        foreach ($v in $Vulnerabilidades.TopVulns) {
            $lvlBadge = switch -Regex ($v.Nivel) {
                'Crítico' { "<span class='badge err'>Crítico</span>" }
                'Alto'    { "<span class='badge warn'>Alto</span>" }
                default   { "<span class='badge neutral'>Medio</span>" }
            }
            $out += "<tr><td style='color:#888;font-size:12px'>$($v.ID)</td><td>$($v.Aplicacion)</td><td style='font-weight:700;text-align:center'>$($v.Dispositivos)</td><td>$lvlBadge</td></tr>"
        }
        return $out
    }
    return "<tr><td colspan='4' style='text-align:center;color:#888'>Sin detalles disponibles</td></tr>"
}

# Variables cortas para el here-string
$diskHtml    = if ($lh.Disk -is [array]) { ($lh.Disk | ForEach-Object { Get-DiskRowHtml $_ }) -join "" } else { Get-DiskRowHtml $lh.Disk }
$svcRows     = Get-SvcTableRows $lh.Services
$threatRows  = Get-ThreatTableRows $kd.Amenazas.DispositivosDetalle
$licRows     = Get-LicTableRows $kd.Licencias.Licencias
$vulnTopRows = Get-VulnTopRows $kd.Vulnerabilidades

$uptimeVal  = $lh.Uptime
$amenazasN  = $kd.Amenazas.AmenazasDetectadas
$vulnCritN  = $kd.Vulnerabilidades.DispositivosConCriticas
$actTotal   = $kd.Actualizaciones.TotalActualizaciones
$licTotal   = $kd.Licencias.TotalClaves

$dispInfN   = $kd.Amenazas.DispositivosInfect
$dispInfBadge = if ([int]($dispInfN -replace '\D','0') -gt 0) { "<span class='badge err'>$dispInfN dispositivo(s) afectado(s)</span>" } else { "<span class='badge ok'>Sin dispositivos afectados</span>" }

$actBadge   = Get-BadgeHtml $kd.Actualizaciones.EstadoGeneral
$licBadge   = Get-BadgeHtml $kd.Licencias.EstadoGeneral
$bdBadge    = Get-BadgeHtml $kd.BasesDatos.EstadoGeneral
$updBadge   = Get-BadgeHtml $lh.Updates.Status

$mcAmenazas = if ([int]($amenazasN -replace '\D','0') -gt 0) { "danger" } else { "good" }
$mcVuln     = if ([int]($vulnCritN -replace '\D','0') -gt 0) { "danger" } else { "good" }
$mcLic      = if ($kd.Licencias.EstadoGeneral -ne 'OK') { "warn" } else { "good" }
$mcAct      = if ($kd.Actualizaciones.EstadoGeneral -ne 'OK') { "warn" } else { "good" }

$objTags = ""
foreach ($o in $kd.Amenazas.ObjetosDetectados) { $objTags += "<span class='ttag'>$o</span>" }
if (-not $objTags) { $objTags = "<em style='color:#aaa'>Ninguno detectado</em>" }

$htmlContent = @"
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Monitor SERV-KSC — $now</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',Arial,sans-serif;background:#f4f4f2;color:#222;font-size:14px}
.wrap{min-height:100vh}

/* HEADER */
.hdr{background:#1d1d1b}
.hdr-inner{max-width:1100px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;padding:16px 24px}
.hdr-brand{display:flex;align-items:center;gap:14px}
.hdr-logo{font-size:22px;font-weight:700;color:#00B388;letter-spacing:-0.5px}
.hdr-sep{width:1px;height:28px;background:#444}
.hdr-title{color:#fff;font-size:13px;font-weight:600;line-height:1.3}
.hdr-title span{display:block;color:#888;font-size:11px;font-weight:400;margin-top:2px}
.hdr-date{color:#888;font-size:11px;text-align:right;line-height:1.7}
.hdr-date strong{display:block;color:#ccc;font-size:13px;font-weight:600}
.hdr-accent{height:3px;background:#00B388}

/* BODY */
.body{max-width:1100px;margin:0 auto;padding:22px 16px}

/* METRIC CARDS */
.metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:20px}
.mc{background:#fff;border-radius:6px;padding:16px 18px;border-top:3px solid #00B388}
.mc.danger{border-top-color:#d9291c}
.mc.warn{border-top-color:#f5a623}
.mc.good{border-top-color:#00B388}
.mc .val{font-size:26px;font-weight:700;color:#1d1d1b;line-height:1;margin-bottom:5px}
.mc.danger .val{color:#d9291c}
.mc.good .val{color:#007a5e}
.mc.warn .val{color:#b86800}
.mc .lbl{font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:.07em;line-height:1.4}

/* SECTION */
.sec{background:#fff;border-radius:6px;margin-bottom:14px;overflow:hidden}
.sec-hdr{display:flex;align-items:center;justify-content:space-between;padding:13px 18px;border-bottom:1px solid #ebebeb}
.sec-hdr-left{display:flex;align-items:center;gap:10px}
.sec-icon{width:30px;height:30px;border-radius:6px;background:#e6f9f4;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.sec-icon svg{width:15px;height:15px;stroke:#008c6a;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.sec-title{font-size:12px;font-weight:700;color:#1d1d1b;text-transform:uppercase;letter-spacing:.06em}
.sec-sub{font-size:11px;color:#aaa;margin-top:1px}
.sec-body{padding:14px 18px}

/* BADGE */
.badge{display:inline-flex;align-items:center;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.04em;white-space:nowrap}
.badge.ok{background:#e6f9f4;color:#006b52}
.badge.warn{background:#fff4e5;color:#945200}
.badge.err{background:#fdecea;color:#991010}
.badge.neutral{background:#f0f0f0;color:#666}

/* DOT */
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:7px;vertical-align:middle;flex-shrink:0}
.dot-g{background:#00B388}
.dot-r{background:#d9291c}
.dot-o{background:#f5a623}

/* TWO COL */
.two{display:grid;grid-template-columns:1fr 1fr;gap:20px}

/* KV */
.kv{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f2f2f0;font-size:13px}
.kv:last-child{border-bottom:none}
.kv-l{color:#777}
.kv-v{font-weight:600;color:#1d1d1b}
.kv-v.red{color:#d9291c}
.kv-v.grn{color:#007a5e}
.kv-v.ora{color:#b86800}

/* TABLE */
.ktab{width:100%;border-collapse:collapse;font-size:13px}
.ktab th{background:#f7f7f6;color:#888;font-weight:700;text-align:left;padding:8px 11px;border-bottom:1.5px solid #e8e8e8;font-size:10px;text-transform:uppercase;letter-spacing:.06em}
.ktab td{padding:8px 11px;border-bottom:1px solid #f2f2f0;vertical-align:middle}
.ktab tr:last-child td{border-bottom:none}
.ktab tr:hover td{background:#fafaf8}

/* SECTION LABEL */
.slbl{font-size:10px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:.07em;margin-bottom:9px}

/* DISK */
.disk-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #f2f2f0;font-size:13px}
.disk-row:last-child{border-bottom:none}
.disk-lbl{font-weight:700;width:28px;color:#1d1d1b;font-size:12px}
.bar-wrap{flex:1;background:#ebebeb;border-radius:3px;height:7px;overflow:hidden}
.bar-fill{height:7px;border-radius:3px}
.disk-info{font-size:11px;color:#777;white-space:nowrap;min-width:170px;text-align:right}

/* VULN CARDS */
.vuln-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px}
.vc{border-radius:6px;padding:16px;text-align:center}
.vc .vn{font-size:34px;font-weight:700;line-height:1;margin-bottom:4px}
.vc .vl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;opacity:.85}
.vc-crit{background:#d9291c;color:#fff}
.vc-alto{background:#f5a623;color:#fff}
.vc-med{background:#f5d800;color:#333}
.vc-med .vl{color:#555}
.vc-ok{background:#00B388;color:#fff}

/* THREAT TAGS */
.ttag{display:inline-block;background:#fdecea;color:#a00;border:1px solid #f5c0bc;border-radius:4px;padding:2px 8px;font-size:11px;margin:2px;font-weight:500}

/* TWO HALF SECTIONS */
.half-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
.half-grid .sec{margin-bottom:0}

/* FOOTER */
.ftr{text-align:center;color:#bbb;font-size:11px;padding:20px 16px;border-top:1px solid #e4e4e4;margin-top:6px}
</style>
</head>
<body>
<div class="wrap">

<div class="hdr">
  <div class="hdr-inner">
    <div class="hdr-brand">
      <div class="hdr-logo">kaspersky</div>
      <div class="hdr-sep"></div>
      <div class="hdr-title">
        Monitor SERV-KSC
        <span>Security Center 15.1 — Reporte consolidado</span>
      </div>
    </div>
    <div class="hdr-date">
      <strong>$now</strong>
      Servidor: SERV-KSC
    </div>
  </div>
  <div class="hdr-accent"></div>
</div>

<div class="body">

  <!-- MÉTRICAS -->
  <div class="metrics">
    <div class="mc good">
      <div class="val">$uptimeVal</div>
      <div class="lbl">Uptime del servidor</div>
    </div>
    <div class="mc $mcAmenazas">
      <div class="val">$amenazasN</div>
      <div class="lbl">Amenazas detectadas</div>
    </div>
    <div class="mc $mcVuln">
      <div class="val">$($kd.Vulnerabilidades.DispCritica)</div>
      <div class="lbl">Dispositivos con vulns. críticas</div>
    </div>
    <div class="mc $mcAct">
      <div class="val">$actTotal</div>
      <div class="lbl">Actualizaciones<br><span style="color:#d9291c;font-size:10px;font-weight:700">$($kd.Actualizaciones.Errores) con error &nbsp;·&nbsp; $($kd.Actualizaciones.RequierenReinicio) reinicio</span></div>
    </div>
    <div class="mc $mcLic">
      <div class="val">$(
        $licPrincipal = $kd.Licencias.Licencias | Sort-Object DispositivosUsados -Descending | Select-Object -First 1
        if ($licPrincipal) { "$($licPrincipal.PorcentajeUso)%" } else { "N/D" }
      )</div>
      <div class="lbl">Uso licencia principal &nbsp; $licBadge</div>
    </div>
  </div>

  <!-- SALUD LOCAL -->
  <div class="sec">
    <div class="sec-hdr">
      <div class="sec-hdr-left">
        <div class="sec-icon"><svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg></div>
        <div><div class="sec-title">Salud del servidor</div><div class="sec-sub">SERV-KSC — Windows Server</div></div>
      </div>
      <span class="badge ok">Operativo</span>
    </div>
    <div class="sec-body">
      <div class="two">
        <div>
          <div class="slbl">Almacenamiento C:</div>
          $diskHtml
          <div class="slbl" style="margin-top:14px">Servicios Kaspersky</div>
          <table class="ktab">
            <tr><th>Servicio</th><th style="text-align:right">Estado</th></tr>
            $svcRows
          </table>
        </div>
        <div>
          <div class="slbl">Windows Update</div>
          <div class="kv"><span class="kv-l">Estado</span><span class="kv-v">$updBadge</span></div>
          <div class="kv"><span class="kv-l">Reinicio requerido</span><span class="kv-v">$($lh.Updates.RebootRequired)</span></div>
          <div class="kv"><span class="kv-l">Último parche instalado</span><span class="kv-v">$($lh.Updates.LastInstalled)</span></div>
          <div class="kv"><span class="kv-l">Actualizaciones pendientes</span><span class="kv-v">$($lh.Updates.PendingCount)</span></div>
        </div>
      </div>
    </div>
  </div>

  <!-- AMENAZAS -->
  <div class="sec">
    <div class="sec-hdr">
      <div class="sec-hdr-left">
        <div class="sec-icon"><svg viewBox="0 0 24 24"><path d="M12 2l7 4v6c0 5-3.5 9.74-7 11C8.5 21.74 5 17 5 12V6l7-4z"/></svg></div>
        <div><div class="sec-title">Amenazas detectadas</div><div class="sec-sub">$($kd.Amenazas.FechaInforme)</div></div>
      </div>
      $dispInfBadge
    </div>
    <div class="sec-body">
      <div class="two" style="margin-bottom:14px">
        <div>
          <div class="kv"><span class="kv-l">Amenazas totales</span><span class="kv-v red">$($kd.Amenazas.AmenazasDetectadas)</span></div>
          <div class="kv"><span class="kv-l">Archivos diferentes</span><span class="kv-v">$($kd.Amenazas.ArchivesDiferentes)</span></div>
          <div class="kv"><span class="kv-l">Dispositivos infectados</span><span class="kv-v red">$($kd.Amenazas.DispositivosInfect)</span></div>
          <div class="kv"><span class="kv-l">Grupos afectados</span><span class="kv-v">$($kd.Amenazas.GruposInfectados)</span></div>
        </div>
        <div>
          <div class="slbl">Objetos detectados</div>
          $objTags
        </div>
      </div>
      <div class="slbl">Detalle por dispositivo</div>
      <table class="ktab">
        <tr><th>Dispositivo</th><th>Amenaza</th><th>Acción</th><th style="text-align:center">Eventos</th></tr>
        $threatRows
      </table>
    </div>
  </div>

  <!-- VULNERABILIDADES -->
  <div class="sec">
    <div class="sec-hdr">
      <div class="sec-hdr-left">
        <div class="sec-icon"><svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
        <div><div class="sec-title">Vulnerabilidades de software</div><div class="sec-sub">$($kd.Vulnerabilidades.FechaInforme)</div></div>
      </div>
    </div>
    <div class="sec-body">
      <div class="vuln-grid">
        <div class="vc vc-crit"><div class="vn">$($kd.Vulnerabilidades.DispCritica)</div><div class="vl">Dispositivos con vulns. críticas</div></div>
        <div class="vc vc-alto"><div class="vn">$($kd.Vulnerabilidades.DispAlta)</div><div class="vl">Dispositivos con vulns. altas</div></div>
        <div class="vc vc-med"><div class="vn">$($kd.Vulnerabilidades.DispMedia)</div><div class="vl">Dispositivos con vulns. medias</div></div>
        <div class="vc vc-ok"><div class="vn">$($kd.Vulnerabilidades.DispSinVulnerabilidad)</div><div class="vl">Dispositivos sin vulnerabilidades</div></div>
      </div>
      <div class="slbl">Aplicaciones con más dispositivos afectados</div>
      <table class="ktab">
        <tr><th>ID</th><th>Aplicación</th><th style="text-align:center">Dispositivos</th><th>Nivel</th></tr>
        $vulnTopRows
      </table>
    </div>
  </div>

  <!-- BASES + ACTUALIZACIONES en media página cada una -->
  <div class="half-grid">
    <div class="sec">
      <div class="sec-hdr">
        <div class="sec-hdr-left">
          <div class="sec-icon"><svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg></div>
          <div><div class="sec-title">Bases antivirus</div></div>
        </div>
        $bdBadge
      </div>
      <div class="sec-body">
        <div class="kv"><span class="kv-l">Al día (total)</span><span class="kv-v grn">$($kd.BasesDatos.AlDia)</span></div>
        <div class="kv"><span class="kv-l">Actualizadas últimas 24h</span><span class="kv-v grn">$($kd.BasesDatos.Ultimas24h)</span></div>
        <div class="kv"><span class="kv-l">Actualizadas últimos 3 días</span><span class="kv-v grn">$($kd.BasesDatos.Ultimos3Dias)</span></div>
        <div class="kv"><span class="kv-l">Actualizadas últimos 7 días</span><span class="kv-v ora">$($kd.BasesDatos.Ultimos7Dias)</span></div>
        <div class="kv"><span class="kv-l">Más de una semana</span><span class="kv-v $(if($kd.BasesDatos.MasDeUnaSemana -gt 0){'red'}else{'grn'})">$($kd.BasesDatos.MasDeUnaSemana)</span></div>
      </div>
    </div>
    <div class="sec">
      <div class="sec-hdr">
        <div class="sec-hdr-left">
          <div class="sec-icon"><svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg></div>
          <div><div class="sec-title">Actualizaciones de software</div></div>
        </div>
        $actBadge
      </div>
      <div class="sec-body">
        <div class="kv"><span class="kv-l">Total en gestión</span><span class="kv-v">$($kd.Actualizaciones.TotalActualizaciones)</span></div>
        <div class="kv"><span class="kv-l">Vulnerabilidades que repara</span><span class="kv-v">$($kd.Actualizaciones.TotalVulnsRepara)</span></div>
        <div class="kv"><span class="kv-l">No asignadas</span><span class="kv-v">$($kd.Actualizaciones.NoAsignadas)</span></div>
        <div class="kv"><span class="kv-l">Instaladas</span><span class="kv-v grn">$($kd.Actualizaciones.Instaladas)</span></div>
        <div class="kv"><span class="kv-l">Con error</span><span class="kv-v red">$($kd.Actualizaciones.Errores)</span></div>
        <div class="kv"><span class="kv-l">Requieren reinicio</span><span class="kv-v ora">$($kd.Actualizaciones.RequierenReinicio)</span></div>
      </div>
    </div>
  </div>

  <!-- LICENCIAS -->
  <div class="sec">
    <div class="sec-hdr">
      <div class="sec-hdr-left">
        <div class="sec-icon"><svg viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></div>
        <div><div class="sec-title">Uso de licencias</div><div class="sec-sub">$($kd.Licencias.TotalClaves) claves registradas</div></div>
      </div>
      $licBadge
    </div>
    <div class="sec-body">
      <div class="two" style="margin-bottom:14px">
        <div>
          <div class="kv"><span class="kv-l">Total de claves</span><span class="kv-v">$($kd.Licencias.TotalClaves)</span></div>
          <div class="kv"><span class="kv-l">Con uso crítico (&gt;90%)</span><span class="kv-v $(if([int]($kd.Licencias.UsoCritico -replace '\D','0') -gt 0){'red'}else{'grn'})">$($kd.Licencias.UsoCritico)</span></div>
          <div class="kv"><span class="kv-l">Con restricción excedida</span><span class="kv-v $(if([int]($kd.Licencias.RestriccionExcedida -replace '\D','0') -gt 0){'red'}else{'grn'})">$($kd.Licencias.RestriccionExcedida)</span></div>
        </div>
      </div>
      <table class="ktab">
        <tr><th>Usados / Límite</th><th>Porcentaje de uso</th><th>Vence</th></tr>
        $licRows
      </table>
    </div>
  </div>

</div>
<div class="ftr">Generado automáticamente por <strong>Monitor-SERV-KSC.ps1</strong> &nbsp;&middot;&nbsp; $now &nbsp;&middot;&nbsp; Kaspersky Security Center 15.1</div>
</div>
</body>
</html>
"@

$htmlFileName   = "Reporte-Consolidado-SERV-KSC_$(Get-Date -Format 'yyyy-MM-dd_HH-mm').html"
$htmlOutputPath = Join-Path $KasperskyReportsPath $htmlFileName

try {
    $htmlContent | Out-File -FilePath $htmlOutputPath -Encoding UTF8 -Force
    Write-Host "[OK] Informe HTML generado: $htmlOutputPath" -ForegroundColor Cyan
} catch {
    Write-Host "[ERROR] No se pudo generar el HTML: $($_.Exception.Message)" -ForegroundColor Red
}
