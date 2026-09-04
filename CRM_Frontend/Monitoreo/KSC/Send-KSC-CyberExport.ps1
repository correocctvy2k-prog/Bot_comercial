<#
.SYNOPSIS
    Transfiere la exportacion protegida de inventario KSC al scanner Skylab.
.DESCRIPTION
    Valida el contrato JSON antes de usar SFTP, fija la identidad del servidor
    mediante known_hosts y publica con un nombre determinista usando el patron
    temporal .part + rename. No contiene ni acepta contrasenas.
#>

[CmdletBinding()]
param(
    [string]$ExportFile = "C:\ProgramData\Skylab\Cybersecurity\outbox\ksc-hardware-protected-latest.json",
    [string]$SftpHost = "10.2.6.30",
    [string]$SftpUser = "skylabksc",
    [string]$SftpKeyFile = "C:\ProgramData\Skylab\Cybersecurity\keys\skylab_ksc_sftp_ed25519",
    [string]$KnownHostsFile = "C:\ProgramData\Skylab\Cybersecurity\keys\known_hosts",
    [string]$ExpectedIdentityKeyVersion = "ksc-hmac-v1",
    [string]$ArchiveDirectory = "C:\ProgramData\Skylab\Cybersecurity\archive",
    [string]$SftpExecutable = "C:\Windows\System32\OpenSSH\sftp.exe",
    [switch]$ValidateOnly
)

$ErrorActionPreference = "Stop"

function Assert-FileExists {
    param([string]$Path, [string]$Description)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "No existe $Description."
    }
}

function Assert-Sha256Hex {
    param([AllowNull()][string]$Value, [string]$Description, [switch]$Optional)

    if ($Optional -and [string]::IsNullOrWhiteSpace($Value)) { return }
    if ($Value -notmatch '^[0-9a-f]{64}$') {
        throw "$Description no contiene una huella SHA-256 valida."
    }
}

function Read-ProtectedExport {
    param([string]$Path, [string]$IdentityKeyVersion)

    $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    try { $document = $raw | ConvertFrom-Json }
    catch { throw "La exportacion protegida no contiene JSON valido." }

    if ($document.SchemaVersion -ne 1) { throw "SchemaVersion no soportado." }
    if ($document.SourceSystem -ne "KSC_HARDWARE_PROTECTED") { throw "SourceSystem no permitido." }
    if ($document.IdentityKeyVersion -ne $IdentityKeyVersion) { throw "IdentityKeyVersion no coincide con la configuracion." }

    $devices = @($document.Devices)
    if ([int]$document.DeviceCount -ne $devices.Count) { throw "DeviceCount no coincide con Devices." }
    if ($devices.Count -eq 0) { throw "La exportacion no contiene dispositivos." }
    Assert-Sha256Hex -Value ([string]$document.SourceReportSha256).ToLowerInvariant() -Description "SourceReportSha256"

    foreach ($device in $devices) {
        Assert-Sha256Hex -Value ([string]$device.RecordFingerprint) -Description "RecordFingerprint"
        Assert-Sha256Hex -Value ([string]$device.HostnameFingerprint) -Description "HostnameFingerprint"
        Assert-Sha256Hex -Value ([string]$device.SerialFingerprint) -Description "SerialFingerprint" -Optional
        Assert-Sha256Hex -Value ([string]$device.HardwareFingerprint) -Description "HardwareFingerprint"
        foreach ($mac in @($device.MacFingerprints)) {
            Assert-Sha256Hex -Value ([string]$mac) -Description "MacFingerprint"
        }
    }

    if ($raw -match '(?i)(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}') {
        throw "La exportacion contiene un patron de MAC sin proteger."
    }

    try {
        if ($document.GeneratedAt -is [datetime]) {
            $generatedAt = ([DateTimeOffset]$document.GeneratedAt).ToUniversalTime()
        } else {
            $generatedAt = [DateTimeOffset]::Parse(
                [string]$document.GeneratedAt,
                [Globalization.CultureInfo]::InvariantCulture,
                [Globalization.DateTimeStyles]::RoundtripKind
            ).ToUniversalTime()
        }
    }
    catch { throw "GeneratedAt no contiene una fecha valida." }

    return [pscustomobject]@{
        Document = $document
        GeneratedAt = $generatedAt
    }
}

