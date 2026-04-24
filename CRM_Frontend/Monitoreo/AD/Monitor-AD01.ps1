<#
.SYNOPSIS
    Script automatizado para monitoreo mensual de Active Directory
.DESCRIPTION
    Recopila informaci├│n cr├¡tica del AD y genera reportes en formato TXT, HTML y PDF
    Alineado con ISO/IEC 27001:2022 e ISO/IEC 27002:2022
.AUTHOR
    Sistema de Monitoreo AD - Seguridad Perimetral
.DATE
    Octubre 2025
.COMPLIANCE
    ISO/IEC 27001:2022 - Controles: A.5.1, A.8.2, A.8.3, A.8.5, A.8.8, A.8.12, A.8.15
    ISO/IEC 27002:2022 - Controles de Seguridad de la Informaci├│n
#>

# Configuraci├│n inicial
$ErrorActionPreference = "Continue"
$OutputPath = "C:\AD_Reports"
$BackupPath = "\\ganepalmir\dpto.informatica\Johnathan.Beltran\OTROS\Chequeos\Active Directory"
$BackendUrl = "http://192.168.8.65:3001/api/monitoring/upload" # IP del servidor donde corre el Bot Comercial / Monitoring API
$ReportDate = Get-Date -Format "yyyy-MM-dd_HHmm"
$ReportName = "Informe_AD_$ReportDate"

# Crear directorios si no existen
foreach ($path in @($OutputPath, $BackupPath)) {
    if (-not (Test-Path $path)) {
        try {
            New-Item -ItemType Directory -Path $path -Force | Out-Null
            Write-Host "Ô£ô Directorio creado: $path" -ForegroundColor Green
        } catch {
            Write-Host "ÔÜá No se pudo crear/acceder: $path" -ForegroundColor Yellow
        }
    }
}

