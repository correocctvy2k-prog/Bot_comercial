# Monitoreo IT - Scripts y tareas programadas

## Ubicacion

Los scripts viven en:

```text
CRM_Frontend/Monitoreo/
```

Estructura actual:

```text
CRM_Frontend/Monitoreo/
  AD/
  Host/
  KSC/
  ZK/
```

## Ejecucion PowerShell recomendada

Para evitar bloqueo por Execution Policy en servidores Windows:

```powershell
PowerShell.exe -NonInteractive -NoProfile -ExecutionPolicy Bypass -File .\Monitor-SERV-ZK.ps1
```

Tambien se puede ejecutar desde una tarea programada importada en Windows Task Scheduler.

## Backend de carga

Los scripts envian datos a:

```text
http://192.168.8.65:3001/api/monitoring/upload
```

El parametro se puede sobrescribir si cambia el servidor:

```powershell
.\Monitor-SERV-ZK.ps1 -BackendUrl "http://SERVIDOR:3001/api/monitoring/upload"
```

## Scripts por bloque

### AD

Carpeta:

```text
CRM_Frontend/Monitoreo/AD/
```

Scripts relevantes:

- `Monitor-AD.ps1`
- `Monitor-AD02.ps1`
- `Monitor-AD_V5.ps1`

Datos esperados:

- Estado de controladores de dominio.
- Replicacion.
- Eventos de seguridad de los ultimos 7 dias.
- Disco.
- Backups.
- Actualizaciones.

Servicios frontend:

- `AD`
- `AD-DC02`
- `AD-DC03`

### Hosts Hyper-V

Carpeta:

```text
CRM_Frontend/Monitoreo/Host/
```

Scripts:

- `Monitor-Host.ps1`
- `Monitor-ANFI-SEG.ps1`
- `Register-ANFIGANE-Task.ps1`

Datos esperados:

- Salud del anfitrion.
- RAM.
- Cantidad de VMs.
- Uptime.
- Estado de actualizaciones.

Servicios frontend:

- `ANFIGANE`
- `ANFI-SEG`

### Kaspersky Security Center

Carpeta:

```text
CRM_Frontend/Monitoreo/KSC/
```

Scripts:

- `Monitor-SERV-KSC.ps1`
- `Monitor-KSC.ps1`
- `Monitor-KSC-HardwareInventory.ps1`

`Monitor-SERV-KSC.ps1` consolida salud del servidor KSC:

- Uptime.
- Servicios.
- Disco.
- Estado de proteccion Kaspersky.
- Bases de datos AV.
- Amenazas.
- Vulnerabilidades.
- Licenciamiento.

`Monitor-KSC-HardwareInventory.ps1` procesa el informe HTML de hardware exportado desde Kaspersky.

Parametros utiles:

```powershell
.\Monitor-KSC-HardwareInventory.ps1 -KasperskyReportsPath "F:\Informes KSC"
.\Monitor-KSC-HardwareInventory.ps1 -ReportFile ".\Informe de hardware.html" -SkipUpload
```

Datos generados para el dashboard:

- Total de dispositivos.
- Windows Server.
- Windows 10.
- Windows 11.
- Otros sistemas.
- Maquinas virtuales vs fisicas.
- Ultima visibilidad:
  - Ultimo dia.
  - Ultima semana.
  - Mas de una semana.
  - Mas de un mes.

Servicios frontend:

- `KSC`
- `KSC-HARDWARE`

### ZK / BabyWare

Carpeta:

```text
CRM_Frontend/Monitoreo/ZK/
```

Scripts:

- `Monitor-SERV-ZK.ps1`
- `Skylab_Monitor_ZK.xml`

`Monitor-SERV-ZK.ps1` monitorea:

- Windows 10 de SERV-ZK.
- Salud local.
- Disco.
- Uptime.
- Actualizaciones.
- ZKBIOOnline Service.
- Servicios BioPlatform detectados.
- BabyWare TCP/16001.
- Conexion basica hacia Proxmox.

Parametros principales:

```powershell
.\Monitor-SERV-ZK.ps1 `
  -BackendUrl "http://192.168.8.65:3001/api/monitoring/upload" `
  -ServerIP "192.168.8.112" `
  -ProxmoxHostIP "192.168.8.50" `
  -BabyWareIP "192.168.8.112" `
  -BabyWarePort 16001
```

Servicio frontend:

- `SERV-ZK`

## Tarea programada SERV-ZK

Archivo:

```text
CRM_Frontend/Monitoreo/ZK/Skylab_Monitor_ZK.xml
```

Objetivo:

- Ejecutar `Monitor-SERV-ZK.ps1` diariamente.
- Hora definida: `06:25`.

Notas:

- El XML puede importarse en Windows 10 aunque se haya exportado desde Windows Server 2022, siempre que se revisen usuario, ruta del script y privilegios.
- Si cambia la ruta local del script, actualizar la accion de la tarea.
- La ejecucion debe usar `-ExecutionPolicy Bypass`.

## Recomendaciones para nuevas tareas

- Usar usuario con permisos suficientes para leer servicios, discos, eventos y Kaspersky.
- Activar "Run whether user is logged on or not" si aplica.
- Activar "Run with highest privileges".
- Registrar salida o errores en archivo `.log` durante la etapa de pruebas.
- Probar manualmente antes de activar recurrencia.

