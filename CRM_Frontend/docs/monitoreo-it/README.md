# Monitoreo IT - Documentacion del modulo

Estado: 2026-06-10

## Proposito

El modulo **Monitoreo IT** centraliza la salud de infraestructura local y servicios criticos del ecosistema Skylab. Su objetivo es mostrar en una sola pantalla el estado operativo de anfitriones, maquinas virtuales, servicios Windows, conectividad por ping, inventario Kaspersky y recomendaciones inteligentes para operacion diaria.

El modulo esta pensado para una pantalla de monitoreo permanente: informacion compacta, visual, sin exponer IPs en la interfaz principal y con alertas sutiles que ayudan a decidir que revisar primero.

## Vistas del modulo

### Dashboard

Ruta: `/monitoring`

Es la vista principal que queda en pantalla. Incluye:

- Tarjetas de anfitriones y maquinas virtuales con jerarquia padre-hijo.
- LEDs de estado por ping en anfitriones y VMs.
- Latencia en milisegundos cuando el nodo responde.
- Estado de servicios, disco, uptime, backups y actualizaciones.
- Panel Kaspersky Security Center con KPIs de proteccion.
- Inventario KSC con KPIs y graficos premium.
- Grafico protagonista alternable entre frescura de visibilidad y tipos de dispositivos.
- Layout editable por usuario, con orden y ancho persistidos en el navegador.
- Notificaciones inteligentes con SkylabBot, sonido y recomendaciones cada 5 minutos.

### Detalles Monitoreo

Ruta: `/monitoring/dashboard`

Vista secundaria para tareas operativas. Incluye:

- Historial de ejecuciones locales.
- Acceso a reportes HTML historicos.
- Eliminacion de reportes historicos.
- Informacion de detalle que no debe saturar la pantalla principal.

## Infraestructura cubierta

| Bloque | Elemento | Rol |
| --- | --- | --- |
| ANFIGANE | Host ProLiant / Hyper-V | Anfitrion de AD01 y AD02 |
| ANFIGANE | AD01 | Controlador principal de dominio |
| ANFIGANE | AD02 | Controlador secundario |
| ANFI-SEG13798 | Host ProLiant / Hyper-V | Anfitrion de AD03 y SERV-KSC |
| ANFI-SEG13798 | AD03 | Controlador secundario |
| ANFI-SEG13798 | SERV-KSC | Kaspersky Security Center |
| PROXMOX-ZK | Proxmox VE | Anfitrion de SERV-ZK |
| PROXMOX-ZK | SERV-ZK | Windows 10 con ZKBio CVSecurity |
| SERV-ZK | BabyWare TCP/16001 | Servicio paralelo de alarmas |

## Avances implementados

### Estructura visual de infraestructura

- Se adopto el formato de anfitrion como contenedor padre.
- Las VMs se muestran como subtarjetas dentro del host correspondiente.
- ANFIGANE contiene AD01 y AD02.
- ANFI-SEG13798 contiene AD03 y SERV-KSC.
- PROXMOX-ZK contiene SERV-ZK.
- La UI oculta las IPs en tarjetas y KPIs para mantener una vista limpia.

### Ping y heartbeat centralizado

- El ping no depende de los scripts PowerShell.
- El backend realiza heartbeat desde el VPS y emite `monitoring:heartbeat` por Socket.IO.
- El frontend usa ese heartbeat para LEDs y latencia.
- Se monitorean nodos por ICMP y BabyWare por TCP/16001.

### Monitoreo por scripts PowerShell

- Los scripts `.ps1` consolidan salud local y envian JSON/HTML al backend.
- AD reporta controladores, replicacion, eventos de seguridad, disco, backups y actualizaciones.
- Hosts reportan salud del anfitrion y VMs.
- KSC reporta salud local y estado de proteccion Kaspersky.
- SERV-ZK reporta Windows 10, ZKBio CVSecurity, BioPlatform, BabyWare y salud local.
- KSC Hardware Inventory procesa el informe HTML de hardware para visualizar inventario.

### Kaspersky Security Center

- Se agrego tarjeta resumida con icono de marca.
- Los KPIs evitan tono alarmista cuando el estado general es positivo.
- Licenciamiento muestra uso real `usados / limite` y porcentaje.
- Amenazas prioriza dispositivos infectados activos sobre amenazas ya contenidas.
- Bases de datos AV prioriza la mayoria al dia.
- Vulnerabilidades resalta equipos sin vulnerabilidades y deja criticidad como contexto.

### Inventario KSC

- Se agrego panel visual debajo de las tarjetas principales.
- KPIs por total de dispositivos, Windows Server, Windows 10, Windows 11 y maquinas virtuales.
- Graficos animados para distribucion, frescura de visibilidad y ultima visibilidad.
- Grafico central alterna manualmente entre:
  - Curva de frescura.
  - Tipos de dispositivos.
- El modo automatico rota el grafico central cada 10 minutos.
- Las animaciones se refrescan cada 5 minutos para mantener la pantalla viva.

### Layout editable

- El usuario puede mover paneles y cambiar su ancho.
- Opciones de ancho: `1/3`, `1/2`, `2/3`, `Full`.
- El orden personalizado se guarda en `localStorage`.
- Existe boton para restaurar el layout por defecto.

### Notificaciones inteligentes

- Popup flotante con `SkylabBot` animado.
- Aparece al cargar datos y luego cada 5 minutos.
- Permanece visible 30 segundos y desaparece con transicion suave.
- Incluye sonido generado con Web Audio API.
- Recomendaciones basadas en:
  - Pings caidos o datos stale.
  - Servicios KSC/ZK detenidos.
  - Espacio bajo en disco.
  - Estado de BabyWare.
  - Estado Kaspersky.
  - Licenciamiento KSC.
  - Frescura del inventario KSC.

## Archivos principales

| Archivo | Responsabilidad |
| --- | --- |
| `CRM_Frontend/src/pages/Monitoring.jsx` | Dashboard principal, tarjetas, graficos, layout editable y notificaciones |
| `CRM_Frontend/src/pages/MonitoringDashboard.jsx` | Detalles Monitoreo e historial |
| `CRM_Frontend/src/services/monitoring.service.js` | Cliente HTTP para datos, historial y reportes HTML |
| `src/controllers/monitoring.controller.js` | Recepcion, almacenamiento y entrega de reportes |
| `src/services/ping.service.js` | Heartbeat ICMP/TCP y emision Socket.IO |
| `CRM_Frontend/Monitoreo/` | Scripts PowerShell y tareas programadas |

## Documentos relacionados

- [Arquitectura y flujo de datos](./arquitectura-y-flujo.md)
- [Scripts y tareas programadas](./scripts-y-tareas.md)
- [Operacion y troubleshooting](./operacion-y-troubleshooting.md)

