# Modulo - Monitoreo IT

## Proposito

Dashboard de infraestructura dentro del CRM. Muestra salud de servidores, anfitriones, VMs, servicios, pings, inventario Kaspersky y recomendaciones inteligentes.

## Entrada profunda

Leer primero:

- [Documentacion principal de Monitoreo IT](../../CRM_Frontend/docs/monitoreo-it/README.md)

Luego, segun el trabajo:

- [Arquitectura y flujo de datos](../../CRM_Frontend/docs/monitoreo-it/arquitectura-y-flujo.md)
- [Scripts y tareas programadas](../../CRM_Frontend/docs/monitoreo-it/scripts-y-tareas.md)
- [Operacion y troubleshooting](../../CRM_Frontend/docs/monitoreo-it/operacion-y-troubleshooting.md)

## Ubicacion

```text
CRM_Frontend/src/pages/Monitoring.jsx
CRM_Frontend/src/pages/MonitoringDashboard.jsx
CRM_Frontend/src/services/monitoring.service.js
CRM_Frontend/Monitoreo/
src/controllers/monitoring.controller.js
src/services/ping.service.js
```

## Responsabilidades

- `Monitoring.jsx`: dashboard principal, tarjetas, graficos, layout editable y notificaciones.
- `MonitoringDashboard.jsx`: historial y reportes.
- `monitoring.service.js`: cliente HTTP para latest, history y HTML.
- `monitoring.controller.js`: almacenamiento y entrega de reportes.
- `ping.service.js`: heartbeat ICMP/TCP desde VPS.
- `CRM_Frontend/Monitoreo/`: scripts PowerShell de recoleccion.

## Antes de modificar

- Leer la documentacion profunda del modulo.
- Identificar si el cambio corresponde a frontend, backend heartbeat o script PowerShell.
- Recordar que los LEDs dependen del heartbeat del VPS, no de los `.ps1`.
- No mostrar IPs en la vista principal salvo que el usuario lo solicite.
- Mantener la jerarquia host -> VM.

## Verificacion minima

Frontend:

```bash
cd CRM_Frontend
npm run build
```

Backend:

```bash
curl http://localhost:3001/api/monitoring/check
```

VPS:

```bash
git pull origin main
sudo docker compose up -d --build crm-frontend
```

