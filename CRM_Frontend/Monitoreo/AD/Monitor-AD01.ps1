<#
.SYNOPSIS
    Monitor AD01 (Primary Domain Controller)
.DESCRIPTION
    Analiza AD completo + Salud Local.
#>

$BackendUrl = "http://192.168.8.65:3001/api/monitoring/upload"

# --- Importar Módulos ---
Import-Module ActiveDirectory
if (Get-Module -ListAvailable GroupPolicy) { Import-Module GroupPolicy }

# --- Funciones de AD (Simplificadas para el Payload) ---
function Get-ADSummary {
    $allUsers = Get-ADUser -Filter * -Properties LastLogonDate, Enabled
    $locked = (Search-ADAccount -LockedOut -UsersOnly).Count
    $inactive = ($allUsers | Where-Object { $_.LastLogonDate -lt (Get-Date).AddDays(-90) -and $_.Enabled }).Count
    
    return @{
        Users = @{
            Total = $allUsers.Count
            Enabled = ($allUsers | Where-Object { $_.Enabled }).Count
            Locked = $locked
            Inactive90 = $inactive
        }
        GPOs = (Get-GPO -All).Count
        FSMO = (Get-ADDomain).PDCEmulator
    }
}

# --- Salud Local ---
$OS = Get-CimInstance Win32_OperatingSystem
$Disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID, 
    @{N='PercentFree';E={[math]::Round(($_.FreeSpace/$_.Size)*100, 2)}}

$reportData = @{
    Node = "AD-DC01"
    Role = "PDC (Primary Domain Controller)"
    Uptime = "$([math]::Round(((Get-Date) - $OS.LastBootUpTime).TotalDays, 1)) días"
    ADData = Get-ADSummary
    LocalHealth = @{
        Disk = $Disks
        Services = Get-Service -Name "NTDS", "DNS", "KDC", "Netlogon" | Select-Object Name, Status
    }
    ReportDate = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
}

# Enviar Payload
$payload = @{
    service = "AD-DC01"
    data = $reportData
}

try {
    $jsonPayload = $payload | ConvertTo-Json -Depth 10
    Invoke-RestMethod -Uri $BackendUrl -Method Post -Body $jsonPayload -ContentType "application/json"
    Write-Host "✓ Datos de AD01 enviados" -ForegroundColor Green
} catch {
    Write-Host "✗ Error: $($_.Exception.Message)" -ForegroundColor Red
}
