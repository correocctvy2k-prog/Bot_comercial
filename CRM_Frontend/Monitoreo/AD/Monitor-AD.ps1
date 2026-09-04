<#
.SYNOPSIS
    Script automatizado para monitoreo mensual de Active Directory
.DESCRIPTION
    Recopila informacion critica del AD y genera reportes en formato TXT, HTML y PDF
    Alineado con ISO/IEC 27001:2022 e ISO/IEC 27002:2022
.AUTHOR
    Sistema de Monitoreo AD - Seguridad Perimetral
.DATE
    Octubre 2025
.COMPLIANCE
    ISO/IEC 27001:2022 - Controles: A.5.1, A.8.2, A.8.3, A.8.5, A.8.8, A.8.12, A.8.15
    ISO/IEC 27002:2022 - Controles de Seguridad de la Informacion
#>

# Configuracion inicial
$ErrorActionPreference = "Continue"
$OutputPath = "C:\AD_Reports"
$BackupPath = "\\ganepalmir\dpto.informatica\Johnathan.Beltran\OTROS\Chequeos\Active Directory" # Ruta de red (Maestro AD01)
$LocalBackup = "C:\AD_Reports\Backup" # Respaldo local
$BackendUrl = "http://192.168.8.65:3001/api/monitoring/upload" 
$ReportDate = Get-Date -Format "yyyy-MM-dd_HHmm"
$ReportName = "Informe_AD_$ReportDate"

# === CREDENCIALES PARA ACCESO A BACKUPS ===
# NOTA: Se usa cuenta administrador para acceder a rutas de backup si SYSTEM falla
# Especificar credenciales: usuario y contraseña para acceso a \\ganepalmi\Backup
# Si deja vacio, usara credenciales locales (SYSTEM del AD01)
$BackupCredUsername = "GANEPAL\Administrator"  # O: "GANEPAL\AD01$" (cuenta maquina)
$BackupCredPassword = "" # Reemplazar con la contraseña real si es necesario
$BackupUseCredentials = $false # Cambiar a $true si falla acceso sin credenciales

# Crear directorios si no existen
foreach ($path in @($OutputPath, $BackupPath)) {
    if (-not (Test-Path $path)) {
        try {
            New-Item -ItemType Directory -Path $path -Force | Out-Null
        } catch {
            Write-Host "⚠ No se pudo crear: $path" -ForegroundColor Yellow
        }
    }
}

# --- Importar Modulos ---
Import-Module ActiveDirectory
if (Get-Module -ListAvailable GroupPolicy) { Import-Module GroupPolicy }