function Invoke-SftpCommands {
    param([string[]]$Commands)

    $batchFile = Join-Path ([IO.Path]::GetTempPath()) "skylab-sftp-$([guid]::NewGuid().ToString('N')).txt"
    try {
        $Commands | Set-Content -LiteralPath $batchFile -Encoding ascii
        $arguments = @(
            '-b', $batchFile,
            '-i', $SftpKeyFile,
            '-o', 'BatchMode=yes',
            '-o', 'IdentitiesOnly=yes',
            '-o', 'StrictHostKeyChecking=yes',
            '-o', "UserKnownHostsFile=$KnownHostsFile",
            "$SftpUser@$SftpHost"
        )
        $output = @(& $SftpExecutable @arguments 2>&1)
        return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $output }
    } finally {
        Remove-Item -LiteralPath $batchFile -Force -ErrorAction SilentlyContinue
    }
}

function Save-LocalArchive {
    param([string]$SourceFile, [string]$DestinationFile, [string]$ExpectedHash)

    Copy-Item -LiteralPath $SourceFile -Destination $DestinationFile -Force
    if ((Get-FileHash -LiteralPath $DestinationFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ExpectedHash) {
        throw "La copia local de archivo no conserva el SHA-256."
    }
}

Assert-FileExists -Path $ExportFile -Description "la exportacion protegida"

$validated = Read-ProtectedExport -Path $ExportFile -IdentityKeyVersion $ExpectedIdentityKeyVersion
$localHash = (Get-FileHash -LiteralPath $ExportFile -Algorithm SHA256).Hash.ToLowerInvariant()
$timestamp = $validated.GeneratedAt.ToString("yyyyMMddTHHmmssZ")
$remoteName = "ksc-hardware-protected-$timestamp-$($localHash.Substring(0, 12)).json"
$remotePart = "$remoteName.part"

if ($ValidateOnly) {
    Write-Host "[OK] Contrato protegido valido: $($validated.Document.DeviceCount) dispositivos." -ForegroundColor Green
    Write-Host "[OK] Nombre remoto determinista: $remoteName" -ForegroundColor Green
    Write-Host "[OK] SHA256: $localHash" -ForegroundColor Green
    exit 0
}

Assert-FileExists -Path $SftpKeyFile -Description "la clave privada SFTP"
Assert-FileExists -Path $KnownHostsFile -Description "el archivo known_hosts"
Assert-FileExists -Path $SftpExecutable -Description "el cliente SFTP"

if (-not (Test-Path -LiteralPath $ArchiveDirectory)) {
    New-Item -ItemType Directory -Path $ArchiveDirectory -Force | Out-Null
}

$sftpLocalPath = $ExportFile.Replace('\', '/')
$archiveFile = Join-Path $ArchiveDirectory $remoteName

$preflight = Invoke-SftpCommands -Commands @("ls -l $remoteName", "bye")
if ($preflight.ExitCode -eq 0) {
    Save-LocalArchive -SourceFile $ExportFile -DestinationFile $archiveFile -ExpectedHash $localHash
    Write-Host "[OK] Exportacion ya entregada; no se duplico: $remoteName" -ForegroundColor Green
    Write-Host "[OK] SHA256: $localHash" -ForegroundColor Green
    exit 0
}

$transfer = Invoke-SftpCommands -Commands @(
        "-rm $remotePart"
        "put `"$sftpLocalPath`" $remotePart"
        "rename $remotePart $remoteName"
        "ls -l $remoteName"
        "bye"
    )
$transfer.Output | ForEach-Object { Write-Host $_ }
if ($transfer.ExitCode -ne 0) {
    throw "SFTP termino con codigo $($transfer.ExitCode)."
}

Save-LocalArchive -SourceFile $ExportFile -DestinationFile $archiveFile -ExpectedHash $localHash
Write-Host "[OK] Exportacion protegida transferida: $remoteName" -ForegroundColor Green
Write-Host "[OK] SHA256: $localHash" -ForegroundColor Green
