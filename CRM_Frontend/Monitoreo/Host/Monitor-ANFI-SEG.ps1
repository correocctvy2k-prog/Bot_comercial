<#
.SYNOPSIS
    Monitor de Host FÃ­sico (Hyper-V) â€” ANFI-SEG13798
.DESCRIPTION
    Recopila mÃ©tricas de salud del hardware, estado de mÃ¡quinas virtuales y 
    actualizaciones pendientes. Alineado con ISO 27001.
#>

$BackendUrl = "http://192.168.8.65:3001/api/monitoring/upload"
$ErrorActionPreference = "Continue"

Write-Host "â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—" -ForegroundColor Cyan
Write-Host "â•‘   SKYLAB â€” Monitor ANFI-SEG13798 (Host FÃ­sico)       â•‘" -ForegroundColor Cyan
Write-Host "â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•" -ForegroundColor Cyan

# â”€â”€ 1. Sistema Operativo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
$uptime = (Get-Date) - $os.LastBootUpTime
$uptimeStr = "{0}d {1}h {2}m" -f $uptime.Days, $uptime.Hours, $uptime.Minutes

Write-Host "[1/5] Sistema: OK ($uptimeStr uptime)" -ForegroundColor Green

# â”€â”€ 2. MÃ¡quinas Virtuales (Hyper-V) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
$VMs = @()
try {
    $VMs = Get-VM | Select-Object Name, State, Status, 
        @{N='CPU_Usage'; E={$_.CPUUsage}},
        @{N='Memory_GB'; E={[math]::Round($_.MemoryAssigned / 1GB, 2)}},
        @{N='Uptime'; E={"{0}d {1}h" -f $_.Uptime.Days, $_.Uptime.Hours}}
    Write-Host "[2/5] Hyper-V: $($VMs.Count) VMs detectadas" -ForegroundColor Green
} catch {
    Write-Host "[2/5] Hyper-V: Error al obtener VMs" -ForegroundColor Red
}

# â”€â”€ 3. Discos y Almacenamiento â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
$Disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,
    @{N='Size_GB'; E={[math]::Round($_.Size / 1GB, 2)}},
    @{N='Free_GB'; E={[math]::Round($_.FreeSpace / 1GB, 2)}},
    @{N='Used_Pct'; E={[math]::Round((1 - ($_.FreeSpace / $_.Size)) * 100, 1)}}
Write-Host "[3/5] Almacenamiento: OK" -ForegroundColor Green

# â”€â”€ 4. Servicios CrÃ­ticos del Host â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
$CriticalServices = @("vmms", "vds", "WinRM", "W32Time", "EventLog")
$Services = Get-Service -Name $CriticalServices -ErrorAction SilentlyContinue | 
    Select-Object Name, @{N='Status'; E={$_.Status.ToString()}}
Write-Host "[4/5] Servicios: OK" -ForegroundColor Green

# â”€â”€ 5. Actualizaciones de Windows â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Get-UpdateMetrics {
    $pending = 0
    $reboot = Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired"
    try {
        $updateSession = New-Object -ComObject Microsoft.Update.Session
        $updateSearcher = $updateSession.CreateUpdateSearcher()
        $searchResult = $updateSearcher.Search("IsInstalled=0 and Type='Software' and IsHidden=0")
        $pending = $searchResult.Updates.Count
    } catch {}
    
    return @{
        PendingCount = $pending
        RebootRequired = $reboot
        Status = if ($reboot) { "Reinicio Pendiente" } elseif ($pending -gt 0) { "$pending Disponibles" } else { "Al dÃ­a" }
    }
}
$Updates = Get-UpdateMetrics
Write-Host "[5/5] Updates: $($Updates.Status)" -ForegroundColor $(if($Updates.PendingCount -gt 0 -or $Updates.RebootRequired){"Yellow"}else{"Green"})

# â”€â”€ Consolidar Payload â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
$reportData = @{
    Timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Hostname  = $env:COMPUTERNAME
    Role      = "Host FÃ­sico / Hyper-V"
    Uptime    = $uptimeStr
    System    = @{
        OS = $os.Caption
        Version = $os.Version
        RAM_Total_GB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
        RAM_Free_GB = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
        RAM_UsedPct = [math]::Round((1 - ($os.FreePhysicalMemory / $os.TotalVisibleMemorySize)) * 100, 1)
    }
    VMs = $VMs
    Disks = $Disks
    Services = $Services
    Updates = $Updates
}

$payload = @{
    service = "ANFI-SEG"
    data = $reportData
}

# â”€â”€ EnvÃ­o al Backend â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Host "`nEnviando datos a Skylab ($BackendUrl)..." -ForegroundColor Cyan
try {
    $json = $payload | ConvertTo-Json -Depth 10
    $res = Invoke-RestMethod -Uri $BackendUrl -Method Post -Body $json -ContentType "application/json"
    Write-Host "âœ… Ã‰xito: $($res.message)" -ForegroundColor Green
} catch {
    Write-Host "âŒ Error: $($_.Exception.Message)" -ForegroundColor Red
}
