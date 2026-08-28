# Alarmas y cierre operativo por ping

Fecha de implementación: 2026-08-27.

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