# Importar m├│dulo de Active Directory
try {
    Import-Module ActiveDirectory -ErrorAction Stop
    Write-Host "Ô£ô M├│dulo Active Directory cargado" -ForegroundColor Green
} catch {
    Write-Host "Ô£ù Error al cargar Active Directory: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Intentar cargar GroupPolicy (opcional)
try {
    Import-Module GroupPolicy -ErrorAction Stop
    Write-Host "Ô£ô M├│dulo Group Policy cargado" -ForegroundColor Green
    $GPModuleLoaded = $true
} catch {
    Write-Host "ÔÜá M├│dulo Group Policy no disponible - Se omitir├í an├ílisis de GPOs" -ForegroundColor Yellow
    $GPModuleLoaded = $false
}

# ==================== FUNCIONES AUXILIARES ====================

function Write-SectionHeader {
    param([string]$Title)
    $separator = "=" * 80
    return "`n$separator`n$Title`n$separator`n"
}

function Get-UpdateStatus {
    $rebootPending = $false
    if (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired") { $rebootPending = $true }
    if (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending") { $rebootPending = $true }
    
    $lastUpdate = Get-HotFix -ErrorAction SilentlyContinue | Sort-Object InstalledOn -Descending | Select-Object -First 1
    
    return @{
        RebootPending = $rebootPending
        LastInstalled = if ($lastUpdate.InstalledOn) { $lastUpdate.InstalledOn.ToString("yyyy-MM-dd") } else { "Desconocido" }
        LastKB = if ($lastUpdate.HotFixID) { $lastUpdate.HotFixID } else { "N/A" }
    }
}

function Get-ISO27001Control {
    param([string]$ControlID, [string]$Description)
    return [PSCustomObject]@{
        ControlID = $ControlID
        Description = $Description
    }
}

function Get-DCStatus {
    Write-Host "`n[1/9] Verificando estado de controladores de dominio..." -ForegroundColor Cyan
    
    $dcList = @("AD01", "DA02")
    $dcStatus = @()
    $issues = @()
    
    foreach ($dc in $dcList) {
        $dcInfo = [PSCustomObject]@{
            DC = $dc
            Pingable = $false
            Services = @()
            FSMO = ""
            Uptime = ""
            ServiceIssues = @()
            LastReboot = ""
            OSVersion = ""
        }
        
        if (Test-Connection -ComputerName $dc -Count 2 -Quiet) {
            $dcInfo.Pingable = $true
            
            # Verificar servicios cr├¡ticos
            $services = @('NTDS','DNS','KDC','W32Time','Netlogon','DFSR')
            foreach ($service in $services) {
                try {
                    $svc = Get-Service -ComputerName $dc -Name $service -ErrorAction SilentlyContinue
                    $status = if ($svc) { $svc.Status } else { "NotFound" }
                    $dcInfo.Services += "$service - $status"
                    
                    if ($status -ne "Running") {
                        $dcInfo.ServiceIssues += $service
                        $issues += "El servicio $service en $dc est├í en estado - $status"
                    }
                } catch {
                    $dcInfo.Services += "$service - Error"
                    $dcInfo.ServiceIssues += $service
                }
            }
            
            # Obtener informaci├│n del sistema
            try {
                $os = Get-CimInstance -ComputerName $dc -ClassName Win32_OperatingSystem -ErrorAction SilentlyContinue
                $lastBoot = [datetime]$os.LastBootUpTime
                $uptime = (Get-Date) - $lastBoot
                $dcInfo.Uptime = "$($uptime.Days) d├¡as, $($uptime.Hours) horas"
                $dcInfo.LastReboot = $lastBoot.ToString("yyyy-MM-dd HH:mm:ss")
                $dcInfo.OSVersion = $os.Caption
                
                if ($uptime.Days -lt 1) {
                    $issues += "ISO 27001 A.8.15: El controlador $dc fue reiniciado recientemente (menos de 24 horas)"
                }
            } catch {
                $dcInfo.Uptime = "No disponible"
            }
        } else {
            $issues += "ISO 27001 A.8.2: El controlador $dc no responde - Disponibilidad comprometida"
        }
        
        $dcStatus += $dcInfo
    }
    
    return @{
        Status = $dcStatus
        Issues = $issues
        OverallStatus = if ($issues.Count -eq 0) { "OK" } elseif ($issues.Count -le 2) { "WARNING" } else { "CRITICAL" }
        ISO27001Controls = @(
            Get-ISO27001Control "A.8.2" "Privileged access rights"
            Get-ISO27001Control "A.8.15" "Logging"
        )
    }
}

function Get-FSMORoles {
    Write-Host "[2/9] Verificando roles FSMO..." -ForegroundColor Cyan
    
    try {
        $domain = Get-ADDomain
        $forest = Get-ADForest
        
        $fsmoRoles = [PSCustomObject]@{
            PDCEmulator = $domain.PDCEmulator
            RIDMaster = $domain.RIDMaster
            InfrastructureMaster = $domain.InfrastructureMaster
            SchemaMaster = $forest.SchemaMaster
            DomainNamingMaster = $forest.DomainNamingMaster
        }
        
        $uniqueHolders = @(
            $fsmoRoles.PDCEmulator,
            $fsmoRoles.RIDMaster,
            $fsmoRoles.InfrastructureMaster,
            $fsmoRoles.SchemaMaster,
            $fsmoRoles.DomainNamingMaster
        ) | Select-Object -Unique
        
        $recommendation = ""
        if ($uniqueHolders.Count -eq 1) {
            $recommendation = "ISO 27002 8.14: Todos los roles FSMO en un ├║nico controlador - Riesgo de disponibilidad"
        }
        
        return @{
            Roles = $fsmoRoles
            Status = if ($recommendation) { "WARNING" } else { "OK" }
            Recommendation = $recommendation
            ISO27001Controls = @(
                Get-ISO27001Control "A.8.14" "Redundancy of information processing facilities"
            )
        }
    } catch {
        return @{
            Roles = "Error al obtener roles FSMO: $($_.Exception.Message)"
            Status = "ERROR"
            Recommendation = "Verifique la conectividad con los controladores de dominio"
        }
    }
}

function Get-ReplicationStatus {
    Write-Host "[3/9] Verificando replicaci├│n entre controladores..." -ForegroundColor Cyan
    
    $replStatus = @{
        Summary = ""
        Errors = @()
        ObjectCount = @()
        Status = "OK"
        Recommendation = ""
    }
    
    try {
        $replErrors = repadmin /showrepl * /errorsonly 2>&1
        $hasErrors = $replErrors -match "error|fail"
        
        if ($hasErrors) {
            $replStatus.Errors = $replErrors -join "`n"
            $replStatus.Status = "CRITICAL"
            $replStatus.Recommendation = "ISO 27001 A.8.12: Datos inconsistentes detectados - Ejecute repadmin /syncall"
        } else {
            $replStatus.Errors = "No se encontraron errores de replicaci├│n"
        }
        
        try {
            $dc1Objects = (Get-ADObject -Server "AD01" -Filter *).Count
            $dc2Objects = (Get-ADObject -Server "DA02" -Filter *).Count
            $difference = [Math]::Abs($dc1Objects - $dc2Objects)
            
            $replStatus.ObjectCount = @(
                "AD01 - $dc1Objects objetos",
                "AD02 - $dc2Objects objetos",
                "Diferencia - $difference objetos"
            )
            
            if ($difference -gt 10) {
                $replStatus.Status = "WARNING"
                $replStatus.Recommendation += " ISO 27002 5.23: Diferencia significativa ($difference objetos)"
            }
        } catch {
            $replStatus.ObjectCount = @("Error al comparar objetos entre DCs")
        }
        
    } catch {
        $replStatus.Summary = "Error al verificar replicaci├│n: $($_.Exception.Message)"
        $replStatus.Status = "ERROR"
    }
    
    return $replStatus
}

function Get-BackupStatus {
    Write-Host "[4/9] Verificando estado de backups..." -ForegroundColor Cyan
    
    $backupStatus = @()
    $issues = @()
    $rutas = @(
        "\\ganepalmi\Backup\ActiveBackupData\VM-BACKUP AD01",
        "\\ganepalmi\Backup\ActiveBackupData\VM-BACKUP AD02"
    )
    
    $limite = (Get-Date).AddDays(-1)
    
    foreach ($ruta in $rutas) {
        $backupInfo = [PSCustomObject]@{
            Ruta = $ruta
            Accesible = $false
            UltimoBackup = "N/A"
            ArchivosRecientes = 0
            Status = "ERROR"
            Tama├▒oTotal = 0
        }
        
        if (Test-Path $ruta) {
            $backupInfo.Accesible = $true
            $archivosRecientes = Get-ChildItem -Path $ruta -Recurse -ErrorAction SilentlyContinue | 
                Where-Object { $_.LastWriteTime -gt $limite }
            
            if ($archivosRecientes) {
                $backupInfo.ArchivosRecientes = $archivosRecientes.Count
                $backupInfo.Tama├▒oTotal = [math]::Round(($archivosRecientes | Measure-Object -Property Length -Sum).Sum / 1GB, 2)
                $backupInfo.UltimoBackup = ($archivosRecientes | Sort-Object LastWriteTime -Descending | 
                    Select-Object -First 1).LastWriteTime.ToString("yyyy-MM-dd HH:mm")
                $backupInfo.Status = "OK"
            } else {
                $backupInfo.Status = "WARNING"
                $issues += "ISO 27001 A.8.13: Sin backups recientes en $ruta"
            }
        } else {
            $issues += "ISO 27001 A.8.13: No se puede acceder a $ruta"
        }
        
        $backupStatus += $backupInfo
    }
    
    $overallStatus = if ($issues.Count -eq 0) { "OK" } 
                     elseif ($issues.Count -eq 1) { "WARNING" } 
                     else { "CRITICAL" }
    
    return @{
        Backups = $backupStatus
        Issues = $issues
        Status = $overallStatus
        ISO27001Controls = @(
            Get-ISO27001Control "A.8.13" "Information backup"
        )
    }
}

function Get-UserStatistics {
    Write-Host "[5/9] Analizando estad├¡sticas de usuarios..." -ForegroundColor Cyan
    
    $userStats = @{
        Total = 0
        Enabled = 0
        Disabled = 0
        Locked = 0
        Inactive30 = 0
        Inactive60 = 0
        Inactive90 = 0
        Admins = @()
        ServiceAccounts = 0
        NonExpiringPwd = 0
        RecentlyCreated = 0
        RecentlyModified = 0
        Issues = @()
        Recommendations = @()
        DetailedInactive90 = @()
        DetailedDisabled = @()
        DetailedDeleted = @()
        DetailedNeverLoggedIn = @()
    }
    
    try {
        $allUsers = Get-ADUser -Filter * -Properties *
        $userStats.Total = $allUsers.Count
        $userStats.Enabled = ($allUsers | Where-Object {$_.Enabled -eq $true}).Count
        $userStats.Disabled = ($allUsers | Where-Object {$_.Enabled -eq $false}).Count
        $userStats.Locked = (Search-ADAccount -LockedOut -UsersOnly).Count
        
        # Usuarios inactivos con detalles
        $inactive90Users = $allUsers | Where-Object { 
            $_.LastLogonDate -and 
            $_.LastLogonDate -lt (Get-Date).AddDays(-90) -and 
            $_.Enabled -eq $true 
        }
        
        $userStats.Inactive90 = $inactive90Users.Count
        $userStats.DetailedInactive90 = $inactive90Users | Select-Object -First 50 | ForEach-Object {
            [PSCustomObject]@{
                Usuario = $_.SamAccountName
                Nombre = $_.Name
                UltimoAcceso = if($_.LastLogonDate){$_.LastLogonDate.ToString("yyyy-MM-dd")}else{"Nunca"}
                DiasInactivo = if($_.LastLogonDate){((Get-Date) - $_.LastLogonDate).Days}else{"N/A"}
                Departamento = $_.Department
                Email = $_.EmailAddress
            }
        }
        
        # Usuarios deshabilitados con detalles
        $disabledUsers = $allUsers | Where-Object {$_.Enabled -eq $false}
        $userStats.DetailedDisabled = $disabledUsers | Select-Object -First 50 | ForEach-Object {
            [PSCustomObject]@{
                Usuario = $_.SamAccountName
                Nombre = $_.Name
                FechaDeshabilitacion = if($_.Modified){$_.Modified.ToString("yyyy-MM-dd")}else{"N/A"}
                Departamento = $_.Department
                UltimaModificacion = if($_.whenChanged){$_.whenChanged.ToString("yyyy-MM-dd HH:mm")}else{"N/A"}
            }
        }
        
        # Usuarios que nunca iniciaron sesi├│n
        $neverLoggedIn = $allUsers | Where-Object { 
            -not $_.LastLogonDate -and $_.Enabled -eq $true
        }
        $userStats.DetailedNeverLoggedIn = $neverLoggedIn | Select-Object -First 50 | ForEach-Object {
            [PSCustomObject]@{
                Usuario = $_.SamAccountName
                Nombre = $_.Name
                FechaCreacion = $_.whenCreated.ToString("yyyy-MM-dd")
                Departamento = $_.Department
            }
        }
        
        # Buscar usuarios eliminados en AD Recycle Bin (si est├í habilitado)
        try {
            $deletedUsers = Get-ADObject -Filter {ObjectClass -eq "user" -and IsDeleted -eq $true} `
                -IncludeDeletedObjects -Properties * -ErrorAction SilentlyContinue
            
            $userStats.DetailedDeleted = $deletedUsers | Select-Object -First 50 | ForEach-Object {
                [PSCustomObject]@{
                    Usuario = $_.SamAccountName
                    Nombre = $_.Name
                    FechaEliminacion = if($_.whenChanged){$_.whenChanged.ToString("yyyy-MM-dd HH:mm")}else{"N/A"}
                    UltimaUbicacion = $_.LastKnownParent
                }
            }
        } catch {
            $userStats.DetailedDeleted = @()
        }
        
        $userStats.Inactive30 = (Search-ADAccount -AccountInactive -TimeSpan (New-TimeSpan -Days 30) -UsersOnly).Count
        $userStats.Inactive60 = (Search-ADAccount -AccountInactive -TimeSpan (New-TimeSpan -Days 60) -UsersOnly).Count
        
        # Cuentas administrativas
        $adminUsers = Get-ADGroupMember -Identity "Administradores" -Recursive -ErrorAction SilentlyContinue | 
            Where-Object { $_.objectClass -eq "user" }
        $userStats.Admins = $adminUsers | Select-Object -ExpandProperty SamAccountName
        
        $userStats.ServiceAccounts = (Get-ADUser -Filter 'ServicePrincipalName -like "*"' -Properties ServicePrincipalName).Count
        $userStats.NonExpiringPwd = (Get-ADUser -Filter 'PasswordNeverExpires -eq $true -and Enabled -eq $true').Count
        
        $lastMonth = (Get-Date).AddDays(-30)
        $userStats.RecentlyCreated = (Get-ADUser -Filter {Created -gt $lastMonth}).Count
        $userStats.RecentlyModified = (Get-ADUser -Filter {Modified -gt $lastMonth}).Count
        
        # An├ílisis ISO 27001
        if ($userStats.Locked -gt 0) {
            $userStats.Issues += "ISO 27001 A.5.17: $($userStats.Locked) cuenta(s) bloqueada(s)"
        }
        
        if ($userStats.Inactive90 -gt 10) {
            $userStats.Issues += "ISO 27001 A.5.18: $($userStats.Inactive90) usuarios inactivos >90 d├¡as"
            $userStats.Recommendations += "Revisar y deshabilitar cuentas inactivas seg├║n pol├¡tica de acceso"
        }
        
        if ($userStats.NonExpiringPwd -gt 5) {
            $userStats.Issues += "ISO 27002 5.17: $($userStats.NonExpiringPwd) cuentas con contrase├▒as no expirables"
        }
        
    } catch {
        Write-Host "Error en estad├¡sticas de usuarios: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    
    return $userStats
}

function Get-GPOStatus {
    Write-Host "[6/9] Analizando Group Policy Objects..." -ForegroundColor Cyan
    
    $gpoStats = @{
        Total = 0
        Linked = 0
        Unlinked = 0
        Empty = 0
        RecentlyModified = @()
        GPODetails = @()
        Issues = @()
        Recommendations = @()
    }
    
    # Verificar si el m├│dulo est├í disponible
    if (-not $GPModuleLoaded) {
        $gpoStats.Issues += "M├│dulo Group Policy no disponible - An├ílisis omitido"
        return $gpoStats
    }
    
    try {
        $allGPOs = Get-GPO -All
        $gpoStats.Total = $allGPOs.Count
        
        foreach ($gpo in $allGPOs) {
            $gpoReport = [xml](Get-GPOReport -Guid $gpo.Id -ReportType Xml)
            
            # Detectar GPOs vac├¡as
            $isEmpty = $gpoReport.GPO.Computer.ExtensionData -eq $null -and 
                       $gpoReport.GPO.User.ExtensionData -eq $null
            
            if ($isEmpty) {
                $gpoStats.Empty++
            }
            
            # Verificar enlaces
            $links = $gpo | Get-GPOReport -ReportType Xml | Select-String -Pattern "<LinksTo>" -AllMatches
            if ($links.Matches.Count -gt 0) {
                $gpoStats.Linked++
            } else {
                $gpoStats.Unlinked++
            }
            
            # GPOs modificadas recientemente (├║ltimos 30 d├¡as)
            if ($gpo.ModificationTime -gt (Get-Date).AddDays(-30)) {
                $gpoStats.RecentlyModified += [PSCustomObject]@{
                    Nombre = $gpo.DisplayName
                    FechaModificacion = $gpo.ModificationTime.ToString("yyyy-MM-dd HH:mm")
                    ModificadoPor = $gpo.User
                }
            }
            
            # Detalles de todas las GPOs
            $gpoStats.GPODetails += [PSCustomObject]@{
                Nombre = $gpo.DisplayName
                Estado = $gpo.GpoStatus
                Creacion = $gpo.CreationTime.ToString("yyyy-MM-dd")
                Modificacion = $gpo.ModificationTime.ToString("yyyy-MM-dd HH:mm")
                GUID = $gpo.Id
                Vacia = $isEmpty
                Enlaces = $links.Matches.Count
            }
        }
        
        # An├ílisis de seguridad
        if ($gpoStats.Empty -gt 0) {
            $gpoStats.Issues += "ISO 27002 5.15: $($gpoStats.Empty) GPO(s) vac├¡as detectadas"
            $gpoStats.Recommendations += "Eliminar GPOs vac├¡as para mantener la higiene del dominio"
        }
        
        if ($gpoStats.Unlinked -gt 5) {
            $gpoStats.Issues += "ISO 27001 A.8.3: $($gpoStats.Unlinked) GPO(s) sin vincular"
            $gpoStats.Recommendations += "Revisar GPOs sin enlazar - pueden ser obsoletas"
        }
        
        # Verificar GPOs cr├¡ticas de seguridad
        $criticalGPOs = @("Default Domain Policy", "Default Domain Controllers Policy")
        foreach ($criticalGPO in $criticalGPOs) {
            $exists = $allGPOs | Where-Object {$_.DisplayName -eq $criticalGPO}
            if (-not $exists) {
                $gpoStats.Issues += "CR├ìTICO: GPO '$criticalGPO' no encontrada"
            }
        }
        
    } catch {
        $gpoStats.Issues += "Error al analizar GPOs: $($_.Exception.Message)"
    }
    
    return $gpoStats
}

function Get-DiskSpace {
    Write-Host "[7/9] Verificando espacio en disco..." -ForegroundColor Cyan
    
    $dcList = @("AD01", "DA02")
    $diskInfo = @()
    $issues = @()
    
    foreach ($dc in $dcList) {
        try {
            $disks = Get-WmiObject -Class Win32_LogicalDisk -ComputerName $dc -Filter "DriveType=3" -ErrorAction SilentlyContinue
            foreach ($disk in $disks) {
                $percentFree = [math]::Round(($disk.FreeSpace/$disk.Size)*100, 2)
                
                $diskData = [PSCustomObject]@{
                    DC = $dc
                    Drive = $disk.DeviceID
                    SizeGB = [math]::Round($disk.Size/1GB, 2)
                    FreeGB = [math]::Round($disk.FreeSpace/1GB, 2)
                    PercentFree = $percentFree
                }
                
                if ($percentFree -lt 15) {
                    $issues += "ISO 27001 A.8.6: $dc - Disco $($disk.DeviceID) con solo $percentFree% libre"
                } elseif ($percentFree -lt 25) {
                    $issues += "Advertencia: $dc - Disco $($disk.DeviceID) con $percentFree% libre"
                }
                
                $diskInfo += $diskData
            }
        } catch {
            $diskInfo += [PSCustomObject]@{
                DC = $dc
                Drive = "Error"
                SizeGB = 0
                FreeGB = 0
                PercentFree = 0
            }
        }
    }
    
    return @{
        Disks = $diskInfo
        Issues = $issues
        Status = if ($issues.Count -eq 0) { "OK" } elseif ($issues -match "ISO 27001") { "CRITICAL" } else { "WARNING" }
    }
}

function Get-SecurityEvents {
    Write-Host "[8/9] Analizando eventos de seguridad recientes..." -ForegroundColor Cyan
    
    $securityEvents = @{
        FailedLogins = 0
        SuccessfulLogins = 0
        AccountLockouts = 0
        PasswordChanges = 0
        PolicyChanges = 0
        Issues = @()
        Recommendations = @()
    }
    
    try {
        $startDate = (Get-Date).AddDays(-7)
        
        $securityEvents.FailedLogins = (Get-WinEvent -FilterHashtable @{
            LogName='Security'; ID=4625; StartTime=$startDate
        } -ErrorAction SilentlyContinue).Count
        
        $securityEvents.SuccessfulLogins = (Get-WinEvent -FilterHashtable @{
            LogName='Security'; ID=4624; StartTime=$startDate
        } -ErrorAction SilentlyContinue).Count
        
        $securityEvents.AccountLockouts = (Get-WinEvent -FilterHashtable @{
            LogName='Security'; ID=4740; StartTime=$startDate
        } -ErrorAction SilentlyContinue).Count
        
        $securityEvents.PasswordChanges = (Get-WinEvent -FilterHashtable @{
            LogName='Security'; ID=4724; StartTime=$startDate
        } -ErrorAction SilentlyContinue).Count
        
        # Cambios en pol├¡ticas (Event ID 4719)
        $securityEvents.PolicyChanges = (Get-WinEvent -FilterHashtable @{
            LogName='Security'; ID=4719; StartTime=$startDate
        } -ErrorAction SilentlyContinue).Count
        
        # An├ílisis ISO 27001
        if ($securityEvents.FailedLogins -gt 100) {
            $securityEvents.Issues += "ISO 27001 A.8.15: $($securityEvents.FailedLogins) intentos fallidos"
            $securityEvents.Recommendations += "Posible ataque de fuerza bruta - Revisar Event ID 4625"
        }
        
        if ($securityEvents.AccountLockouts -gt 10) {
            $securityEvents.Issues += "ISO 27002 5.17: $($securityEvents.AccountLockouts) bloqueos de cuenta"
        }
        
        if ($securityEvents.PolicyChanges -gt 0) {
            $securityEvents.Issues += "ISO 27001 A.5.1: $($securityEvents.PolicyChanges) cambios en pol├¡ticas"
            $securityEvents.Recommendations += "Revisar cambios en pol├¡ticas de seguridad (Event ID 4719)"
        }
        
    } catch {
        Write-Host "Advertencia: No se pudieron obtener todos los eventos de seguridad" -ForegroundColor Yellow
    }
    
    return $securityEvents
}

function Get-PasswordPolicyCompliance {
    Write-Host "[9/9] Verificando cumplimiento de pol├¡ticas de contrase├▒a..." -ForegroundColor Cyan
    
    $policyCompliance = @{
        DomainPolicy = $null
        FineGrainedPolicies = @()
        Issues = @()
        Recommendations = @()
    }
    
    try {
        # Pol├¡tica de dominio por defecto
        $defaultPolicy = Get-ADDefaultDomainPasswordPolicy
        $policyCompliance.DomainPolicy = [PSCustomObject]@{
            MinPasswordLength = $defaultPolicy.MinPasswordLength
            PasswordHistoryCount = $defaultPolicy.PasswordHistoryCount
            MaxPasswordAge = $defaultPolicy.MaxPasswordAge.Days
            MinPasswordAge = $defaultPolicy.MinPasswordAge.Days
            ComplexityEnabled = $defaultPolicy.ComplexityEnabled
            LockoutDuration = $defaultPolicy.LockoutDuration.Minutes
            LockoutThreshold = $defaultPolicy.LockoutThreshold
        }
        
        # An├ílisis de cumplimiento ISO 27002
        if ($defaultPolicy.MinPasswordLength -lt 12) {
            $policyCompliance.Issues += "ISO 27002 5.17: Longitud m├¡nima de contrase├▒a insuficiente ($($defaultPolicy.MinPasswordLength) caracteres)"
            $policyCompliance.Recommendations += "ISO 27002 recomienda m├¡nimo 12 caracteres"
        }
        
        if (-not $defaultPolicy.ComplexityEnabled) {
            $policyCompliance.Issues += "ISO 27002 5.17: Complejidad de contrase├▒a no habilitada"
        }
        
        if ($defaultPolicy.MaxPasswordAge.Days -gt 90) {
            $policyCompliance.Issues += "ISO 27002 5.17: Edad m├íxima de contrase├▒a excede 90 d├¡as"
        }
        
        if ($defaultPolicy.LockoutThreshold -eq 0 -or $defaultPolicy.LockoutThreshold -gt 5) {
            $policyCompliance.Issues += "ISO 27002 5.17: Umbral de bloqueo inadecuado"
            $policyCompliance.Recommendations += "Configure entre 3-5 intentos fallidos"
        }
        
        # Pol├¡ticas de contrase├▒a de grano fino (Fine-Grained Password Policies)
        $fineGrainedPolicies = Get-ADFineGrainedPasswordPolicy -Filter * -ErrorAction SilentlyContinue
        if ($fineGrainedPolicies) {
            foreach ($fgpp in $fineGrainedPolicies) {
                $policyCompliance.FineGrainedPolicies += [PSCustomObject]@{
                    Name = $fgpp.Name
                    Precedence = $fgpp.Precedence
                    MinPasswordLength = $fgpp.MinPasswordLength
                    ComplexityEnabled = $fgpp.ComplexityEnabled
                    AppliesTo = ($fgpp | Get-ADFineGrainedPasswordPolicySubject).Count
                }
            }
        }
        
    } catch {
        $policyCompliance.Issues += "Error al verificar pol├¡ticas de contrase├▒a: $($_.Exception.Message)"
    }
    
    return $policyCompliance
}

# ==================== RECOPILACI├ôN DE DATOS ====================

Write-Host "`nÔòöÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòù" -ForegroundColor Green
Write-Host "Ôòæ   MONITOREO AD - ISO 27001:2022 / ISO 27002:2022     Ôòæ" -ForegroundColor Green
Write-Host "ÔòÜÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòØ`n" -ForegroundColor Green

$reportData = @{
    Date = Get-Date -Format "dd/MM/yyyy HH:mm:ss"
    DCs = Get-DCStatus
    FSMO = Get-FSMORoles
    Replication = Get-ReplicationStatus
    Backups = Get-BackupStatus
    Users = Get-UserStatistics
    GPOs = Get-GPOStatus
    Disk = Get-DiskSpace
    Security = Get-SecurityEvents
    PasswordPolicy = Get-PasswordPolicyCompliance
    Updates = Get-UpdateStatus
}

# ==================== GENERACI├ôN DE REPORTE HTML ====================

Write-Host "`nGenerando reporte HTML con dise├▒o Microsoft Learn..." -ForegroundColor Cyan

$htmlReport = @"
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Informe AD - ISO 27001/27002 - $ReportDate</title>
    <style>
        :root {
            --primary-color: #0078d4;
            --success-color: #107c10;
            --warning-color: #ffb900;
            --error-color: #d13438;
            --bg-gray: #f3f2f1;
            --border-color: #edebe9;
            --text-primary: #323130;
            --text-secondary: #605e5c;
            --shadow-sm: 0 1.6px 3.6px rgba(0,0,0,.13), 0 0.3px 0.9px rgba(0,0,0,.11);
            --shadow-md: 0 3.2px 7.2px rgba(0,0,0,.13), 0 0.6px 1.8px rgba(0,0,0,.11);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Roboto', sans-serif;
            line-height: 1.6;
            color: var(--text-primary);
            background: var(--bg-gray);
        }

        .top-bar {
            background: #ffffff;
            border-bottom: 1px solid var(--border-color);
            padding: 12px 0;
            box-shadow: var(--shadow-sm);
            position: sticky;
            top: 0;
            z-index: 1000;
        }

        .top-bar-content {
            max-width: 1400px;
            margin: 0 auto;
            padding: 0 24px;
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .logo {
            font-size: 20px;
            font-weight: 600;
            color: var(--primary-color);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .iso-badge {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .main-container {
            max-width: 1400px;
            margin: 0 auto;
            display: grid;
            grid-template-columns: 250px 1fr;
            gap: 24px;
            padding: 24px;
        }

        .sidebar {
            background: white;
            padding: 24px;
            border-radius: 8px;
            box-shadow: var(--shadow-sm);
            height: fit-content;
            position: sticky;
            top: 80px;
        }

        .sidebar h3 {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 16px;
            color: var(--text-secondary);
            text-transform: uppercase;
        }

        .sidebar nav ul {
            list-style: none;
        }

        .sidebar nav li {
            margin-bottom: 4px;
        }

        .sidebar nav a {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            color: var(--text-primary);
            text-decoration: none;
            border-radius: 4px;
            font-size: 14px;
            transition: all 0.2s;
        }

        .sidebar nav a:hover {
            background: var(--bg-gray);
            color: var(--primary-color);
        }

        .content {
            background: white;
            padding: 48px;
            border-radius: 8px;
            box-shadow: var(--shadow-sm);
        }

        .page-header {
            margin-bottom: 48px;
            padding-bottom: 24px;
            border-bottom: 1px solid var(--border-color);
        }

        .page-header h1 {
            font-size: 42px;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 12px;
        }

        .page-header .meta {
            display: flex;
            gap: 24px;
            font-size: 14px;
            color: var(--text-secondary);
            margin-top: 12px;
            flex-wrap: wrap;
        }

        .section {
            margin-bottom: 48px;
        }

        .section-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 24px;
            padding-bottom: 12px;
            border-bottom: 2px solid var(--border-color);
        }

        .section-icon {
            width: 32px;
            height: 32px;
            background: var(--primary-color);
            color: white;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
        }

        .section h2 {
            font-size: 28px;
            font-weight: 600;
            color: var(--text-primary);
        }

        .iso-control-badge {
            background: #e1f5fe;
            color: #014361;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            margin-left: auto;
        }

        .alert {
            padding: 16px 20px;
            border-radius: 6px;
            margin: 20px 0;
            border-left: 4px solid;
            display: flex;
            gap: 12px;
            align-items: start;
        }

        .alert-success {
            background: #dff6dd;
            border-color: var(--success-color);
            color: #0e5a0e;
        }

        .alert-warning {
            background: #fff4ce;
            border-color: var(--warning-color);
            color: #5d4a00;
        }

        .alert-error {
            background: #fde7e9;
            border-color: var(--error-color);
            color: #6e0811;
        }

        .alert-info {
            background: #e1f5fe;
            border-color: var(--primary-color);
            color: #014361;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin: 24px 0;
        }

        .stat-card {
            background: var(--bg-gray);
            padding: 20px;
            border-radius: 6px;
            border: 1px solid var(--border-color);
        }

        .stat-card-value {
            font-size: 32px;
            font-weight: 600;
            color: var(--text-primary);
        }

        .stat-card-value.success { color: var(--success-color); }
        .stat-card-value.warning { color: var(--warning-color); }
        .stat-card-value.error { color: var(--error-color); }

        .data-table {
            width: 100%;
            border-collapse: collapse;
            margin: 24px 0;
            background: white;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            overflow: hidden;
        }

        .data-table thead {
            background: var(--bg-gray);
        }

        .data-table th {
            padding: 12px 16px;
            text-align: left;
            font-weight: 600;
            font-size: 13px;
            color: var(--text-secondary);
            text-transform: uppercase;
        }

        .data-table td {
            padding: 12px 16px;
            border-top: 1px solid var(--border-color);
            font-size: 14px;
        }

        .data-table tr:hover {
            background: var(--bg-gray);
        }

        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .status-badge.ok {
            background: #dff6dd;
            color: var(--success-color);
        }

        .status-badge.warning {
            background: #fff4ce;
            color: #5d4a00;
        }

        .status-badge.critical {
            background: #fde7e9;
            color: var(--error-color);
        }

        /* Estilos para desplegables */
        .collapsible {
            background: var(--bg-gray);
            color: var(--text-primary);
            cursor: pointer;
            padding: 16px;
            width: 100%;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            text-align: left;
            outline: none;
            font-size: 15px;
            font-weight: 600;
            margin: 12px 0;
            transition: all 0.3s;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .collapsible:hover {
            background: #e1e1e1;
        }

        .collapsible:after {
            content: 'Ôû╝';
            font-size: 12px;
            margin-left: auto;
            transition: transform 0.3s;
        }

        .collapsible.active:after {
            transform: rotate(-180deg);
        }

        .collapsible-content {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease-out;
            background: white;
            border: 1px solid var(--border-color);
            border-top: none;
            border-radius: 0 0 6px 6px;
        }

        .collapsible-content.active {
            max-height: 2000px;
            transition: max-height 0.5s ease-in;
        }

        .collapsible-inner {
            padding: 20px;
        }

        .recommendation-box {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 24px;
            border-radius: 8px;
            margin: 24px 0;
            box-shadow: var(--shadow-md);
        }

        .btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 20px;
            background: var(--primary-color);
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            transition: all 0.2s;
        }

        .btn:hover {
            background: #005a9e;
            transform: translateY(-1px);
            box-shadow: var(--shadow-md);
        }

        @media print {
            .top-bar, .sidebar, .btn { display: none; }
            .main-container { grid-template-columns: 1fr; }
            .collapsible-content { max-height: none !important; }
        }
    </style>
</head>
<body>
    <div class="top-bar">
        <div class="top-bar-content">
            <div class="logo">
                <span>­ƒøí´©Å</span>
                <span>Active Directory Monitoring</span>
            </div>
            <span class="iso-badge">ISO 27001:2022</span>
            <span class="iso-badge">ISO 27002:2022</span>
        </div>
    </div>

    <div class="main-container">
        <aside class="sidebar">
            <h3>Contenido</h3>
            <nav>
                <ul>
                    <li><a href="#dc-status">­ƒûÑ´©Å Controladores</a></li>
                    <li><a href="#fsmo">ÔÜÖ´©Å Roles FSMO</a></li>
                    <li><a href="#replication">­ƒöä Replicaci├│n</a></li>
                    <li><a href="#backups">­ƒÆ¥ Backups</a></li>
                    <li><a href="#users">­ƒæÑ Usuarios</a></li>
                    <li><a href="#gpos">­ƒôï GPOs</a></li>
                    <li><a href="#passwords">­ƒöÉ Pol├¡ticas</a></li>
                    <li><a href="#disk">­ƒÆ┐ Disco</a></li>
                    <li><a href="#security">­ƒöÆ Seguridad</a></li>
                </ul>
            </nav>
        </aside>

        <main class="content">
            <div class="page-header">
                <h1>Informe de Monitoreo Active Directory</h1>
                <p style="font-size: 16px; color: var(--text-secondary); margin-top: 8px;">
                    An├ílisis de cumplimiento ISO/IEC 27001:2022 e ISO/IEC 27002:2022
                </p>
                <div class="meta">
                    <span>­ƒôà $($reportData.Date)</span>
                    <span>­ƒôï Controles A.5, A.8</span>
                    <span>­ƒÅó Dominio: $(([System.DirectoryServices.ActiveDirectory.Domain]::GetCurrentDomain()).Name)</span>
                </div>
            </div>

            <button class="btn" onclick="window.print()">­ƒû¿´©Å Imprimir / Guardar PDF</button>

            <!-- SECCI├ôN 1: CONTROLADORES DE DOMINIO -->
            <section id="dc-status" class="section">
                <div class="section-header">
                    <div class="section-icon">­ƒûÑ´©Å</div>
                    <h2>Controladores de Dominio</h2>
                    <span class="iso-control-badge">ISO 27001 A.8.2, A.8.15</span>
                </div>

                <div class="alert alert-$($reportData.DCs.OverallStatus.ToLower())">
                    <div>
                        <strong>Estado General: $($reportData.DCs.OverallStatus)</strong>
                        $(if($reportData.DCs.Issues.Count -gt 0){
                            "<ul style='margin-top: 8px;'>" + 
                            ($reportData.DCs.Issues | ForEach-Object { "<li>$_</li>" }) -join "" + 
                            "</ul>"
                        } else {
                            "<p>Todos los controladores operando normalmente</p>"
                        })
                    </div>
                </div>

                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Controlador</th>
                            <th>Estado</th>
                            <th>Uptime</th>
                            <th>SO</th>
                            <th>├Ültimo Reinicio</th>
                        </tr>
                    </thead>
                    <tbody>
"@

foreach ($dc in $reportData.DCs.Status) {
    $statusBadge = if($dc.Pingable) { 
        '<span class="status-badge ok">ÔùÅ Online</span>' 
    } else { 
        '<span class="status-badge critical">ÔùÅ Offline</span>' 
    }
    
    $htmlReport += @"
                        <tr>
                            <td><strong>$($dc.DC)</strong></td>
                            <td>$statusBadge</td>
                            <td>$($dc.Uptime)</td>
                            <td style="font-size: 12px;">$($dc.OSVersion)</td>
                            <td>$($dc.LastReboot)</td>
                        </tr>
"@
}

$htmlReport += @"
                    </tbody>
                </table>

                $(if($reportData.Disk.Issues.Count -gt 0) {
                    "<div class='recommendation-box'>" +
                    "<h3>­ƒÆí Acciones Inmediatas Requeridas</h3><ul>" +
                    "<li>Libere espacio eliminando archivos temporales y logs antiguos</li>" +
                    "<li>Use - <code>cleanmgr.exe</code> para limpieza de disco</li>" +
                    "<li>Revise tama├▒o de logs en C:\\Windows\\NTDS\\ y C:\\Windows\\Logs\\</li>" +
                    "<li>Considere compactar la base de datos NTDS.dit si est├í muy grande</li>" +
                    "<li>Implemente alertas cuando el espacio libre sea menor al 20%</li>" +
                    "<li>Planifique expansi├│n de almacenamiento si el crecimiento es constante</li>" +
                    "</ul></div>"
                })
            </section>

            <!-- SECCI├ôN 2: ROLES FSMO -->
            <section id="fsmo" class="section">
                <div class="section-header">
                    <div class="section-icon">ÔÜÖ´©Å</div>
                    <h2>Roles FSMO (Flexible Single Master Operations)</h2>
                    <span class="iso-control-badge">ISO 27001 A.8.14</span>
                </div>

                <div class="alert alert-$($reportData.FSMO.Status.ToLower())">
                    <div>
                        <strong>Estado de Roles FSMO - $($reportData.FSMO.Status)</strong>
                        <p style="margin-top: 8px;">$(if($reportData.FSMO.Recommendation){$reportData.FSMO.Recommendation}else{"La distribuci├│n de roles FSMO es adecuada."})</p>
                    </div>
                </div>

                <div style="background: var(--bg-gray); padding: 20px; border-radius: 6px; margin: 20px 0;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr style="border-bottom: 1px solid var(--border-color);">
                            <td style="padding: 12px; font-weight: 600; width: 250px;">PDC Emulator</td>
                            <td style="padding: 12px;">$($reportData.FSMO.Roles.PDCEmulator)</td>
                        </tr>
                        <tr style="border-bottom: 1px solid var(--border-color);">
                            <td style="padding: 12px; font-weight: 600;">RID Master</td>
                            <td style="padding: 12px;">$($reportData.FSMO.Roles.RIDMaster)</td>
                        </tr>
                        <tr style="border-bottom: 1px solid var(--border-color);">
                            <td style="padding: 12px; font-weight: 600;">Infrastructure Master</td>
                            <td style="padding: 12px;">$($reportData.FSMO.Roles.InfrastructureMaster)</td>
                        </tr>
                        <tr style="border-bottom: 1px solid var(--border-color);">
                            <td style="padding: 12px; font-weight: 600;">Schema Master</td>
                            <td style="padding: 12px;">$($reportData.FSMO.Roles.SchemaMaster)</td>
                        </tr>
                        <tr>
                            <td style="padding: 12px; font-weight: 600;">Domain Naming Master</td>
                            <td style="padding: 12px;">$($reportData.FSMO.Roles.DomainNamingMaster)</td>
                        </tr>
                    </table>
                </div>

                $(if($reportData.FSMO.Recommendation) {
                    "<div class='recommendation-box'>" +
                    "<h3>­ƒÆí Recomendaciones ISO 27002</h3><ul>" +
                    "<li>Considere transferir algunos roles FSMO al controlador secundario para balancear la carga</li>" +
                    "<li>Documente el procedimiento de transferencia de roles FSMO para DR</li>" +
                    "<li>Use el comando - <code>netdom query fsmo</code> para verificar roles</li>" +
                    "<li>Mantenga un respaldo de los roles FSMO en la documentaci├│n</li>" +
                    "</ul></div>"
                })
            </section>

            <!-- SECCI├ôN 3: REPLICACI├ôN -->
            <section id="replication" class="section">
                <div class="section-header">
                    <div class="section-icon">­ƒöä</div>
                    <h2>Estado de Replicaci├│n</h2>
                    <span class="iso-control-badge">ISO 27001 A.8.12</span>
                </div>

                <div class="alert alert-$($reportData.Replication.Status.ToLower())">
                    <div>
                        <strong>Estado de Replicaci├│n - $($reportData.Replication.Status)</strong>
                        <p style="margin-top: 8px;">$($reportData.Replication.Errors)</p>
                    </div>
                </div>

                <h3 style="margin: 24px 0 12px; font-size: 18px;">Conteo de Objetos entre Controladores</h3>
                <div style="background: var(--bg-gray); padding: 20px; border-radius: 6px;">
                    $(foreach($count in $reportData.Replication.ObjectCount) {
                        "<p style='margin: 8px 0; font-size: 15px;'>$count</p>"
                    })
                </div>

                $(if($reportData.Replication.Recommendation) {
                    "<div class='recommendation-box'>" +
                    "<h3>­ƒÆí Acciones Recomendadas</h3><ul>" +
                    "<li>$($reportData.Replication.Recommendation)</li>" +
                    "<li>Ejecute - <code>repadmin /showrepl</code> para ver detalles</li>" +
                    "<li>Use - <code>repadmin /syncall /AdeP</code> para forzar sincronizaci├│n</li>" +
                    "<li>Verifique conectividad de red entre DCs</li>" +
                    "<li>Revise puertos - 389 (LDAP), 636 (LDAPS), 3268 (GC), 88 (Kerberos)</li>" +
                    "</ul></div>"
                })
            </section>

            <!-- SECCI├ôN 4: BACKUPS -->
            <section id="backups" class="section">
                <div class="section-header">
                    <div class="section-icon">­ƒÆ¥</div>
                    <h2>Estado de Backups</h2>
                    <span class="iso-control-badge">ISO 27001 A.8.13</span>
                </div>

                <div class="alert alert-$($reportData.Backups.Status.ToLower())">
                    <div>
                        <strong>Estado de Backups - $($reportData.Backups.Status)</strong>
                        $(if($reportData.Backups.Issues.Count -gt 0){
                            "<ul style='margin-top: 8px;'>" + 
                            ($reportData.Backups.Issues | ForEach-Object { "<li>$_</li>" }) -join "" + 
                            "</ul>"
                        } else {
                            "<p style='margin-top: 8px;'>Todos los backups est├ín funcionando correctamente.</p>"
                        })
                    </div>
                </div>

                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Ruta de Backup</th>
                            <th>Accesible</th>
                            <th>├Ültimo Backup</th>
                            <th>Archivos (24h)</th>
                            <th>Tama├▒o Total</th>
                        </tr>
                    </thead>
                    <tbody>
"@

foreach ($backup in $reportData.Backups.Backups) {
    $accessBadge = if($backup.Accesible) { 
        '<span class="status-badge ok">ÔùÅ Accesible</span>' 
    } else { 
        '<span class="status-badge critical">ÔùÅ No Accesible</span>' 
    }
    
    $htmlReport += @"
                        <tr>
                            <td style="font-size: 11px;">$($backup.Ruta)</td>
                            <td>$accessBadge</td>
                            <td>$($backup.UltimoBackup)</td>
                            <td>$($backup.ArchivosRecientes)</td>
                            <td>$($backup.Tama├▒oTotal) GB</td>
                        </tr>
"@
}

$htmlReport += @"
                    </tbody>
                </table>

                $(if($reportData.Backups.Issues.Count -gt 0) {
                    "<div class='recommendation-box'>" +
                    "<h3>­ƒÆí Acciones Requeridas</h3><ul>" +
                    "<li>Verifique la conectividad con el NAS y el estado del servicio de backup</li>" +
                    "<li>Aseg├║rese de que las tareas programadas est├®n activas</li>" +
                    "<li>Pruebe la restauraci├│n de un backup al menos mensualmente</li>" +
                    "<li>Implemente la regla 3-2-1 - 3 copias, 2 tipos de medios, 1 offsite</li>" +
                    "<li>Documente el procedimiento de restauraci├│n de Active Directory</li>" +
                    "</ul></div>"
                })
            </section>

            <!-- SECCI├ôN 5: USUARIOS CON DESPLEGABLES -->
            <section id="users" class="section">
                <div class="section-header">
                    <div class="section-icon">­ƒæÑ</div>
                    <h2>Estad├¡sticas de Usuarios</h2>
                    <span class="iso-control-badge">ISO 27001 A.5.17, A.5.18</span>
                </div>

                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-card-label">Total de Usuarios</div>
                        <div class="stat-card-value">$($reportData.Users.Total)</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-label">Habilitados</div>
                        <div class="stat-card-value success">$($reportData.Users.Enabled)</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-label">Deshabilitados</div>
                        <div class="stat-card-value">$($reportData.Users.Disabled)</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-label">Bloqueados</div>
                        <div class="stat-card-value $(if($reportData.Users.Locked -gt 0){"error"}else{""})">$($reportData.Users.Locked)</div>
                    </div>
                </div>

                <!-- Desplegable: Usuarios Inactivos 90+ d├¡as -->
                <button class="collapsible">
                    ÔÜá´©Å Usuarios Inactivos (+90 d├¡as): $($reportData.Users.Inactive90) usuarios
                </button>
                <div class="collapsible-content">
                    <div class="collapsible-inner">
                        $(if($reportData.Users.DetailedInactive90.Count -gt 0) {
                            "<table class='data-table'><thead><tr>" +
                            "<th>Usuario</th><th>Nombre</th><th>├Ültimo Acceso</th><th>D├¡as Inactivo</th><th>Departamento</th>" +
                            "</tr></thead><tbody>" +
                            ($reportData.Users.DetailedInactive90 | ForEach-Object {
                                "<tr><td>$($_.Usuario)</td><td>$($_.Nombre)</td><td>$($_.UltimoAcceso)</td>" +
                                "<td><strong>$($_.DiasInactivo)</strong></td><td>$($_.Departamento)</td></tr>"
                            }) -join "" +
                            "</tbody></table>"
                        } else {
                            "<p style='color: var(--success-color);'>Ô£ô No hay usuarios inactivos por m├ís de 90 d├¡as</p>"
                        })
                    </div>
                </div>

                <!-- Desplegable: Usuarios Deshabilitados -->
                <button class="collapsible">
                    ­ƒÜ½ Usuarios Deshabilitados: $($reportData.Users.Disabled) usuarios
                </button>
                <div class="collapsible-content">
                    <div class="collapsible-inner">
                        $(if($reportData.Users.DetailedDisabled.Count -gt 0) {
                            "<table class='data-table'><thead><tr>" +
                            "<th>Usuario</th><th>Nombre</th><th>├Ültima Modificaci├│n</th><th>Departamento</th>" +
                            "</tr></thead><tbody>" +
                            ($reportData.Users.DetailedDisabled | ForEach-Object {
                                "<tr><td>$($_.Usuario)</td><td>$($_.Nombre)</td><td>$($_.UltimaModificacion)</td>" +
                                "<td>$($_.Departamento)</td></tr>"
                            }) -join "" +
                            "</tbody></table>" +
                            "<p style='margin-top: 16px;'><em>Mostrando primeros 50 usuarios</em></p>"
                        } else {
                            "<p>No hay usuarios deshabilitados</p>"
                        })
                    </div>
                </div>

                <!-- Desplegable: Usuarios Eliminados -->
                <button class="collapsible">
                    ­ƒùæ´©Å Usuarios Eliminados (Papelera AD): $($reportData.Users.DetailedDeleted.Count) usuarios
                </button>
                <div class="collapsible-content">
                    <div class="collapsible-inner">
                        $(if($reportData.Users.DetailedDeleted.Count -gt 0) {
                            "<table class='data-table'><thead><tr>" +
                            "<th>Usuario</th><th>Nombre</th><th>Fecha Eliminaci├│n</th><th>├Ültima Ubicaci├│n</th>" +
                            "</tr></thead><tbody>" +
                            ($reportData.Users.DetailedDeleted | ForEach-Object {
                                "<tr><td>$($_.Usuario)</td><td>$($_.Nombre)</td><td>$($_.FechaEliminacion)</td>" +
                                "<td style='font-size: 11px;'>$($_.UltimaUbicacion)</td></tr>"
                            }) -join "" +
                            "</tbody></table>"
                        } else {
                            "<p style='color: var(--text-secondary);'>No hay usuarios en la papelera de reciclaje de AD</p>"
                        })
                    </div>
                </div>

                <!-- Desplegable: Usuarios que Nunca Iniciaron Sesi├│n -->
                <button class="collapsible">
                    ÔØô Nunca Iniciaron Sesi├│n: $($reportData.Users.DetailedNeverLoggedIn.Count) usuarios
                </button>
                <div class="collapsible-content">
                    <div class="collapsible-inner">
                        $(if($reportData.Users.DetailedNeverLoggedIn.Count -gt 0) {
                            "<table class='data-table'><thead><tr>" +
                            "<th>Usuario</th><th>Nombre</th><th>Fecha Creaci├│n</th><th>Departamento</th>" +
                            "</tr></thead><tbody>" +
                            ($reportData.Users.DetailedNeverLoggedIn | ForEach-Object {
                                "<tr><td>$($_.Usuario)</td><td>$($_.Nombre)</td><td>$($_.FechaCreacion)</td>" +
                                "<td>$($_.Departamento)</td></tr>"
                            }) -join "" +
                            "</tbody></table>"
                        } else {
                            "<p style='color: var(--success-color);'>Ô£ô Todos los usuarios activos han iniciado sesi├│n</p>"
                        })
                    </div>
                </div>

                $(if($reportData.Users.Issues.Count -gt 0) {
                    "<div class='alert alert-warning' style='margin-top: 24px;'>" +
                    "<div><strong>ÔÜá´©Å Problemas Detectados</strong>" +
                    "<ul style='margin-top: 8px;'>" +
                    ($reportData.Users.Issues | ForEach-Object { "<li>$_</li>" }) -join "" +
                    "</ul></div></div>"
                })

                $(if($reportData.Users.Recommendations.Count -gt 0) {
                    "<div class='recommendation-box'>" +
                    "<h3>­ƒÆí Recomendaciones ISO 27001/27002</h3><ul>" +
                    ($reportData.Users.Recommendations | ForEach-Object { "<li>$_</li>" }) -join "" +
                    "<li>Revise mensualmente las cuentas inactivas y deshabil├¡telas</li>" +
                    "<li>Implemente rotaci├│n de contrase├▒as para cuentas administrativas</li>" +
                    "<li>Use - <code>Search-ADAccount -AccountInactive -TimeSpan 90</code></li>" +
                    "<li>Considere implementar Privileged Access Management (PAM)</li>" +
                    "<li>Documente la matriz de accesos y permisos</li>" +
                    "</ul></div>"
                })
            </section>

            <!-- SECCI├ôN 6: GPOs -->
            <section id="gpos" class="section">
                <div class="section-header">
                    <div class="section-icon">­ƒôï</div>
                    <h2>Group Policy Objects (GPOs)</h2>
                    <span class="iso-control-badge">ISO 27001 A.8.3, A.5.15</span>
                </div>

                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-card-label">Total GPOs</div>
                        <div class="stat-card-value">$($reportData.GPOs.Total)</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-label">GPOs Vinculadas</div>
                        <div class="stat-card-value success">$($reportData.GPOs.Linked)</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-label">GPOs Sin Vincular</div>
                        <div class="stat-card-value warning">$($reportData.GPOs.Unlinked)</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-label">GPOs Vac├¡as</div>
                        <div class="stat-card-value $(if($reportData.GPOs.Empty -gt 0){"warning"}else{""})">$($reportData.GPOs.Empty)</div>
                    </div>
                </div>

                $(if($reportData.GPOs.Issues.Count -gt 0) {
                    "<div class='alert alert-warning'><div>" +
                    "<strong>Problemas Detectados en GPOs</strong>" +
                    "<ul style='margin-top: 8px;'>" +
                    ($reportData.GPOs.Issues | ForEach-Object { "<li>$_</li>" }) -join "" +
                    "</ul></div></div>"
                } else {
                    "<div class='alert alert-success'><div>" +
                    "<strong>Ô£ô Estado de GPOs Normal</strong>" +
                    "<p>No se detectaron problemas en las pol├¡ticas de grupo</p></div></div>"
                })

                <!-- Desplegable: Todas las GPOs -->
                $(if($reportData.GPOs.Total -gt 0) {
                    "<button class='collapsible'>" +
                    "­ƒôä Lista Completa de GPOs ($($reportData.GPOs.Total) pol├¡ticas)" +
                    "</button>" +
                    "<div class='collapsible-content'>" +
                    "<div class='collapsible-inner'>" +
                    "<table class='data-table'><thead><tr>" +
                    "<th>Nombre</th><th>Estado</th><th>Creaci├│n</th><th>├Ültima Modificaci├│n</th><th>Enlaces</th><th>Vac├¡a</th>" +
                    "</tr></thead><tbody>" +
                    ($reportData.GPOs.GPODetails | ForEach-Object {
                        $emptyBadge = if($_.Vacia) { '<span class="status-badge warning">S├¡</span>' } else { '<span class="status-badge ok">No</span>' }
                        "<tr>" +
                        "<td><strong>$($_.Nombre)</strong></td>" +
                        "<td>$($_.Estado)</td>" +
                        "<td>$($_.Creacion)</td>" +
                        "<td>$($_.Modificacion)</td>" +
                        "<td>$($_.Enlaces)</td>" +
                        "<td>$emptyBadge</td>" +
                        "</tr>"
                    }) -join "" +
                    "</tbody></table></div></div>"
                } else {
                    "<div class='alert alert-info'><div>" +
                    "<strong>Ôä╣´©Å An├ílisis de GPOs No Disponible</strong>" +
                    "<p>El m├│dulo Group Policy no est├í instalado o no hay GPOs para analizar.</p>" +
                    "<p style='margin-top: 8px;'>Para habilitar el an├ílisis de GPOs, instale RSAT:</p>" +
                    "<code style='display: block; margin-top: 8px; padding: 8px; background: #f5f5f5;'>" +
                    "Install-WindowsFeature GPMC -IncludeManagementTools</code>" +
                    "</div></div>"
                })

                <!-- Desplegable: GPOs Modificadas Recientemente -->
                $(if($reportData.GPOs.RecentlyModified.Count -gt 0) {
                    "<button class='collapsible'>" +
                    "­ƒöä GPOs Modificadas (├Ültimos 30 d├¡as): $($reportData.GPOs.RecentlyModified.Count) pol├¡ticas" +
                    "</button>" +
                    "<div class='collapsible-content'>" +
                    "<div class='collapsible-inner'>" +
                    "<table class='data-table'><thead><tr>" +
                    "<th>Nombre GPO</th><th>Fecha Modificaci├│n</th><th>Modificado Por</th>" +
                    "</tr></thead><tbody>" +
                    ($reportData.GPOs.RecentlyModified | ForEach-Object {
                        "<tr><td><strong>$($_.Nombre)</strong></td><td>$($_.FechaModificacion)</td><td>$($_.ModificadoPor)</td></tr>"
                    }) -join "" +
                    "</tbody></table></div></div>"
                })

                $(if($reportData.GPOs.Recommendations.Count -gt 0) {
                    "<div class='recommendation-box'>" +
                    "<h3>­ƒÆí Recomendaciones ISO 27002</h3><ul>" +
                    ($reportData.GPOs.Recommendations | ForEach-Object { "<li>$_</li>" }) -join "" +
                    "<li>Auditar cambios en GPOs cr├¡ticas regularmente</li>" +
                    "<li>Implementar versionado y respaldo de GPOs</li>" +
                    "<li>Revisar permisos de edici├│n de GPOs (principio de m├¡nimo privilegio)</li>" +
                    "</ul></div>"
                })
            </section>

            <!-- SECCI├ôN 7: POL├ìTICAS DE CONTRASE├æA -->
            <section id="passwords" class="section">
                <div class="section-header">
                    <div class="section-icon">­ƒöÉ</div>
                    <h2>Pol├¡ticas de Contrase├▒a</h2>
                    <span class="iso-control-badge">ISO 27002 5.17</span>
                </div>

                <h3 style="margin-bottom: 16px; font-size: 20px;">Pol├¡tica de Dominio Predeterminada</h3>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-card-label">Longitud M├¡nima</div>
                        <div class="stat-card-value $(if($reportData.PasswordPolicy.DomainPolicy.MinPasswordLength -lt 12){"warning"}else{"success"})">
                            $($reportData.PasswordPolicy.DomainPolicy.MinPasswordLength) caracteres
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-label">Edad M├íxima</div>
                        <div class="stat-card-value $(if($reportData.PasswordPolicy.DomainPolicy.MaxPasswordAge -gt 90){"warning"}else{"success"})">
                            $($reportData.PasswordPolicy.DomainPolicy.MaxPasswordAge) d├¡as
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-label">Historial</div>
                        <div class="stat-card-value">$($reportData.PasswordPolicy.DomainPolicy.PasswordHistoryCount) contrase├▒as</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-label">Umbral Bloqueo</div>
                        <div class="stat-card-value $(if($reportData.PasswordPolicy.DomainPolicy.LockoutThreshold -eq 0 -or $reportData.PasswordPolicy.DomainPolicy.LockoutThreshold -gt 5){"warning"}else{"success"})">
                            $($reportData.PasswordPolicy.DomainPolicy.LockoutThreshold) intentos
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-label">Complejidad</div>
                        <div class="stat-card-value $(if($reportData.PasswordPolicy.DomainPolicy.ComplexityEnabled){"success"}else{"error"})">
                            $(if($reportData.PasswordPolicy.DomainPolicy.ComplexityEnabled){"Ô£ô Habilitada"}else{"Ô£ù Deshabilitada"})
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-label">Duraci├│n Bloqueo</div>
                        <div class="stat-card-value">$($reportData.PasswordPolicy.DomainPolicy.LockoutDuration) min</div>
                    </div>
                </div>

                $(if($reportData.PasswordPolicy.FineGrainedPolicies.Count -gt 0) {
                    "<h3 style='margin: 32px 0 16px; font-size: 20px;'>Pol├¡ticas de Grano Fino (PSOs)</h3>" +
                    "<table class='data-table'><thead><tr>" +
                    "<th>Nombre</th><th>Precedencia</th><th>Long. M├¡nima</th><th>Complejidad</th><th>Aplica A</th>" +
                    "</tr></thead><tbody>" +
                    ($reportData.PasswordPolicy.FineGrainedPolicies | ForEach-Object {
                        "<tr><td><strong>$($_.Name)</strong></td><td>$($_.Precedence)</td>" +
                        "<td>$($_.MinPasswordLength)</td><td>$(if($_.ComplexityEnabled){"Ô£ô"}else{"Ô£ù"})</td>" +
                        "<td>$($_.AppliesTo) usuarios/grupos</td></tr>"
                    }) -join "" +
                    "</tbody></table>"
                })

                $(if($reportData.PasswordPolicy.Issues.Count -gt 0) {
                    "<div class='alert alert-warning' style='margin-top: 24px;'>" +
                    "<div><strong>Incumplimientos ISO 27002 5.17</strong>" +
                    "<ul style='margin-top: 8px;'>" +
                    ($reportData.PasswordPolicy.Issues | ForEach-Object { "<li>$_</li>" }) -join "" +
                    "</ul></div></div>"
                } else {
                    "<div class='alert alert-success' style='margin-top: 24px;'>" +
                    "<div><strong>Ô£ô Pol├¡ticas de Contrase├▒a Conformes</strong>" +
                    "<p>Las pol├¡ticas cumplen con las recomendaciones de ISO 27002:2022</p></div></div>"
                })

                $(if($reportData.PasswordPolicy.Recommendations.Count -gt 0) {
                    "<div class='recommendation-box'>" +
                    "<h3>­ƒÆí Recomendaciones ISO 27002</h3><ul>" +
                    ($reportData.PasswordPolicy.Recommendations | ForEach-Object { "<li>$_</li>" }) -join "" +
                    "</ul></div>"
                })
            </section>

            <!-- SECCI├ôN 8: ESPACIO EN DISCO -->
            <section id="disk" class="section">
                <div class="section-header">
                    <div class="section-icon">­ƒÆ┐</div>
                    <h2>Espacio en Disco</h2>
                    <span class="iso-control-badge">ISO 27001 A.8.6</span>
                </div>

                <div class="alert alert-$($reportData.Disk.Status.ToLower())">
                    <div>
                        <strong>Estado: $($reportData.Disk.Status)</strong>
                        $(if($reportData.Disk.Issues.Count -gt 0){
                            "<ul style='margin-top: 8px;'>" + 
                            ($reportData.Disk.Issues | ForEach-Object { "<li>$_</li>" }) -join "" + 
                            "</ul>"
                        } else {
                            "<p>Espacio en disco adecuado en todos los controladores</p>"
                        })
                    </div>
                </div>

                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Controlador</th>
                            <th>Unidad</th>
                            <th>Tama├▒o Total</th>
                            <th>Espacio Libre</th>
                            <th>% Libre</th>
                            <th>Estado</th>
                        </tr>
                    </thead>
                    <tbody>
"@

foreach ($disk in $reportData.Disk.Disks) {
    $statusBadge = if($disk.PercentFree -ge 25) { 
        '<span class="status-badge ok">ÔùÅ Saludable</span>' 
    } elseif($disk.PercentFree -ge 15) { 
        '<span class="status-badge warning">ÔùÅ Advertencia</span>' 
    } else { 
        '<span class="status-badge critical">ÔùÅ Cr├¡tico</span>' 
    }
    
    $htmlReport += @"
                        <tr>
                            <td><strong>$($disk.DC)</strong></td>
                            <td>$($disk.Drive)</td>
                            <td>$($disk.SizeGB) GB</td>
                            <td>$($disk.FreeGB) GB</td>
                            <td><strong>$($disk.PercentFree)%</strong></td>
                            <td>$statusBadge</td>
                        </tr>
"@
}

$htmlReport += @"
                    </tbody>
                </table>
            </section>

            <!-- SECCI├ôN 9: EVENTOS DE SEGURIDAD -->
            <section id="security" class="section">
                <div class="section-header">
                    <div class="section-icon">­ƒöÆ</div>
                    <h2>Eventos de Seguridad (├Ültimos 7 D├¡as)</h2>
                    <span class="iso-control-badge">ISO 27001 A.8.15, A.8.16</span>
                </div>

                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-card-label">Inicios Fallidos</div>
                        <div class="stat-card-value $(if($reportData.Security.FailedLogins -gt 100){"error"}elseif($reportData.Security.FailedLogins -gt 50){"warning"}else{""})">
                            $($reportData.Security.FailedLogins)
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-label">Inicios Exitosos</div>
                        <div class="stat-card-value success">$($reportData.Security.SuccessfulLogins)</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-label">Bloqueos de Cuenta</div>
                        <div class="stat-card-value $(if($reportData.Security.AccountLockouts -gt 10){"error"}elseif($reportData.Security.AccountLockouts -gt 5){"warning"}else{""})">
                            $($reportData.Security.AccountLockouts)
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-label">Cambios Contrase├▒a</div>
                        <div class="stat-card-value">$($reportData.Security.PasswordChanges)</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-label">Cambios en Pol├¡ticas</div>
                        <div class="stat-card-value $(if($reportData.Security.PolicyChanges -gt 0){"warning"}else{""})">
                            $($reportData.Security.PolicyChanges)
                        </div>
                    </div>
                </div>

                $(if($reportData.Security.Issues.Count -gt 0) {
                    "<div class='alert alert-warning' style='margin-top: 24px;'>" +
                    "<div><strong>Alertas de Seguridad ISO 27001</strong>" +
                    "<ul style='margin-top: 8px;'>" +
                    ($reportData.Security.Issues | ForEach-Object { "<li>$_</li>" }) -join "" +
                    "</ul></div></div>"
                } else {
                    "<div class='alert alert-success' style='margin-top: 24px;'>" +
                    "<div><strong>Ô£ô Estado de Seguridad Normal</strong>" +
                    "<p>No se detectaron patrones an├│malos en los ├║ltimos 7 d├¡as</p></div></div>"
                })

                $(if($reportData.Security.Recommendations.Count -gt 0) {
                    "<div class='recommendation-box'>" +
                    "<h3>­ƒÆí Acciones Recomendadas</h3><ul>" +
                    ($reportData.Security.Recommendations | ForEach-Object { "<li>$_</li>" }) -join "" +
                    "<li>Implementar monitoreo continuo con SIEM</li>" +
                    "<li>Configurar alertas autom├íticas para eventos cr├¡ticos</li>" +
                    "<li>Revisar Event IDs: 4625 (fallos), 4740 (bloqueos), 4719 (pol├¡ticas)</li>" +
                    "</ul></div>"
                })
            </section>

            <!-- SECCI├ôN: RESUMEN ISO 27001 -->
            <section class="section">
                <div class="section-header">
                    <div class="section-icon">­ƒôè</div>
                    <h2>Resumen de Cumplimiento ISO 27001:2022</h2>
                </div>

                <div class="alert alert-info">
                    <div>
                        <strong>Controles Evaluados</strong>
                        <p style="margin-top: 12px;">Este informe cubre los siguientes controles de ISO/IEC 27001:2022:</p>
                        <ul style="margin-top: 8px; column-count: 2;">
                            <li><strong>A.5.1</strong> - Pol├¡ticas de seguridad</li>
                            <li><strong>A.5.15</strong> - Control de acceso</li>
                            <li><strong>A.5.17</strong> - Autenticaci├│n</li>
                            <li><strong>A.5.18</strong> - Derechos de acceso</li>
                            <li><strong>A.8.2</strong> - Acceso privilegiado</li>
                            <li><strong>A.8.3</strong> - Restricci├│n de acceso</li>
                            <li><strong>A.8.6</strong> - Gesti├│n de capacidad</li>
                            <li><strong>A.8.12</strong> - Prevenci├│n de fuga de datos</li>
                            <li><strong>A.8.13</strong> - Respaldo de informaci├│n</li>
                            <li><strong>A.8.14</strong> - Redundancia</li>
                            <li><strong>A.8.15</strong> - Registro de eventos</li>
                            <li><strong>A.8.16</strong> - Monitoreo de actividades</li>
                        </ul>
                    </div>
                </div>

                <div class="recommendation-box">
                    <h3>­ƒôï Pr├│ximas Acciones</h3>
                    <ul>
                        <li>Revisar y atender todos los problemas marcados como CR├ìTICOS</li>
                        <li>Planificar remediaci├│n de advertencias en los pr├│ximos 30 d├¡as</li>
                        <li>Documentar cambios realizados para auditor├¡as ISO 27001</li>
                        <li>Agendar pr├│xima revisi├│n mensual de Active Directory</li>
                        <li>Actualizar matriz de riesgos de seguridad de la informaci├│n</li>
                        <li>Compartir hallazgos con el Comit├® de Seguridad</li>
                    </ul>
                </div>
            </section>

            <div class="footer" style="text-align: center; padding: 32px; border-top: 1px solid var(--border-color); margin-top: 48px;">
                <p style="font-weight: 600; margin-bottom: 8px;">Fin del Informe de Monitoreo</p>
                <p>Generado por Sistema de Monitoreo AD - Seguridad Perimetral</p>
                <p style="margin-top: 8px;">­ƒôï Cumplimiento: ISO/IEC 27001:2022 e ISO/IEC 27002:2022</p>
                <p style="margin-top: 16px; color: var(--text-secondary); font-size: 12px;">
                    ÔÜá´©Å CONFIDENCIAL - Distribuci├│n restringida al personal autorizado
                </p>
            </div>
        </main>
    </div>

    <script>
        // Funcionalidad de desplegables
        document.addEventListener('DOMContentLoaded', function() {
            const collapsibles = document.querySelectorAll('.collapsible');
            
            collapsibles.forEach(button => {
                button.addEventListener('click', function() {
                    this.classList.toggle('active');
                    const content = this.nextElementSibling;
                    content.classList.toggle('active');
                });
            });

            // Smooth scroll
            document.querySelectorAll('.sidebar a').forEach(anchor => {
                anchor.addEventListener('click', function (e) {
                    e.preventDefault();
                    const target = document.querySelector(this.getAttribute('href'));
                    if (target) {
                        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                });
            });

            // Resaltar secci├│n activa
            const observerOptions = {
                root: null,
                rootMargin: '-20% 0px -70% 0px',
                threshold: 0
            };

            const observer = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        document.querySelectorAll('.sidebar a').forEach(link => {
                            link.style.background = '';
                            link.style.color = '';
                            if (link.getAttribute('href') === '#' + entry.target.id) {
                                link.style.background = 'var(--bg-gray)';
                                link.style.color = 'var(--primary-color)';
                            }
                        });
                    }
                });
            }, observerOptions);

            document.querySelectorAll('.section').forEach(section => {
                observer.observe(section);
            });
        });
    </script>
</body>
</html>
"@

# Guardar HTML
$htmlPath = Join-Path $OutputPath "$ReportName.html"
$htmlReport | Out-File -FilePath $htmlPath -Encoding UTF8
Write-Host "Ô£ô Reporte HTML guardado en: $htmlPath" -ForegroundColor Green

# Copiar a backup
try {
    $htmlBackupPath = Join-Path $BackupPath "$ReportName.html"
    Copy-Item -Path $htmlPath -Destination $htmlBackupPath -Force
    Write-Host "Ô£ô Copia de seguridad guardada en: $htmlBackupPath" -ForegroundColor Green
} catch {
    Write-Host "ÔÜá No se pudo guardar copia en: $BackupPath" -ForegroundColor Yellow
}

# ==================== ENV├ìO AL CRM (LOCAL) ====================

Write-Host "`nEnviando datos al CRM local..." -ForegroundColor Cyan

$reportData | Add-Member -MemberType NoteProperty -Name "Updates" -Value (Get-UpdateStatus)

try {
    $payload = @{
        service = "AD-DC01"
        data = $reportData
        html = $htmlReport
    }
    
    $jsonPayload = $payload | ConvertTo-Json -Depth 10
    Write-Host "   - Tama├▒o del reporte: $([Math]::Round($jsonPayload.Length / 1KB, 2)) KB" -ForegroundColor Gray
    
    $response = Invoke-RestMethod -Method Post -Uri $BackendUrl -Body $jsonPayload -ContentType "application/json" -TimeoutSec 60
    Write-Host "Ô£ô Datos enviados exitosamente al CRM: $($response.message)" -ForegroundColor Green
} catch {
    Write-Host "ÔÜá No se pudo conectar con el CRM ($BackendUrl)." -ForegroundColor Yellow
    Write-Host "   - Status Code: $($_.Exception.Response.StatusCode.Value__)" -ForegroundColor Gray
    Write-Host "   - Detalle: $($_.Exception.Message)" -ForegroundColor Gray
}

# ==================== RESUMEN FINAL ====================

Write-Host "`nÔòöÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòù" -ForegroundColor Green
Write-Host "Ôòæ          GENERACI├ôN DE REPORTES COMPLETADA           Ôòæ" -ForegroundColor Green
Write-Host "ÔòÜÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòÉÔòØ`n" -ForegroundColor Green

Write-Host "­ƒôü Archivos generados:" -ForegroundColor Cyan
Write-Host "   Ô£ô $ReportName.html" -ForegroundColor Green
Write-Host "`n­ƒôè Resumen Ejecutivo:`n" -ForegroundColor Cyan

# Mostrar resumen
Write-Host "­ƒûÑ´©Å  Controladores: $($reportData.DCs.OverallStatus)" -ForegroundColor $(if($reportData.DCs.OverallStatus -eq "OK"){"Green"}else{"Red"})
Write-Host "­ƒæÑ Usuarios:" -ForegroundColor White
Write-Host "   - Inactivos 90+ d├¡as: $($reportData.Users.Inactive90)" -ForegroundColor Yellow
Write-Host "   - Deshabilitados: $($reportData.Users.Disabled)" -ForegroundColor Gray
Write-Host "   - Bloqueados: $($reportData.Users.Locked)" -ForegroundColor $(if($reportData.Users.Locked -gt 0){"Red"}else{"Green"})
Write-Host "­ƒôï GPOs: $($reportData.GPOs.Total) total, $($reportData.GPOs.Empty) vac├¡as" -ForegroundColor White
Write-Host "­ƒöÉ Pol├¡tica Contrase├▒a: $(if($reportData.PasswordPolicy.DomainPolicy.MinPasswordLength -ge 12){"Ô£ô Conforme"}else{"ÔÜá Revisar"})" -ForegroundColor $(if($reportData.PasswordPolicy.DomainPolicy.MinPasswordLength -ge 12){"Green"}else{"Yellow"})
Write-Host "­ƒöÆ Eventos Seguridad: $($reportData.Security.FailedLogins) intentos fallidos" -ForegroundColor $(if($reportData.Security.FailedLogins -gt 100){"Red"}else{"Green"})

Write-Host "`nÔ£ô Presiona Enter para abrir el reporte..." -ForegroundColor Cyan
Read-Host

Start-Process $htmlPath

Write-Host "`nÔ£ô Script completado exitosamente" -ForegroundColor Green
