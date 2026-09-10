# Alarmas y cierre operativo por ping

Fecha de implementación: 2026-08-27. **Ampliado 2026-09-10 (spec 0010): "Eventos diarios"
interpreta la jornada por 4 ventanas con el ping como vector primario.**

## Eventos diarios: 4 ventanas + ping (spec 0010)

- **El ping SIIS es el vector primario.** No todos los puntos tienen CCTV que notifique por
  detección; todos tienen ping. El evento CCTV es **apoyo / prueba visual**.
- Jornada partida, 4 ventanas (hora local Bogotá, configurables por env):
  `CCTV_WIN_OPEN_AM=05:00-09:30`, `CCTV_WIN_CLOSE_MIDDAY=13:00-14:00`,
  `CCTV_WIN_OPEN_PM=15:00-17:00`, `CCTV_WIN_CLOSE_PM=18:00-22:00`.
  `CCTV_WIN_GRACE_MIN=150` (apertura tardía / cierre temprano); `CCTV_PING_EVENT_TOLERANCE_MIN=20`.
- Por punto y día, `platform/operational-event-policy.js` → `interpretPointDay`:
  - Fase resuelta por: **transición de ping** (offline↔online) → **evidencia CCTV** → **presencia
    de ping** ("el monitoreo estaba activo").
  - `notificationConfigInconsistency` (solo puntos `WITH_CCTV`): el ping indica operación en la
    ventana pero el CCTV no notificó, o el aviso llegó > tolerancia respecto al ping. Un punto
    `PING_ONLY` **nunca** es anomalía por falta de detección.
  - Detección fuera de toda gracia → `anomalies[]` (aquí caen los "cierres a las 7am").
  - `interpretation`: `NORMAL` / `CIERRE_SIN_APERTURA` / `SIN_ACTIVIDAD`; `lateBy` en minutos.
- `GET /api/cctv/events/daily` gana `operationalDays[]`, `operationalWindows`,
  `notificationInconsistencies[]` y `summary.{notificationInconsistencies, outOfWindowDetections,
  cierreSinApertura, pointsWithOpening}`. `hourly.openings/closures` se cuentan por **fase
  interpretada**, no por `event_type` crudo.

## Cierre observado

- La llegada observada continúa tomando la primera señal válida entre CCTV y SIIS.
- La salida observada puede tomar el último ping SIIS solamente cuando ocurre dentro de la tolerancia previa al cierre esperado del punto.
- Un ping diurno no se interpreta como cierre.
- La interfaz conserva la fuente (`CCTV`, `Último ping SIIS` o ambas) para no presentar una señal técnica como evidencia visual.

## Taxonomía de alarmas

- `OSZFORD_MONITORED`: central independiente registrada en la hoja **Alarmas OSZFORD** y monitoreada externamente.
- `DAHUA_DEDICATED`: controlador de alarma Dahua dedicado, actualmente identificado por activos `ALARM_CONTROLLER`.
- `DAHUA_DEVICE_IO`: PIR o dispositivos conectados a entradas/salidas de alarma de un NVR o cámara Dahua.

Las categorías no son excluyentes. Un punto puede aparecer como protección híbrida cuando tiene más de una capa.

## Calidad y conciliación

El importador de la hoja OSZFORD se corrigió para ignorar la columna de consecutivo y leer desde la columna **OFICINA**. El último corte contiene 17 centrales. Las referencias cuyo nombre no permite una coincidencia canónica segura se muestran como pendientes y no se vinculan automáticamente.

## API y frontend

- `GET /api/cctv/alarms`: resumen, puntos clasificados, sistemas por punto y referencias pendientes.
- `POST /api/cctv/alarms/:locationId/communication-profile`: registra una verificación manual y auditable de BabyWare.
- Nueva pestaña **Alarmas** en Seguridad Electrónica, con filtros por capa, protección híbrida, fuente, estado reportado y último evento.

### Perfil de comunicación BabyWare

El perfil conserva abonado, modelo, IP local, canal de reporte, dirección/puerto/estado de los receptores principal, secundario y de respaldo, política ante fallos, fecha, fuente, responsable y observaciones. No admite ni solicita contraseñas, códigos maestros o códigos de instalador. La interfaz enmascara las direcciones de los receptores fuera del formulario administrativo y calcula el estado `OPERATIONAL`, `DEGRADED`, `CRITICAL` o `NOT_DOCUMENTED`.