# --- Actualizaciones ---
function Get-UpdateStatus {
    $rebootPending = (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending") -or 
                     (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired")
    
    $lastUpdate = Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 1
    
    return @{
        RebootRequired = $rebootPending
        LastInstalled = if ($lastUpdate.InstalledOn) { $lastUpdate.InstalledOn.ToString("yyyy-MM-dd") } else { "Desconocida" }
        LastKB = $lastUpdate.HotFixID
    }
}

# Importar modulo de Active Directory
try {
    Import-Module ActiveDirectory -ErrorAction Stop
    Write-Host "✓ Modulo Active Directory cargado" -ForegroundColor Green
} catch {
    Write-Host "✗ Error al cargar Active Directory: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Intentar cargar GroupPolicy (opcional)
try {
    Import-Module GroupPolicy -ErrorAction Stop
    Write-Host "✓ Modulo Group Policy cargado" -ForegroundColor Green
    $GPModuleLoaded = $true
} catch {
    Write-Host "⚠ Modulo Group Policy no disponible - Se omitira analisis de GPOs" -ForegroundColor Yellow
    $GPModuleLoaded = $false
}

# ==================== FUNCIONES AUXILIARES ====================

function Write-SectionHeader {
    param([string]$Title)
    $separator = "=" * 80
    return "`n$separator`n$Title`n$separator`n"
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
    
    $dcList = @("AD01", "DA02", "AD03")
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
            
            # Verificar servicios criticos
            $services = @('NTDS','DNS','KDC','W32Time','Netlogon','DFSR')
            $localName = $env:COMPUTERNAME
            
            foreach ($service in $services) {
                try {
                    $svc = $null
                    if ($dc -eq $localName -or $dc -eq "localhost") {
                        $svc = Get-Service -Name $service -ErrorAction SilentlyContinue
                    } else {
                        $svc = Get-Service -ComputerName $dc -Name $service -ErrorAction SilentlyContinue
                    }
                    
                    $status = if ($svc) { $svc.Status.ToString() } else { "NotFound" }
                    $dcInfo.Services += "$service - $status"
                    
                    if ($status -eq "Running") {
                        # Todo OK
                    } else {
                        $dcInfo.ServiceIssues += $service
                        $issues += "El servicio $service en $dc esta en estado - $status"
                    }
                } catch {
                    $dcInfo.Services += "$service - Error"
                    $dcInfo.ServiceIssues += $service
                }
            }
            
            # Obtener informacion del sistema
            try {
                $os = Get-CimInstance -ComputerName $dc -ClassName Win32_OperatingSystem -ErrorAction SilentlyContinue
                $lastBoot = [datetime]$os.LastBootUpTime
                $uptime = (Get-Date) - $lastBoot
                $dcInfo.Uptime = "$($uptime.Days) dias, $($uptime.Hours) horas"
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
            $recommendation = "ISO 27002 8.14: Todos los roles FSMO en un unico controlador - Riesgo de disponibilidad"
        }
        
        return @{
            Roles = $fsmoRoles
            Status = if ($recommendation) { "WARNING" } else { "OK" }
            Recommendation = $recommendation
            Issues = @()
            ISO27001Controls = @(
                Get-ISO27001Control "A.8.14" "Redundancy of information processing facilities"
            )
        }
    } catch {
        return @{
            Roles = "Error al obtener roles FSMO: $($_.Exception.Message)"
            Status = "ERROR"
            Issues = @("Error al obtener roles FSMO")
            Recommendation = "Verifique la conectividad con los controladores de dominio"
        }
    }
}

function Get-ReplicationStatus {
    Write-Host "[3/9] Verificando replicacion entre controladores..." -ForegroundColor Cyan
    
    $replStatus = @{
        Summary = ""
        Errors = @()
        ObjectCount = @()
        Status = "OK"
        Recommendation = ""
    }
    
    try {
        # repadmin puede fallar si no hay permisos de admin de dominio (SYSTEM es local)
        $replErrors = & repadmin /showrepl * /errorsonly 2>&1
        $hasErrors = $replErrors -match "error|fail"
        
        if ($hasErrors) {
            $replStatus.Errors = $replErrors -join "`n"
            $replStatus.Status = "CRITICAL"
            $replStatus.Recommendation = "ISO 27001 A.8.12: Datos inconsistentes detectados - Ejecute repadmin /syncall"
        } else {
            $replStatus.Errors = "No se encontraron errores de replicacion"
        }
    } catch {
        $replStatus.Errors = "No se pudo ejecutar repadmin (posible falta de permisos)"
        $replStatus.Status = "WARNING"
    }

    try {
        $dc1Objects = (Get-ADObject -Server "AD01" -Filter * -ErrorAction SilentlyContinue).Count
        $dc2Objects = (Get-ADObject -Server "DA02" -Filter * -ErrorAction SilentlyContinue).Count
        $dc3Objects = (Get-ADObject -Server "AD03" -Filter * -ErrorAction SilentlyContinue).Count
        
        if ($dc1Objects -and $dc2Objects -and $dc3Objects) {
            $maxObjects = [Math]::Max($dc1Objects, [Math]::Max($dc2Objects, $dc3Objects))
            $minObjects = [Math]::Min($dc1Objects, [Math]::Min($dc2Objects, $dc3Objects))
            $difference = [Math]::Abs($maxObjects - $minObjects)
            $replStatus.ObjectCount = @(
                "AD01 - $dc1Objects objetos",
                "DA02 - $dc2Objects objetos",
                "AD03 - $dc3Objects objetos",
                "Diferencia maxima - $difference objetos"
            )
            
            if ($difference -gt 10) {
                $replStatus.Status = "WARNING"
                $replStatus.Recommendation += " ISO 27002 5.23: Diferencia significativa ($difference objetos)"
            }
        }
    } catch {
        $replStatus.ObjectCount = @("Error al comparar objetos entre DCs")
    }
    
    return $replStatus
}

function Get-BackupStatus {
    Write-Host "[4/9] Verificando estado de backups..." -ForegroundColor Cyan
    
    $backupStatus = @()
    $issues = @()
    $rutas = @(
        "\\ganepalmi\Backup\ActiveBackupData\VM-BACKUP AD01",
        "\\ganepalmi\Backup\ActiveBackupData\VM-BACKUP AD02",
        "\\ganepalmi\Backup\ActiveBackupData\VM-BACKUP AD03"
    )
    
    $limite = (Get-Date).AddDays(-1)
    
    foreach ($ruta in $rutas) {
        $backupInfo = [PSCustomObject]@{
            Ruta = $ruta
            Accesible = $false
            UltimoBackup = "N/A"
            ArchivosRecientes = 0
            Status = "ERROR"
            TamanoTotal = 0
        }
        
        # Intentar acceso con credenciales si esta habilitado
        $testPath = $false
        if ($BackupUseCredentials -and $BackupCredPassword) {
            try {
                $cred = New-Object System.Management.Automation.PSCredential($BackupCredUsername, (ConvertTo-SecureString $BackupCredPassword -AsPlainText -Force))
                $testPath = Test-Path $ruta -Credential $cred -ErrorAction SilentlyContinue
            } catch {
                Write-Host "⚠ Error al usar credenciales para $ruta" -ForegroundColor Yellow
                $testPath = $false
            }
        } else {
            $testPath = Test-Path $ruta
        }
        
        if ($testPath) {
            $backupInfo.Accesible = $true
            $archivosRecientes = Get-ChildItem -Path $ruta -Recurse -ErrorAction SilentlyContinue | 
                Where-Object { $_.LastWriteTime -gt $limite }
            
            if ($archivosRecientes) {
                $backupInfo.ArchivosRecientes = $archivosRecientes.Count
                $backupInfo.TamanoTotal = [math]::Round(($archivosRecientes | Measure-Object -Property Length -Sum).Sum / 1GB, 2)
                $backupInfo.UltimoBackup = ($archivosRecientes | Sort-Object LastWriteTime -Descending | 
                    Select-Object -First 1).LastWriteTime.ToString("yyyy-MM-dd HH:mm")
                $backupInfo.Status = "OK"
            } else {
                $backupInfo.Status = "WARNING"
                $rutaNum = $backupStatus.Count + 1
                $issues += "ISO 27001 A.8.13: Sin backups recientes - Almacenamiento $rutaNum"
            }
        } else {
            $rutaNum = $backupStatus.Count + 1
            $issues += "ISO 27001 A.8.13: No se puede acceder al almacenamiento $rutaNum"
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
    Write-Host "[5/9] Analizando estadisticas de usuarios..." -ForegroundColor Cyan
    
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
        UsersByOU = @()
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
        
        # Usuarios que nunca iniciaron sesion
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
        
        # Buscar usuarios eliminados en AD Recycle Bin (si esta habilitado)
        try {
            $deletedUsers = Get-ADObject -Filter {ObjectClass -eq "user" -and IsDeleted -eq $true} `
                -IncludeDeletedObjects -Properties * -ErrorAction SilentlyContinue
            
            $userStats.DetailedDeleted = $deletedUsers | Select-Object -First 50 | ForEach-Object {
                [PSCustomObject]@{
                    Usuario = $_.SamAccountName
                    Nombre = ($_.Name -split '[\r\n]')[0].Trim()
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
        
        # Obtener conteo de usuarios por OU (incluyendo sub-OUs de Palmira)
        try {
            $allOUs = Get-ADOrganizationalUnit -Filter *
            # OUs de primer nivel
            $rootOUs = $allOUs | Where-Object {$_.DistinguishedName -notmatch "OU=.*,OU="}
            # Sub-OUs dentro de Palmira
            $palmiraSubOUs = $allOUs | Where-Object {
                $_.DistinguishedName -match ",OU=Palmira," -and
                ($_.DistinguishedName -replace "^OU=[^,]+,","") -match "^OU=Palmira,"
            }
            $targetOUs = @($rootOUs) + @($palmiraSubOUs) | Sort-Object DistinguishedName -Unique
            foreach ($ou in $targetOUs) {
                $userCount = (Get-ADUser -Filter * -SearchBase $ou.DistinguishedName -SearchScope OneLevel).Count
                if ($userCount -gt 0) {
                    $isPalmiraSub = $palmiraSubOUs -and ($palmiraSubOUs | Where-Object {$_.DistinguishedName -eq $ou.DistinguishedName})
                    $ouLabel = if ($isPalmiraSub) { "Palmira > $($ou.Name)" } else { $ou.Name }
                    $userStats.UsersByOU += [PSCustomObject]@{
                        OU = $ouLabel
                        Users = $userCount
                        Path = $ou.DistinguishedName
                    }
                }
            }
            $userStats.UsersByOU = $userStats.UsersByOU | Sort-Object Users -Descending
            # Fallback si no se obtuvieron OUs
            if ($userStats.UsersByOU.Count -eq 0) {
                $allUsersOU = Get-ADUser -Filter * -Properties CanonicalName
                $ouGroups = $allUsersOU | Group-Object {$_.CanonicalName.Split('/')[1]} | Where-Object {$_.Name}
                $userStats.UsersByOU = $ouGroups | ForEach-Object {
                    [PSCustomObject]@{
                        OU = $_.Name
                        Users = $_.Count
                        Path = ""
                    }
                } | Sort-Object Users -Descending
            }
        } catch {
            $userStats.UsersByOU = @()
        }
        
        # Analisis ISO 27001
        if ($userStats.Locked -gt 0) {
            $userStats.Issues += "ISO 27001 A.5.17: $($userStats.Locked) cuenta(s) bloqueada(s)"
        }
        
        if ($userStats.Inactive90 -gt 10) {
            $userStats.Issues += "ISO 27001 A.5.18: $($userStats.Inactive90) usuarios inactivos >90 dias"
            $userStats.Recommendations += "Revisar y deshabilitar cuentas inactivas segun politica de acceso"
        }
        
        if ($userStats.NonExpiringPwd -gt 5) {
            $userStats.Issues += "ISO 27002 5.17: $($userStats.NonExpiringPwd) cuentas con contraseñas no expirables"
        }
        
    } catch {
        Write-Host "Error en estadisticas de usuarios: $($_.Exception.Message)" -ForegroundColor Yellow
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
    Status = "OK"
    }
    
    # Verificar si el modulo esta disponible
    if (-not $GPModuleLoaded) {
        $gpoStats.Issues += "Modulo Group Policy no disponible - Analisis omitido"
    $gpoStats.Status = if ($gpoStats.Issues -match "CRITICO") { "CRITICAL" } elseif ($gpoStats.Issues.Count -gt 0) { "WARNING" } else { "OK" }
        return $gpoStats
    }
    
    try {
        $allGPOs = Get-GPO -All
        $gpoStats.Total = $allGPOs.Count
        
        foreach ($gpo in $allGPOs) {
            $gpoReport = [xml](Get-GPOReport -Guid $gpo.Id -ReportType Xml)
            
            # Detectar GPOs vacias
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
            
            # GPOs modificadas recientemente (ultimos 30 dias)
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
        
        # Analisis de seguridad
        if ($gpoStats.Empty -gt 0) {
            $gpoStats.Issues += "ISO 27002 5.15: $($gpoStats.Empty) GPO(s) vacias detectadas"
            $gpoStats.Recommendations += "Eliminar GPOs vacias para mantener la higiene del dominio"
        }
        
        if ($gpoStats.Unlinked -gt 5) {
            $gpoStats.Issues += "ISO 27001 A.8.3: $($gpoStats.Unlinked) GPO(s) sin vincular"
            $gpoStats.Recommendations += "Revisar GPOs sin enlazar - pueden ser obsoletas"
        }
        
        # Verificar GPOs criticas de seguridad
        $criticalGPOs = @("Default Domain Policy", "Default Domain Controllers Policy")
        foreach ($criticalGPO in $criticalGPOs) {
            $exists = $allGPOs | Where-Object {$_.DisplayName -eq $criticalGPO}
            if (-not $exists) {
                $gpoStats.Issues += "CRiTICO: GPO '$criticalGPO' no encontrada"
            }
        }
        
    } catch {
        $gpoStats.Issues += "Error al analizar GPOs: $($_.Exception.Message)"
    }
    
    return $gpoStats
}

function Get-DiskSpace {
    Write-Host "[7/9] Verificando espacio en disco..." -ForegroundColor Cyan
    
    $dcList = @("AD01", "DA02", "AD03")
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
        Status = "OK"
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
        
        # Cambios en politicas (Event ID 4719)
        $securityEvents.PolicyChanges = (Get-WinEvent -FilterHashtable @{
            LogName='Security'; ID=4719; StartTime=$startDate
        } -ErrorAction SilentlyContinue).Count
        
        # Analisis ISO 27001
        if ($securityEvents.FailedLogins -gt 100) {
            $securityEvents.Issues += "ISO 27001 A.8.15: $($securityEvents.FailedLogins) intentos fallidos"
            $securityEvents.Recommendations += "Posible ataque de fuerza bruta - Revisar Event ID 4625"
        }
        
        if ($securityEvents.AccountLockouts -gt 10) {
            $securityEvents.Issues += "ISO 27002 5.17: $($securityEvents.AccountLockouts) bloqueos de cuenta"
        }
        
        if ($securityEvents.PolicyChanges -gt 0) {
            $securityEvents.Issues += "ISO 27001 A.5.1: $($securityEvents.PolicyChanges) cambios en politicas"
            $securityEvents.Recommendations += "Revisar cambios en politicas de seguridad (Event ID 4719)"
        }
        
    } catch {
        Write-Host "Advertencia: No se pudieron obtener todos los eventos de seguridad" -ForegroundColor Yellow
    }
    
    
    $securityEvents.Status = if ($securityEvents.Issues.Count -eq 0) { "OK" } elseif ($securityEvents.Issues -match "fuerza bruta") { "CRITICAL" } else { "WARNING" }
    return $securityEvents
}

function Get-PasswordPolicyCompliance {
    Write-Host "[9/9] Verificando cumplimiento de politicas de contraseña..." -ForegroundColor Cyan
    
    $policyCompliance = @{
        DomainPolicy = $null
        FineGrainedPolicies = @()
        Issues = @()
        Recommendations = @()
    }
    
    try {
        # Politica de dominio por defecto
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
        
        # Analisis de cumplimiento ISO 27002
        if ($defaultPolicy.MinPasswordLength -lt 12) {
            $policyCompliance.Issues += "ISO 27002 5.17: Longitud minima de contraseña insuficiente ($($defaultPolicy.MinPasswordLength) caracteres)"
            $policyCompliance.Recommendations += "ISO 27002 recomienda minimo 12 caracteres"
        }
        
        if (-not $defaultPolicy.ComplexityEnabled) {
            $policyCompliance.Issues += "ISO 27002 5.17: Complejidad de contraseña no habilitada"
        }
        
        if ($defaultPolicy.MaxPasswordAge.Days -gt 90) {
            $policyCompliance.Issues += "ISO 27002 5.17: Edad maxima de contraseña excede 90 dias"
        }
        
        if ($defaultPolicy.LockoutThreshold -eq 0 -or $defaultPolicy.LockoutThreshold -gt 5) {
            $policyCompliance.Issues += "ISO 27002 5.17: Umbral de bloqueo inadecuado"
            $policyCompliance.Recommendations += "Configure entre 3-5 intentos fallidos"
        }
        
        # Politicas de contraseña de grano fino (Fine-Grained Password Policies)
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
        $policyCompliance.Issues += "Error al verificar politicas de contraseña: $($_.Exception.Message)"
    }
    
    return $policyCompliance
}

function Get-DCResourceLoad {
    Write-Host "[7/9] Verificando carga de recursos en controladores..." -ForegroundColor Cyan
    
    # Obtener lista de DCs reales del dominio
    $dcList = try {
        (Get-ADDomainController -Filter * -ErrorAction SilentlyContinue).HostName | ForEach-Object { $_.Split('.')[0] }
    } catch {
        @("AD01", "AD02", "AD03")  # Fallback si no puede obtener los DCs
    }
    
    $resourceLoad = @()
    
    foreach ($dc in $dcList) {
        try {
            # Obtener CPU y Memoria
            $cpuLoad = (Get-WmiObject -Class Win32_Processor -ComputerName $dc -ErrorAction SilentlyContinue | Measure-Object -Property LoadPercentage -Average).Average
            $memory = Get-WmiObject -Class Win32_OperatingSystem -ComputerName $dc -ErrorAction SilentlyContinue
            
            if ($memory) {
                $memUsedPercent = [math]::Round(((($memory.TotalVisibleMemorySize - $memory.FreePhysicalMemory) / $memory.TotalVisibleMemorySize) * 100), 2)
                $memUsedGB = [math]::Round(($memory.TotalVisibleMemorySize - $memory.FreePhysicalMemory) / 1MB, 2)
                $memTotalGB = [math]::Round($memory.TotalVisibleMemorySize / 1MB, 2)
            } else {
                $memUsedPercent = 0
                $memUsedGB = 0
                $memTotalGB = 0
            }
            
            $resourceLoad += [PSCustomObject]@{
                DC = $dc
                CPULoad = if($cpuLoad) { [math]::Round($cpuLoad, 1) } else { 0 }
                MemoryUsed = $memUsedPercent
                MemoryGB = "$memUsedGB / $memTotalGB"
                Status = "OK"
            }
        } catch {
            $resourceLoad += [PSCustomObject]@{
                DC = $dc
                CPULoad = "N/A"
                MemoryUsed = "N/A"
                MemoryGB = "N/A"
                Status = "Error"
            }
        }
    }
    
    return @{
        Load = $resourceLoad
        Issues = @()
        Status = "OK"
    }
}

function Get-UpdateStatus {
    $rebootPending = $false
    if (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired") { $rebootPending = $true }
    if (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending") { $rebootPending = $true }
    
    $pendingCount = 0
    try {
        $updateSession = New-Object -ComObject Microsoft.Update.Session
        $updateSearcher = $updateSession.CreateUpdateSearcher()
        $searchResult = $updateSearcher.Search("IsInstalled=0 and Type='Software' and IsHidden=0")
        $pendingCount = $searchResult.Updates.Count
    } catch { }

    $lastUpdate = Get-HotFix -ErrorAction SilentlyContinue | Sort-Object InstalledOn -Descending | Select-Object -First 1
    
    return @{
        RebootRequired = $rebootPending
        PendingCount = $pendingCount
        LastInstalled = if ($lastUpdate.InstalledOn) { $lastUpdate.InstalledOn.ToString("yyyy-MM-dd") } else { "Desconocido" }
        Status = if ($rebootPending) { "Reinicio Requerido" } elseif ($pendingCount -gt 0) { "$pendingCount Pendientes" } else { "OK" }
    }
}

# ==================== RECOPILACIoN DE DATOS ====================

Write-Host "`n╔═══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║   MONITOREO AD - ISO 27001:2022 / ISO 27002:2022     ║" -ForegroundColor Green
Write-Host "╚═══════════════════════════════════════════════════════╝`n" -ForegroundColor Green

$reportData = @{
    Date = Get-Date -Format "dd/MM/yyyy HH:mm:ss"
    DCs = Get-DCStatus
    FSMO = Get-FSMORoles
    Replication = Get-ReplicationStatus
    Backups = Get-BackupStatus
    Users = Get-UserStatistics
    Updates = Get-UpdateStatus
    ResourceLoad = Get-DCResourceLoad
    GPOs = Get-GPOStatus
    Disk = Get-DiskSpace
    Security = Get-SecurityEvents
    PasswordPolicy = Get-PasswordPolicyCompliance
}

# ==================== GENERACIoN DE REPORTE HTML ====================

Write-Host "`nGenerando reporte HTML con diseño Microsoft Learn..." -ForegroundColor Cyan

# Definir variable para guiones dobles (para evitar problemas de parsing en PowerShell)
$dashdash = '--'

# ==================== GENERACION DE REPORTE HTML ====================

Write-Host "`nGenerando reporte HTML..." -ForegroundColor Cyan

# --- Calcular estado global ---
$overallStatuses = @($reportData.DCs.OverallStatus, $reportData.FSMO.Status, $reportData.Replication.Status, $reportData.Backups.Status, $reportData.ResourceLoad.Status, $reportData.Disk.Status, $reportData.Security.Status) | Where-Object { $_ }
$globalStatus = if ($overallStatuses -contains "CRITICAL") { "CRITICAL" } elseif ($overallStatuses -contains "WARNING") { "WARNING" } else { "OK" }
$globalColor  = if ($globalStatus -eq "CRITICAL") { "#d13438" } elseif ($globalStatus -eq "WARNING") { "#ffb900" } else { "#107c10" }
$globalIcon   = if ($globalStatus -eq "CRITICAL") { "&#128721;" } elseif ($globalStatus -eq "WARNING") { "&#9888;&#65039;" } else { "&#9989;" }

$htmlReport = ""

$htmlReport += @"
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Informe AD - ISO 27001/27002 - $ReportDate</title>
    <style>
        :root {
            --primary-color: #0078d4; --success-color: #107c10; --warning-color: #ffb900;
            --error-color: #d13438; --bg-gray: #f3f2f1; --border-color: #edebe9;
            --text-primary: #323130; --text-secondary: #605e5c;
            --shadow-sm: 0 1.6px 3.6px rgba(0,0,0,.13), 0 0.3px 0.9px rgba(0,0,0,.11);
            --shadow-md: 0 3.2px 7.2px rgba(0,0,0,.13), 0 0.6px 1.8px rgba(0,0,0,.11);
        }
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:"Segoe UI",-apple-system,BlinkMacSystemFont,"Roboto",sans-serif; line-height:1.6; color:var(--text-primary); background:var(--bg-gray); }
        .top-bar { background:#fff; border-bottom:1px solid var(--border-color); padding:12px 0; box-shadow:var(--shadow-sm); position:sticky; top:0; z-index:1000; }
        .top-bar-content { max-width:1400px; margin:0 auto; padding:0 24px; display:flex; align-items:center; gap:16px; }
        .logo { font-size:20px; font-weight:600; color:var(--primary-color); display:flex; align-items:center; gap:8px; }
        .iso-badge { background:linear-gradient(135deg,#667eea,#764ba2); color:#fff; padding:4px 12px; border-radius:12px; font-size:11px; font-weight:600; text-transform:uppercase; }
        .main-container { max-width:1400px; margin:0 auto; display:grid; grid-template-columns:250px 1fr; gap:24px; padding:24px; }
        .sidebar { background:#fff; padding:24px; border-radius:8px; box-shadow:var(--shadow-sm); height:fit-content; position:sticky; top:80px; }
        .sidebar h3 { font-size:14px; font-weight:600; margin-bottom:16px; color:var(--text-secondary); text-transform:uppercase; }
        .sidebar nav ul { list-style:none; }
        .sidebar nav li { margin-bottom:4px; }
        .sidebar a { display:block; padding:8px 12px; border-radius:4px; text-decoration:none; color:var(--text-primary); font-size:14px; transition:all .2s; }
        .sidebar a:hover { background:var(--bg-gray); color:var(--primary-color); }
        .content { min-width:0; }
        .page-header { background:#fff; border-radius:8px; padding:32px; margin-bottom:24px; box-shadow:var(--shadow-sm); border-left:4px solid var(--primary-color); }
        .page-header h1 { font-size:28px; font-weight:700; color:var(--text-primary); }
        .meta { display:flex; gap:16px; margin-top:16px; flex-wrap:wrap; }
        .meta span { background:var(--bg-gray); padding:4px 12px; border-radius:12px; font-size:13px; color:var(--text-secondary); }
        .section { background:#fff; border-radius:8px; padding:32px; margin-bottom:24px; box-shadow:var(--shadow-sm); }
        .section-header { display:flex; align-items:center; gap:12px; margin-bottom:24px; padding-bottom:16px; border-bottom:2px solid var(--border-color); }
        .section-header h2 { font-size:22px; font-weight:700; flex:1; }
        .section-icon { font-size:24px; }
        .iso-control-badge { background:#f0f6ff; color:var(--primary-color); padding:4px 10px; border-radius:4px; font-size:12px; font-weight:600; border:1px solid #c7e0f4; white-space:nowrap; }
        .stats-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:16px; margin-bottom:24px; }
        .stat-card { background:#fff; border:1px solid var(--border-color); border-radius:8px; padding:20px; text-align:center; box-shadow:var(--shadow-sm); }
        .stat-card-label { font-size:12px; color:var(--text-secondary); text-transform:uppercase; letter-spacing:.5px; margin-bottom:8px; font-weight:600; }
        .stat-card-value { font-size:32px; font-weight:700; color:var(--text-primary); }
        .stat-card-value.success { color:var(--success-color); }
        .stat-card-value.warning { color:var(--warning-color); }
        .stat-card-value.error { color:var(--error-color); }
        .alert { border-radius:8px; padding:16px 20px; margin-bottom:16px; border-left:4px solid; }
        .alert-ok, .alert-success { background:#f1faf1; border-color:var(--success-color); }
        .alert-warning { background:#fffbf0; border-color:var(--warning-color); }
        .alert-critical, .alert-error { background:#fdf3f3; border-color:var(--error-color); }
        .alert-info { background:#f0f6ff; border-color:var(--primary-color); }
        .alert strong { font-size:16px; display:block; margin-bottom:4px; }
        .data-table { width:100%; border-collapse:collapse; margin:16px 0; font-size:14px; }
        .data-table th { background:var(--bg-gray); padding:10px 14px; text-align:left; font-weight:600; font-size:12px; text-transform:uppercase; color:var(--text-secondary); border-bottom:2px solid var(--border-color); }
        .data-table td { padding:10px 14px; border-bottom:1px solid var(--border-color); }
        .data-table tr:last-child td { border-bottom:none; }
        .data-table tr:hover td { background:var(--bg-gray); }
        .status-badge { display:inline-block; padding:3px 10px; border-radius:12px; font-size:12px; font-weight:600; }
        .status-badge.ok { background:#e6f4e6; color:var(--success-color); }
        .status-badge.warning { background:#fff8e1; color:#b07800; }
        .status-badge.critical { background:#fde7e9; color:var(--error-color); }
        .collapsible { width:100%; text-align:left; background:var(--bg-gray); border:1px solid var(--border-color); border-radius:6px; padding:14px 18px; font-size:15px; font-weight:600; cursor:pointer; margin-top:12px; display:flex; justify-content:space-between; align-items:center; transition:all .2s; }
        .collapsible::after { content:"\25BC"; font-size:12px; transition:transform .3s; }
        .collapsible.active::after { transform:rotate(180deg); }
        .collapsible:hover { background:var(--border-color); }
        .collapsible-content { max-height:0; overflow:hidden; transition:max-height .4s ease-out; }
        .collapsible-content.active { max-height:5000px; }
        .collapsible-inner { padding:16px 4px; }
        .recommendation-box { background:#f0f6ff; border:1px solid #c7e0f4; border-radius:8px; padding:20px; margin-top:16px; }
        .recommendation-box h3 { color:var(--primary-color); margin-bottom:12px; font-size:16px; }
        .recommendation-box ul { padding-left:20px; }
        .recommendation-box li { margin-bottom:6px; font-size:14px; }
        .btn { background:var(--primary-color); color:#fff; border:none; padding:10px 20px; border-radius:4px; cursor:pointer; font-size:14px; font-weight:600; margin-bottom:24px; }
        .btn:hover { background:#005a9e; }
        .footer { text-align:center; padding:32px; border-top:1px solid var(--border-color); margin-top:48px; }
        @media print { .top-bar,.sidebar,.btn { display:none; } .main-container { grid-template-columns:1fr; } .collapsible-content { max-height:none !important; } }
    </style>
</head>
<body>
    <div class="top-bar"><div class="top-bar-content">
        <div class="logo"><span>&#128737;&#65039;</span><span>Active Directory Monitoring</span></div>
        <span class="iso-badge">ISO 27001:2022</span><span class="iso-badge">ISO 27002:2022</span>
    </div></div>
    <div class="main-container">
        <aside class="sidebar"><h3>Contenido</h3><nav><ul>
            <li><a href="#health-summary">&#9989; Estado General</a></li>
            <li><a href="#dc-status">&#128421;&#65039; Controladores</a></li>
            <li><a href="#fsmo">&#9881;&#65039; Roles FSMO</a></li>
            <li><a href="#replication">&#128260; Replicacion</a></li>
            <li><a href="#backups">&#128190; Backups</a></li>
            <li><a href="#users">&#128101; Usuarios</a></li>
            <li><a href="#gpos">&#128203; GPOs</a></li>
            <li><a href="#resource-load">&#9889; Carga de Recursos</a></li>
            <li><a href="#passwords">&#128272; Politicas Contrasena</a></li>
            <li><a href="#disk">&#128191; Espacio en Disco</a></li>
            <li><a href="#security">&#128274; Seguridad</a></li>
        </ul></nav></aside>
        <main class="content">
            <div class="page-header">
                <h1>Informe de Monitoreo Active Directory</h1>
                <p style="font-size:16px;color:var(--text-secondary);margin-top:8px;">Analisis de cumplimiento ISO/IEC 27001:2022 e ISO/IEC 27002:2022</p>
                <div class="meta">
                    <span>&#128197; $($reportData.Date)</span>
                    <span>&#128203; Controles A.5, A.8</span>
                    <span>&#127970; Dominio: $(([System.DirectoryServices.ActiveDirectory.Domain]::GetCurrentDomain()).Name)</span>
                </div>
            </div>
            <button class="btn" onclick="window.print()">&#128424;&#65039; Imprimir / Guardar PDF</button>
"@

$htmlReport += @"
            <section id="health-summary" class="section" style="border-left:4px solid $globalColor;">
                <div class="section-header"><div class="section-icon">$globalIcon</div><h2>Estado General del Sistema</h2></div>
                <div class="alert alert-$(if($globalStatus){($globalStatus).ToLower()}else{"ok"})" style="margin-bottom:24px;">
                    <div><strong>Estado Global: $globalStatus</strong>
                    <p style="font-size:14px;margin-top:4px;">Resumen ejecutivo de todos los componentes monitoreados - $($reportData.Date)</p></div>
                </div>
                <div class="stats-grid">
                    <div class="stat-card"><div class="stat-card-label">Controladores</div>
                    <div class="stat-card-value $(if($reportData.DCs.OverallStatus -eq "OK"){"success"}elseif($reportData.DCs.OverallStatus -eq "WARNING"){"warning"}else{"error"})">$($reportData.DCs.OverallStatus)</div></div>
                    <div class="stat-card"><div class="stat-card-label">Replicacion</div>
                    <div class="stat-card-value $(if($reportData.Replication.Status -eq "OK"){"success"}elseif($reportData.Replication.Status -eq "WARNING"){"warning"}else{"error"})">$($reportData.Replication.Status)</div></div>
                    <div class="stat-card"><div class="stat-card-label">Backups</div>
                    <div class="stat-card-value $(if($reportData.Backups.Status -eq "OK"){"success"}elseif($reportData.Backups.Status -eq "WARNING"){"warning"}else{"error"})">$($reportData.Backups.Status)</div></div>
                    <div class="stat-card"><div class="stat-card-label">Recursos DC</div>
                    <div class="stat-card-value $(if($reportData.ResourceLoad.Status -eq "OK"){"success"}elseif($reportData.ResourceLoad.Status -eq "WARNING"){"warning"}else{"error"})">$($reportData.ResourceLoad.Status)</div></div>
                    <div class="stat-card"><div class="stat-card-label">Disco</div>
                    <div class="stat-card-value $(if($reportData.Disk.Status -eq "OK"){"success"}elseif($reportData.Disk.Status -eq "WARNING"){"warning"}else{"error"})">$($reportData.Disk.Status)</div></div>
                    <div class="stat-card"><div class="stat-card-label">Usuarios Bloqueados</div>
                    <div class="stat-card-value $(if($reportData.Users.Locked -gt 0){"error"}else{"success"})">$($reportData.Users.Locked)</div></div>
                </div>
            </section>
"@

$htmlReport += @"
            <section id="dc-status" class="section">
                <div class="section-header"><div class="section-icon">&#128421;&#65039;</div><h2>Controladores de Dominio</h2>
                <span class="iso-control-badge">ISO 27001 A.8.2, A.8.15</span></div>
                <div class="alert alert-$(if($reportData.DCs.OverallStatus){($reportData.DCs.OverallStatus).ToLower()}else{"ok"})">
                    <div><strong>Estado General: $($reportData.DCs.OverallStatus)</strong>
                    $(if($reportData.DCs.Issues.Count -gt 0){ "<ul style='margin-top:8px;'>" + (($reportData.DCs.Issues | ForEach-Object {"<li>$_</li>"}) -join "") + "</ul>" } else { "<p>Todos los controladores operando normalmente</p>" })
                    </div>
                </div>
                <table class="data-table"><thead><tr>
                    <th>Controlador</th><th>Estado</th><th>Uptime</th><th>Sistema Operativo</th><th>Ultimo Reinicio</th>
                </tr></thead><tbody>
"@
foreach ($dc in $reportData.DCs.Status) {
    $dcBadge = if($dc.Pingable) { '<span class="status-badge ok">&#9679; Online</span>' } else { '<span class="status-badge critical">&#9679; Offline</span>' }
    $htmlReport += "                    <tr><td><strong>$($dc.DC)</strong></td><td>$dcBadge</td><td>$($dc.Uptime)</td><td style='font-size:12px;'>$($dc.OSVersion)</td><td>$($dc.LastReboot)</td></tr>`r`n"
}
$htmlReport += @"
                </tbody></table>
            </section>
"@

$htmlReport += @"
            <section id="fsmo" class="section">
                <div class="section-header"><div class="section-icon">&#9881;&#65039;</div><h2>Roles FSMO (Flexible Single Master Operations)</h2>
                <span class="iso-control-badge">ISO 27001 A.8.14</span></div>
                <div class="alert alert-$(if($reportData.FSMO.Status){($reportData.FSMO.Status).ToLower()}else{"ok"})">
                    <div><strong>Estado de Roles FSMO - $($reportData.FSMO.Status)</strong>
                    $(if($reportData.FSMO.Issues.Count -gt 0){ "<ul style='margin-top:8px;'>" + (($reportData.FSMO.Issues | ForEach-Object {"<li>$_</li>"}) -join "") + "</ul>" } else { "<p>Todos los roles FSMO asignados correctamente</p>" })
                    </div>
                </div>
                <table class="data-table"><thead><tr><th>Rol FSMO</th><th>Controlador</th><th>Estado</th></tr></thead><tbody>
                    <tr><td>PDC Emulator</td><td><strong>$($reportData.FSMO.Roles.PDCEmulator)</strong></td><td>$(if($reportData.FSMO.Roles.PDCEmulator -ne "No disponible"){"<span class='status-badge ok'>&#9679; Online</span>"}else{"<span class='status-badge critical'>&#9679; Error</span>"})</td></tr>
                    <tr><td>RID Master</td><td><strong>$($reportData.FSMO.Roles.RIDMaster)</strong></td><td>$(if($reportData.FSMO.Roles.RIDMaster -ne "No disponible"){"<span class='status-badge ok'>&#9679; Online</span>"}else{"<span class='status-badge critical'>&#9679; Error</span>"})</td></tr>
                    <tr><td>Infrastructure Master</td><td><strong>$($reportData.FSMO.Roles.InfrastructureMaster)</strong></td><td>$(if($reportData.FSMO.Roles.InfrastructureMaster -ne "No disponible"){"<span class='status-badge ok'>&#9679; Online</span>"}else{"<span class='status-badge critical'>&#9679; Error</span>"})</td></tr>
                    <tr><td>Schema Master</td><td><strong>$($reportData.FSMO.Roles.SchemaMaster)</strong></td><td>$(if($reportData.FSMO.Roles.SchemaMaster -ne "No disponible"){"<span class='status-badge ok'>&#9679; Online</span>"}else{"<span class='status-badge critical'>&#9679; Error</span>"})</td></tr>
                    <tr><td>Domain Naming Master</td><td><strong>$($reportData.FSMO.Roles.DomainNamingMaster)</strong></td><td>$(if($reportData.FSMO.Roles.DomainNamingMaster -ne "No disponible"){"<span class='status-badge ok'>&#9679; Online</span>"}else{"<span class='status-badge critical'>&#9679; Error</span>"})</td></tr>
                </tbody></table>
            </section>
"@

$htmlReport += @"
            <section id="replication" class="section">
                <div class="section-header"><div class="section-icon">&#128260;</div><h2>Estado de Replicacion AD</h2>
                <span class="iso-control-badge">ISO 27001 A.8.14</span></div>
                <div class="alert alert-$(if($reportData.Replication.Status){($reportData.Replication.Status).ToLower()}else{"ok"})">
                    <div><strong>Replicacion AD - $($reportData.Replication.Status)</strong>
                    $(if($reportData.Replication.Errors -and $reportData.Replication.Errors -ne "Sin errores de replicacion") { "<p style='margin-top:6px;'>$($reportData.Replication.Errors)</p>" } else { "<p>Sin errores de replicacion detectados</p>" })
                    </div>
                </div>
                <h3 style="margin:24px 0 12px;font-size:18px;">Conteo de Objetos entre Controladores</h3>
                <div style="background:var(--bg-gray);padding:20px;border-radius:6px;">
                $($reportData.Replication.ObjectCount | ForEach-Object { "<p style='margin:8px 0;font-size:15px;'>$_</p>" })
                </div>
                $(if($reportData.Replication.Recommendation) {
                    "<div class='recommendation-box'><h3>&#128161; Acciones Recomendadas</h3><ul>" +
                    "<li>$($reportData.Replication.Recommendation)</li>" +
                    "<li>Ejecute: <code>repadmin /showrepl</code></li>" +
                    "<li>Use: <code>repadmin /syncall /AdeP</code> para forzar sincronizacion</li>" +
                    "</ul></div>"
                })
            </section>
"@

$htmlReport += @"
            <section id="backups" class="section">
                <div class="section-header"><div class="section-icon">&#128190;</div><h2>Estado de Backups</h2>
                <span class="iso-control-badge">ISO 27001 A.8.13</span></div>
                <div class="alert alert-$(if($reportData.Backups.Status){($reportData.Backups.Status).ToLower()}else{"ok"})">
                    <div><strong>Estado de Backups - $($reportData.Backups.Status)</strong>
                    $(if($reportData.Backups.Issues.Count -gt 0){ "<ul style='margin-top:8px;'>" + (($reportData.Backups.Issues | ForEach-Object {"<li>$_</li>"}) -join "") + "</ul>" } else { "<p style='margin-top:8px;'>Todos los backups funcionando correctamente.</p>" })
                    </div>
                </div>
                <table class="data-table"><thead><tr>
                    <th>Almacenamiento</th><th>Accesible</th><th>Ultimo Backup</th><th>Archivos (24h)</th><th>Tamano Total</th>
                </tr></thead><tbody>
"@
$bkpNum = 0
foreach ($backup in $reportData.Backups.Backups) {
    $bkpNum++
    $bkpBadge = if($backup.Accesible) { '<span class="status-badge ok">&#9679; Accesible</span>' } else { '<span class="status-badge critical">&#9679; No Accesible</span>' }
    $bkpLabel = if($backup.Accesible) { "Almacenamiento Remoto $bkpNum" } else { "Almacenamiento $bkpNum (No disponible)" }
    $htmlReport += "                    <tr><td>$bkpLabel</td><td>$bkpBadge</td><td>$($backup.UltimoBackup)</td><td>$($backup.ArchivosRecientes)</td><td>$($backup.TamanoTotal) GB</td></tr>`r`n"
}
$htmlReport += @"
                </tbody></table>
                $(if($reportData.Backups.Issues.Count -gt 0) {
                    "<div class='recommendation-box'><h3>&#128161; Acciones Requeridas</h3><ul>" +
                    "<li>Verifique la conectividad con el NAS y el estado del servicio de backup</li>" +
                    "<li>Asegurese de que las tareas programadas esten activas</li>" +
                    "<li>Pruebe la restauracion de un backup al menos mensualmente</li>" +
                    "<li>Implemente la regla 3-2-1: 3 copias, 2 tipos de medios, 1 offsite</li>" +
                    "</ul></div>"
                })
            </section>
"@

$htmlReport += @"
            <section id="users" class="section">
                <div class="section-header"><div class="section-icon">&#128101;</div><h2>Estadisticas de Usuarios</h2>
                <span class="iso-control-badge">ISO 27001 A.5.17, A.5.18</span></div>
                <div class="stats-grid">
                    <div class="stat-card"><div class="stat-card-label">Total de Usuarios</div><div class="stat-card-value">$($reportData.Users.Total)</div></div>
                    <div class="stat-card"><div class="stat-card-label">Habilitados</div><div class="stat-card-value success">$($reportData.Users.Enabled)</div></div>
                    <div class="stat-card"><div class="stat-card-label">Deshabilitados</div><div class="stat-card-value">$($reportData.Users.Disabled)</div></div>
                    <div class="stat-card"><div class="stat-card-label">Bloqueados</div><div class="stat-card-value $(if($reportData.Users.Locked -gt 0){"error"}else{""})">$($reportData.Users.Locked)</div></div>
                </div>
                <h3 style="margin:24px 0 12px;font-size:18px;color:var(--primary-color);font-weight:600;">&#128202; Usuarios por Unidad Organizativa</h3>
                $(if($reportData.Users.UsersByOU.Count -gt 0) {
                    "<table class='data-table'><thead><tr>" +
                    "<th>Unidad Organizativa</th><th>Numero de Usuarios</th><th>% del Total</th>" +
                    "</tr></thead><tbody>" +
                    (($reportData.Users.UsersByOU | ForEach-Object {
                        $pct = if($reportData.Users.Total -gt 0) { [math]::Round(([int]$_.Users / $reportData.Users.Total) * 100, 1) } else { 0 }
                        "<tr><td><strong>$($_.OU)</strong></td><td>$([int]$_.Users)</td><td>$pct%</td></tr>"
                    }) -join "") +
                    "</tbody></table>"
                } else { "<p style='color:var(--text-secondary);padding:12px;'>No se encontraron datos de OU</p>" })
"@
$htmlReport += "<button class='collapsible'>&#9888;&#65039; Usuarios Inactivos (+90 dias): $($reportData.Users.Inactive90) usuarios</button>"
$htmlReport += "<div class='collapsible-content'><div class='collapsible-inner'>"
if ($reportData.Users.DetailedInactive90.Count -gt 0) {
    $htmlReport += "<table class='data-table'><thead><tr><th>Usuario</th><th>Nombre</th><th>Ultimo Acceso</th><th>Dias Inactivo</th><th>Departamento</th></tr></thead><tbody>"
    foreach ($u in $reportData.Users.DetailedInactive90) {
        $htmlReport += "<tr><td>$($u.Usuario)</td><td>$($u.Nombre)</td><td>$($u.UltimoAcceso)</td><td><strong>$($u.DiasInactivo)</strong></td><td>$($u.Departamento)</td></tr>"
    }
    $htmlReport += "</tbody></table>"
} else { $htmlReport += "<p style='color:var(--success-color);'>&#9989; No hay usuarios inactivos por mas de 90 dias</p>" }
$htmlReport += "</div></div>"

$htmlReport += "<button class='collapsible'>&#128683; Usuarios Deshabilitados: $($reportData.Users.Disabled) usuarios</button>"
$htmlReport += "<div class='collapsible-content'><div class='collapsible-inner'>"
if ($reportData.Users.DetailedDisabled.Count -gt 0) {
    $htmlReport += "<table class='data-table'><thead><tr><th>Usuario</th><th>Nombre</th><th>Ultima Modificacion</th><th>Departamento</th></tr></thead><tbody>"
    foreach ($u in $reportData.Users.DetailedDisabled) {
        $htmlReport += "<tr><td>$($u.Usuario)</td><td>$($u.Nombre)</td><td>$($u.UltimaModificacion)</td><td>$($u.Departamento)</td></tr>"
    }
    $htmlReport += "</tbody></table><p style='margin-top:12px;'><em>Mostrando primeros 50 usuarios</em></p>"
} else { $htmlReport += "<p>No hay usuarios deshabilitados</p>" }
$htmlReport += "</div></div>"

$htmlReport += "<button class='collapsible'>&#128465;&#65039; Usuarios Eliminados (Papelera AD): $($reportData.Users.DetailedDeleted.Count) usuarios</button>"
$htmlReport += "<div class='collapsible-content'><div class='collapsible-inner'>"
if ($reportData.Users.DetailedDeleted.Count -gt 0) {
    $htmlReport += "<table class='data-table'><thead><tr><th>Usuario</th><th>Nombre</th><th>Fecha Eliminacion</th><th>Ultima Ubicacion</th></tr></thead><tbody>"
    foreach ($u in $reportData.Users.DetailedDeleted) {
        $htmlReport += "<tr><td>$($u.Usuario)</td><td>$($u.Nombre)</td><td>$($u.FechaEliminacion)</td><td style='font-size:11px;'>$($u.UltimaUbicacion)</td></tr>"
    }
    $htmlReport += "</tbody></table>"
} else { $htmlReport += "<p style='color:var(--text-secondary);'>No hay usuarios en la papelera de reciclaje de AD</p>" }
$htmlReport += "</div></div>"

$htmlReport += "<button class='collapsible'>&#10067; Nunca Iniciaron Sesion: $($reportData.Users.DetailedNeverLoggedIn.Count) usuarios</button>"
$htmlReport += "<div class='collapsible-content'><div class='collapsible-inner'>"
if ($reportData.Users.DetailedNeverLoggedIn.Count -gt 0) {
    $htmlReport += "<table class='data-table'><thead><tr><th>Usuario</th><th>Nombre</th><th>Fecha Creacion</th><th>Departamento</th></tr></thead><tbody>"
    foreach ($u in $reportData.Users.DetailedNeverLoggedIn) {
        $htmlReport += "<tr><td>$($u.Usuario)</td><td>$($u.Nombre)</td><td>$($u.FechaCreacion)</td><td>$($u.Departamento)</td></tr>"
    }
    $htmlReport += "</tbody></table>"
} else { $htmlReport += "<p>No hay usuarios sin inicio de sesion</p>" }
$htmlReport += "</div></div>"

if ($reportData.Users.Recommendations.Count -gt 0 -or $reportData.Users.Issues.Count -gt 0) {
    $htmlReport += "<div class='recommendation-box'><h3>&#128161; Recomendaciones ISO 27001</h3><ul>"
    $htmlReport += "<li>Revisar mensualmente las cuentas inactivas y deshabilitarlas</li>"
    $htmlReport += "<li>Implementar rotacion de contrase�as para cuentas administrativas</li>"
    $htmlReport += "<li>Use: <code>Search-ADAccount -AccountInactive -TimeSpan 90</code></li>"
    $htmlReport += "<li>Considere implementar Privileged Access Management (PAM)</li>"
    $htmlReport += "</ul></div>"
}
$htmlReport += "            </section>"

$htmlReport += @"
            <section id="gpos" class="section">
                <div class="section-header"><div class="section-icon">&#128203;</div><h2>Group Policy Objects (GPOs)</h2>
                <span class="iso-control-badge">ISO 27001 A.8.3, A.5.15</span></div>
                <div class="stats-grid">
                    <div class="stat-card"><div class="stat-card-label">Total GPOs</div><div class="stat-card-value">$($reportData.GPOs.Total)</div></div>
                    <div class="stat-card"><div class="stat-card-label">GPOs Vinculadas</div><div class="stat-card-value success">$($reportData.GPOs.Linked)</div></div>
                    <div class="stat-card"><div class="stat-card-label">Sin Vincular</div><div class="stat-card-value warning">$($reportData.GPOs.Unlinked)</div></div>
                    <div class="stat-card"><div class="stat-card-label">GPOs Vacias</div><div class="stat-card-value $(if($reportData.GPOs.Empty -gt 0){"warning"}else{""})">$($reportData.GPOs.Empty)</div></div>
                </div>
                $(if($reportData.GPOs.Issues.Count -gt 0) {
                    "<div class='alert alert-warning'><div><strong>Problemas Detectados en GPOs</strong>" +
                    "<ul style='margin-top:8px;'>" + ((($reportData.GPOs.Issues | ForEach-Object {"<li>$_</li>"}) -join "")) + "</ul></div></div>"
                } else {
                    "<div class='alert alert-success'><div><strong>&#9989; Estado de GPOs Normal</strong><p>No se detectaron problemas en las politicas de grupo</p></div></div>"
                })
"@
# Lista completa de GPOs
if ($reportData.GPOs.Total -gt 0) {
    $htmlReport += "<button class='collapsible'>&#128203; Lista Completa de GPOs ($($reportData.GPOs.Total) politicas)</button>"
    $htmlReport += "<div class='collapsible-content'><div class='collapsible-inner'>"
    $htmlReport += "<table class='data-table'><thead><tr><th>Nombre</th><th>Estado</th><th>Creacion</th><th>Ultima Modificacion</th><th>Enlaces</th><th>Vacia</th></tr></thead><tbody>"
    foreach ($g in $reportData.GPOs.GPODetails) {
        $gEmptyBadge = if($g.Vacia) { '<span class="status-badge warning">Si</span>' } else { '<span class="status-badge ok">No</span>' }
        $htmlReport += "<tr><td><strong>$($g.Nombre)</strong></td><td>$($g.Estado)</td><td>$($g.Creacion)</td><td>$($g.Modificacion)</td><td>$($g.Enlaces)</td><td>$gEmptyBadge</td></tr>"
    }
    $htmlReport += "</tbody></table></div></div>"
} else {
    $htmlReport += "<div class='alert alert-info'><div><strong>Analisis de GPOs No Disponible</strong><p>Instale RSAT: <code>Install-WindowsFeature GPMC</code></p></div></div>"
}
if ($reportData.GPOs.RecentlyModified.Count -gt 0) {
    $htmlReport += "<button class='collapsible'>&#128260; GPOs Modificadas (ultimos 30 dias): $($reportData.GPOs.RecentlyModified.Count) politicas</button>"
    $htmlReport += "<div class='collapsible-content'><div class='collapsible-inner'>"
    $htmlReport += "<table class='data-table'><thead><tr><th>Nombre GPO</th><th>Fecha Modificacion</th><th>Modificado Por</th></tr></thead><tbody>"
    foreach ($g in $reportData.GPOs.RecentlyModified) {
        $htmlReport += "<tr><td><strong>$($g.Nombre)</strong></td><td>$($g.FechaModificacion)</td><td>$($g.ModificadoPor)</td></tr>"
    }
    $htmlReport += "</tbody></table></div></div>"
}
$htmlReport += "<div class='recommendation-box'><h3>&#128161; Recomendaciones ISO 27002</h3><ul>"
$htmlReport += "<li>Auditar cambios en GPOs criticas regularmente</li>"
$htmlReport += "<li>Implementar versionado y respaldo de GPOs (Backup-GPO)</li>"
$htmlReport += "<li>Revisar permisos de edicion de GPOs (minimo privilegio)</li>"
$htmlReport += "<li>Eliminar o vincular GPOs sin vincular</li>"
$htmlReport += "</ul></div>"
$htmlReport += "            </section>"

$htmlReport += @"
            <section id="resource-load" class="section">
                <div class="section-header"><div class="section-icon">&#9889;</div><h2>Carga de Recursos de Controladores</h2>
                <span class="iso-control-badge">ISO 27001 A.8.6</span></div>
                <div class="alert alert-$(if($reportData.ResourceLoad.Status){($reportData.ResourceLoad.Status).ToLower()}else{"ok"})">
                    <div><strong>Monitoreo de Recursos - $($reportData.ResourceLoad.Status)</strong>
                    <p style="margin-top:8px;">Estado actual de CPU y memoria en todos los controladores</p></div>
                </div>
                <table class="data-table"><thead><tr>
                    <th>Controlador</th><th>CPU (%)</th><th>Memoria (%)</th><th>Memoria (GB)</th><th>Estado</th>
                </tr></thead><tbody>
"@
foreach ($rl in $reportData.ResourceLoad.Load) {
    $cpuBadge = if([double]$rl.CPULoad -lt 50) { "ok" } elseif([double]$rl.CPULoad -lt 80) { "warning" } else { "critical" }
    $memBadge = if([double]$rl.MemoryUsed -lt 50) { "ok" } elseif([double]$rl.MemoryUsed -lt 80) { "warning" } else { "critical" }
    $rlBadge  = if($rl.Status -eq "OK") { '<span class="status-badge ok">&#9679; Normal</span>' } else { '<span class="status-badge critical">&#9679; Error</span>' }
    $htmlReport += "                    <tr><td><strong>$($rl.DC)</strong></td><td><span class='status-badge $cpuBadge'>$($rl.CPULoad)%</span></td><td><span class='status-badge $memBadge'>$($rl.MemoryUsed)%</span></td><td>$($rl.MemoryGB)</td><td>$rlBadge</td></tr>`r`n"
}
$htmlReport += @"
                </tbody></table>
                <div class="recommendation-box"><h3>&#128161; Monitoreo de Recursos</h3><ul>
                    <li>CPU > 80%: Puede afectar el rendimiento del DC</li>
                    <li>Memoria > 80%: Considere ampliar RAM o revisar procesos</li>
                    <li>Revisar procesos: <code>Get-Process | Sort-Object CPU -Descending | Select -First 10</code></li>
                    <li>Implemente alertas automaticas con monitoreo continuo</li>
                </ul></div>
            </section>
"@

$htmlReport += @"
            <section id="passwords" class="section">
                <div class="section-header"><div class="section-icon">&#128272;</div><h2>Politicas de Contrasena</h2>
                <span class="iso-control-badge">ISO 27002 5.17</span></div>
                <h3 style="margin-bottom:16px;font-size:20px;color:var(--primary-color);font-weight:700;">Politica de Dominio Predeterminada</h3>
                <div class="stats-grid">
                    <div class="stat-card"><div class="stat-card-label" style="color:#0078d4;font-weight:700;border-bottom:2px solid #0078d4;padding-bottom:8px;">Longitud Minima</div>
                    <div class="stat-card-value $(if($reportData.PasswordPolicy.DomainPolicy.MinPasswordLength -lt 12){"warning"}else{"success"})">$($reportData.PasswordPolicy.DomainPolicy.MinPasswordLength) car.</div></div>
                    <div class="stat-card"><div class="stat-card-label" style="color:#0078d4;font-weight:700;border-bottom:2px solid #0078d4;padding-bottom:8px;">Edad Maxima</div>
                    <div class="stat-card-value $(if($reportData.PasswordPolicy.DomainPolicy.MaxPasswordAge -gt 90){"warning"}else{"success"})">$($reportData.PasswordPolicy.DomainPolicy.MaxPasswordAge) dias</div></div>
                    <div class="stat-card"><div class="stat-card-label" style="color:#0078d4;font-weight:700;border-bottom:2px solid #0078d4;padding-bottom:8px;">Historial</div>
                    <div class="stat-card-value">$($reportData.PasswordPolicy.DomainPolicy.PasswordHistoryCount) contrasenas</div></div>
                    <div class="stat-card"><div class="stat-card-label" style="color:#0078d4;font-weight:700;border-bottom:2px solid #0078d4;padding-bottom:8px;">Umbral Bloqueo</div>
                    <div class="stat-card-value $(if($reportData.PasswordPolicy.DomainPolicy.LockoutThreshold -eq 0 -or $reportData.PasswordPolicy.DomainPolicy.LockoutThreshold -gt 5){"warning"}else{"success"})">$($reportData.PasswordPolicy.DomainPolicy.LockoutThreshold) intentos</div></div>
                    <div class="stat-card"><div class="stat-card-label" style="color:#0078d4;font-weight:700;border-bottom:2px solid #0078d4;padding-bottom:8px;">Complejidad</div>
                    <div class="stat-card-value $(if($reportData.PasswordPolicy.DomainPolicy.ComplexityEnabled){"success"}else{"error"})">$(if($reportData.PasswordPolicy.DomainPolicy.ComplexityEnabled){"&#9989; Habilitada"}else{"&#10007; Deshabilitada"})</div></div>
                    <div class="stat-card"><div class="stat-card-label" style="color:#0078d4;font-weight:700;border-bottom:2px solid #0078d4;padding-bottom:8px;">Duracion Bloqueo</div>
                    <div class="stat-card-value">$($reportData.PasswordPolicy.DomainPolicy.LockoutDuration) min</div></div>
                </div>
                $(if($reportData.PasswordPolicy.FineGrainedPolicies.Count -gt 0) {
                    "<h3 style='margin:32px 0 16px;font-size:20px;'>Politicas de Grano Fino (PSOs)</h3>" +
                    "<table class='data-table'><thead><tr><th>Nombre</th><th>Precedencia</th><th>Long. Minima</th><th>Complejidad</th><th>Aplica A</th></tr></thead><tbody>" +
                    (($reportData.PasswordPolicy.FineGrainedPolicies | ForEach-Object {
                        "<tr><td><strong>$($_.Name)</strong></td><td>$($_.Precedence)</td><td>$($_.MinPasswordLength)</td><td>$(if($_.ComplexityEnabled){"&#9989;"}else{"&#10007;"})</td><td>$($_.AppliesTo)</td></tr>"
                    }) -join "") + "</tbody></table>"
                })
                $(if($reportData.PasswordPolicy.Issues.Count -gt 0) {
                    "<div class='alert alert-warning' style='margin-top:24px;'><div><strong>Incumplimientos ISO 27002 5.17</strong>" +
                    "<ul style='margin-top:8px;'>" + ((($reportData.PasswordPolicy.Issues | ForEach-Object {"<li>$_</li>"}) -join "")) + "</ul></div></div>"
                } else {
                    "<div class='alert alert-success' style='margin-top:24px;'><div><strong>&#9989; Politicas de Contrasena Conformes</strong><p>Las politicas cumplen ISO 27002:2022</p></div></div>"
                })
            </section>
"@

$htmlReport += @"
            <section id="disk" class="section">
                <div class="section-header"><div class="section-icon">&#128191;</div><h2>Espacio en Disco</h2>
                <span class="iso-control-badge">ISO 27001 A.8.6</span></div>
                <div class="alert alert-$(if($reportData.Disk.Status){($reportData.Disk.Status).ToLower()}else{"ok"})">
                    <div><strong>Estado: $($reportData.Disk.Status)</strong>
                    $(if($reportData.Disk.Issues.Count -gt 0){ "<ul style='margin-top:8px;'>" + (($reportData.Disk.Issues | ForEach-Object {"<li>$_</li>"}) -join "") + "</ul>" } else { "<p>Espacio en disco adecuado en todos los controladores</p>" })
                    </div>
                </div>
                <table class="data-table"><thead><tr>
                    <th>Controlador</th><th>Unidad</th><th>Tamano Total</th><th>Espacio Libre</th><th>% Libre</th><th>Estado</th>
                </tr></thead><tbody>
"@
foreach ($disk in $reportData.Disk.Disks) {
    $diskBadge = if($disk.PercentFree -ge 25) { '<span class="status-badge ok">&#9679; Saludable</span>' } elseif($disk.PercentFree -ge 15) { '<span class="status-badge warning">&#9679; Advertencia</span>' } else { '<span class="status-badge critical">&#9679; Critico</span>' }
    $htmlReport += "                    <tr><td><strong>$($disk.DC)</strong></td><td>$($disk.Drive)</td><td>$($disk.SizeGB) GB</td><td>$($disk.FreeGB) GB</td><td><strong>$($disk.PercentFree)%</strong></td><td>$diskBadge</td></tr>`r`n"
}
$htmlReport += @"
                </tbody></table>
                $(if($reportData.Disk.Issues.Count -gt 0) {
                    "<div class='recommendation-box'><h3>&#128161; Acciones Inmediatas</h3><ul>" +
                    "<li>Libere espacio eliminando archivos temporales y logs antiguos</li>" +
                    "<li>Use <code>cleanmgr.exe</code> para limpieza de disco</li>" +
                    "<li>Revise logs en C:\\Windows\\NTDS\\ y C:\\Windows\\Logs\\</li>" +
                    "<li>Implemente alertas cuando el espacio libre sea menor al 20%</li>" +
                    "</ul></div>"
                })
            </section>
"@

$htmlReport += @"
            <section id="security" class="section">
                <div class="section-header"><div class="section-icon">&#128274;</div><h2>Eventos de Seguridad (ultimos 7 dias)</h2>
                <span class="iso-control-badge">ISO 27001 A.8.15, A.8.16</span></div>
                <div class="stats-grid">
                    <div class="stat-card"><div class="stat-card-label">Inicios Fallidos</div>
                    <div class="stat-card-value $(if($reportData.Security.FailedLogins -gt 100){"error"}elseif($reportData.Security.FailedLogins -gt 20){"warning"}else{""})">$($reportData.Security.FailedLogins)</div></div>
                    <div class="stat-card"><div class="stat-card-label">Bloqueos de Cuenta</div>
                    <div class="stat-card-value $(if($reportData.Security.AccountLockouts -gt 10){"error"}elseif($reportData.Security.AccountLockouts -gt 0){"warning"}else{""})">$($reportData.Security.AccountLockouts)</div></div>
                    <div class="stat-card"><div class="stat-card-label">Cambios de Contrasena</div>
                    <div class="stat-card-value">$($reportData.Security.PasswordChanges)</div></div>
                    <div class="stat-card"><div class="stat-card-label">Cambios de Politica</div>
                    <div class="stat-card-value $(if($reportData.Security.PolicyChanges -gt 0){"warning"}else{"success"})">$($reportData.Security.PolicyChanges)</div></div>
                </div>
                <div class="alert alert-$(if($reportData.Security.Status){($reportData.Security.Status).ToLower()}else{"ok"})">
                    <div><strong>Estado de Seguridad: $($reportData.Security.Status)</strong>
                    $(if($reportData.Security.Issues.Count -gt 0){ "<ul style='margin-top:8px;'>" + (($reportData.Security.Issues | ForEach-Object {"<li>$_</li>"}) -join "") + "</ul>" } else { "<p>No se detectaron amenazas criticas en el periodo analizado</p>" })
                    </div>
                </div>
                $(if($reportData.Security.Recommendations.Count -gt 0) {
                    "<div class='recommendation-box'><h3>&#128161; Recomendaciones de Seguridad</h3><ul>" +
                    (($reportData.Security.Recommendations | ForEach-Object {"<li>$_</li>"}) -join "") +
                    "<li>Monitorear patrones de inicio de sesion fallidos</li>" +
                    "<li>Implementar SIEM para correlacion de eventos</li>" +
                    "</ul></div>"
                })
            </section>
"@

$htmlReport += @"
            <section class="section">
                <div class="section-header"><div class="section-icon">&#128202;</div><h2>Resumen de Cumplimiento ISO 27001:2022</h2></div>
                <div class="alert alert-info"><div>
                    <strong>Controles Evaluados en este Informe</strong>
                    <p style="margin-top:12px;">Cobertura de controles ISO/IEC 27001:2022:</p>
                    <ul style="margin-top:8px;column-count:2;">
                        <li><strong>A.5.1</strong> - Politicas de seguridad</li>
                        <li><strong>A.5.15</strong> - Control de acceso</li>
                        <li><strong>A.5.17</strong> - Autenticacion</li>
                        <li><strong>A.5.18</strong> - Derechos de acceso</li>
                        <li><strong>A.8.2</strong> - Acceso privilegiado</li>
                        <li><strong>A.8.3</strong> - Restriccion de acceso</li>
                        <li><strong>A.8.6</strong> - Gestion de capacidad</li>
                        <li><strong>A.8.13</strong> - Respaldo de informacion</li>
                        <li><strong>A.8.14</strong> - Redundancia</li>
                        <li><strong>A.8.15</strong> - Registro de eventos</li>
                        <li><strong>A.8.16</strong> - Monitoreo de actividades</li>
                    </ul>
                </div></div>
                <div class="recommendation-box"><h3>&#128203; Proximas Acciones</h3><ul>
                    <li>Revisar y atender todos los problemas marcados como CRITICOS</li>
                    <li>Planificar remediacion de advertencias en los proximos 30 dias</li>
                    <li>Documentar cambios realizados para auditorias ISO 27001</li>
                    <li>Agendar proxima revision mensual de Active Directory</li>
                    <li>Actualizar matriz de riesgos de seguridad de la informacion</li>
                </ul></div>
            </section>
            <div class="footer">
                <p style="font-weight:600;margin-bottom:8px;">Fin del Informe de Monitoreo</p>
                <p>Generado por Sistema de Monitoreo AD - Seguridad Perimetral</p>
                <p style="margin-top:8px;">&#128203; Cumplimiento: ISO/IEC 27001:2022 e ISO/IEC 27002:2022</p>
                <p style="margin-top:16px;color:var(--text-secondary);font-size:12px;">&#9888;&#65039; CONFIDENCIAL - Distribucion restringida al personal autorizado</p>
            </div>
        </main>
    </div>
    <script>
        document.addEventListener("DOMContentLoaded", function() {
            document.querySelectorAll(".collapsible").forEach(function(btn) {
                btn.addEventListener("click", function() {
                    this.classList.toggle("active");
                    var content = this.nextElementSibling;
                    if (content) content.classList.toggle("active");
                });
            });
            document.querySelectorAll(".sidebar a").forEach(function(a) {
                a.addEventListener("click", function(e) {
                    e.preventDefault();
                    var t = document.querySelector(this.getAttribute("href"));
                    if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
                });
            });
        });
    </script>
</body>
</html>
"@
# Guardar HTML
$htmlPath = Join-Path $OutputPath "$ReportName.html"
$htmlReport | Out-File -FilePath $htmlPath -Encoding UTF8
Write-Host "✓ Reporte HTML guardado en: $htmlPath" -ForegroundColor Green

# Copiar a backup
try {
    $htmlBackupPath = Join-Path $BackupPath "$ReportName.html"
    Copy-Item -Path $htmlPath -Destination $htmlBackupPath -Force
    Write-Host "✓ Copia de seguridad guardada en: $htmlBackupPath" -ForegroundColor Green
} catch {
    Write-Host "⚠ No se pudo guardar copia en: $BackupPath" -ForegroundColor Yellow
}

# ==================== ENViO AL CRM (LOCAL) ====================

Write-Host "`nEnviando datos al CRM local..." -ForegroundColor Cyan

try {
    $payload = @{
        service = "AD"
        data = $reportData
        html = $htmlReport
    }
    
    $jsonPayload = $payload | ConvertTo-Json -Depth 10
    Write-Host "   - Tamano del reporte: $([Math]::Round($jsonPayload.Length / 1KB, 2)) KB" -ForegroundColor Gray
    
    $response = Invoke-RestMethod -Method Post -Uri $BackendUrl -Body $jsonPayload -ContentType "application/json" -TimeoutSec 60
    Write-Host "✓ Datos enviados exitosamente al CRM: $($response.message)" -ForegroundColor Green
} catch {
    Write-Host "⚠ No se pudo conectar con el CRM ($BackendUrl)." -ForegroundColor Yellow
    Write-Host "   - Status Code: $($_.Exception.Response.StatusCode.Value__)" -ForegroundColor Gray
    Write-Host "   - Detalle: $($_.Exception.Message)" -ForegroundColor Gray
}

# ==================== RESUMEN FINAL ====================

Write-Host "`n╔═══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║          GENERACIoN DE REPORTES COMPLETADA           ║" -ForegroundColor Green
Write-Host "╚═══════════════════════════════════════════════════════╝`n" -ForegroundColor Green

Write-Host "📁 Archivos generados:" -ForegroundColor Cyan
Write-Host "   ✓ $ReportName.html" -ForegroundColor Green
Write-Host "`n📊 Resumen Ejecutivo:`n" -ForegroundColor Cyan

# Mostrar resumen
Write-Host "🖥️  Controladores: $($reportData.DCs.OverallStatus)" -ForegroundColor $(if($reportData.DCs.OverallStatus -eq "OK"){"Green"}else{"Red"})
Write-Host "👥 Usuarios:" -ForegroundColor White
Write-Host "   - Total: $($reportData.Users.Total)" -ForegroundColor Green
Write-Host "   - Inactivos 90+ dias: $($reportData.Users.Inactive90)" -ForegroundColor Yellow
Write-Host "   - Deshabilitados: $($reportData.Users.Disabled)" -ForegroundColor Gray
Write-Host "   - Bloqueados: $($reportData.Users.Locked)" -ForegroundColor $(if($reportData.Users.Locked -gt 0){"Red"}else{"Green"})
Write-Host "📊 Usuarios por OU: $($reportData.Users.UsersByOU.Count) OU(s) detectadas" -ForegroundColor Cyan
Write-Host "📋 GPOs: $($reportData.GPOs.Total) total, $($reportData.GPOs.Empty) vacias" -ForegroundColor White
$avgCPU = ($reportData.ResourceLoad.Load.CPULoad | Where-Object {$_ -ne "N/A"} | Measure-Object -Average).Average
Write-Host "⚡ Carga Promedio CPU: $([math]::Round($avgCPU, 1))%" -ForegroundColor $(if($avgCPU -lt 50){"Green"}elseif($avgCPU -lt 80){"Yellow"}else{"Red"})
Write-Host "🔐 Politica Contraseña: $(if($reportData.PasswordPolicy.DomainPolicy.MinPasswordLength -ge 12){"✓ Conforme"}else{"⚠ Revisar"}) " -ForegroundColor $(if($reportData.PasswordPolicy.DomainPolicy.MinPasswordLength -ge 12){"Green"}else{"Yellow"})
Write-Host "🔒 Eventos Seguridad: $($reportData.Security.FailedLogins) intentos fallidos" -ForegroundColor $(if($reportData.Security.FailedLogins -gt 100){"Red"}else{"Green"})

Write-Host "`n✓ Script completado exitosamente." -ForegroundColor Green
# No se requiere pausa ni apertura de navegador para tareas programadas


