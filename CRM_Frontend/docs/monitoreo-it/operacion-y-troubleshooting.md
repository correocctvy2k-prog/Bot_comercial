# Monitoreo IT - Operacion y troubleshooting

## Despliegue de cambios frontend

En el VPS:

```bash
git pull origin main
sudo docker compose up -d --build crm-frontend
```

Si tambien cambiaron servicios del backend:

```bash
sudo docker compose up -d --build comercial-bot
```

## Verificaciones rapidas

### Backend activo

```bash
curl http://localhost:3001/api/monitoring/check
```

Respuesta esperada:

```json
{
  "status": "active",
  "module": "monitoring"
}
```

### Ultimo reporte de un servicio

```bash
curl http://localhost:3001/api/monitoring/latest/KSC
curl http://localhost:3001/api/monitoring/latest/SERV-ZK
curl http://localhost:3001/api/monitoring/latest/KSC-HARDWARE
```

### Heartbeat en navegador

En DevTools, buscar:

```text
[HEARTBEAT] Datos de ping recibidos
```

Debe incluir claves como:

- `ANFIGANE`
- `ANFI-SEG`
- `KSC`
- `SERV-KSC`
- `PROXMOX-ZK`
- `SERV-ZK`
- `BABYWARE`

## Problemas comunes

### La tarjeta no muestra datos

Posibles causas:

- El script PowerShell no ha ejecutado.
- El script envio otro `service` distinto al esperado.
- El backend no puede escribir en `data/monitoring`.
- El frontend apunta a otro backend por `VITE_MONITORING_BACKEND_URL`.

Revision:

```bash
ls data/monitoring
cat data/monitoring/ksc/latest.json
```

### El LED no cambia a verde

Importante:

- El LED depende del heartbeat del VPS, no del `.ps1`.
- Si hay JSON reciente pero no hay heartbeat, la tarjeta puede tener datos y aun asi no mostrar ping fresco.

Revision:

- Confirmar que `ping.service.js` este corriendo.
- Revisar logs del backend.
- Confirmar conectividad desde el VPS hacia la red local.
- Confirmar que el nodo permita ICMP.
- Para BabyWare, confirmar que el puerto TCP/16001 este abierto.

### El sonido de notificacion no se escucha

Posibles causas:

- El navegador bloqueo audio hasta que exista una interaccion del usuario.
- El volumen del sistema esta bajo.
- La pestana esta silenciada.

Solucion:

- Hacer click una vez en la pagina despues de cargar el dashboard.
- Revisar volumen del sistema o de la pestana.

### La notificacion aparece con una recomendacion no esperada

El popup prioriza la condicion mas critica:

1. Ping caido.
2. Servicios criticos con falla.
3. Estado ZK/KSC critico.
4. Disco bajo.
5. Licenciamiento o frescura KSC.
6. Recomendaciones positivas.

Si una recomendacion parece incorrecta, revisar primero el dato fuente en `latest.json` y luego el heartbeat.

### La distribucion del layout no se guarda

El layout editable se guarda en `localStorage` del navegador.

Clave:

```text
skylab.monitoring.dashboardLayout.v1
```

Si se borra cache/localStorage, el dashboard vuelve al orden por defecto.

## Checklist operativo diario

- Verificar que todos los LEDs principales esten verdes.
- Confirmar que SERV-KSC y SERV-ZK tengan datos recientes.
- Revisar notificaciones inteligentes cuando aparezcan.
- Validar BabyWare TCP/16001 si hay alerta de alarmas.
- Revisar KSC si hay equipos infectados, licenciamiento alto o endpoints antiguos.
- Abrir `Detalles Monitoreo` solo cuando se necesite revisar historicos o reportes HTML.

## Checklist para agregar un nuevo servidor

1. Crear script PowerShell en `CRM_Frontend/Monitoreo/{Modulo}`.
2. Definir `ServiceName` estable.
3. Enviar datos a `POST /api/monitoring/upload`.
4. Agregar el servicio a `Monitoring.jsx` con `getLatestStatus`.
5. Agregar ping/puerto en `src/services/ping.service.js`.
6. Crear tarjeta o panel visual.
7. Definir reglas de notificacion si aplica.
8. Documentar el nuevo servidor en esta carpeta.

