# Modelo canónico de mantenimiento CCTV

Fecha de implementación: 2026-08-22.

## Objetivo

Separar la operación de CCTV de la caché interna del proyecto Table Trello. La API de CCTV ya no consulta esa base durante cada petición: consume una instantánea propia, idempotente y auditable. La importación es de solo lectura para Trello y no modifica el Excel anual.

## Flujo

1. `npm run import:trello-maintenance` abre la caché Trello en modo de solo lectura.
2. Selecciona exactamente la lista `Mantenimiento CCTV 2026`.
3. Normaliza cada check item y usa `TRELLO + source_item_id` como clave externa única.
4. Vincula por código SIIS exacto o aplica una decisión manual previamente auditada.
5. Actualiza `maintenance_work_items` mediante UPSERT y registra el resultado en `maintenance_source_runs`.
6. `GET /api/cctv/maintenance` entrega exclusivamente la última instantánea canónica activa.

El orquestador `npm run cycle:operational` evalúa la antigüedad de la última
importación exitosa y ejecuta la actualización cuando supera
`MAINTENANCE_SYNC_INTERVAL_MINUTES` (1 minuto por defecto). Correo CCTV y SIIS
mantienen una cadencia independiente de cinco minutos. Esta fuente es
complementaria: si falla, el correo y SIIS continúan y el ciclo queda registrado
como `SUCCESS_WITH_WARNINGS`.

## Tablas

- `maintenance_source_runs`: historial y métricas de cada importación.
- `maintenance_work_items`: instantánea normalizada de las actividades.
- `maintenance_identity_overrides`: decisiones manuales persistentes.
- `audit_log`: evidencia de cada conciliación realizada desde Skylab.

## Conciliación

Los ítems `CODE_NOT_FOUND` o `MISSING_CODE` muestran la acción **Conciliar con Operación de Puntos**. El usuario busca el punto canónico y confirma la relación mediante `POST /api/cctv/maintenance/:sourceItemId/link`. La decisión tiene prioridad en las importaciones posteriores.

## Garantías verificadas

- Primera importación: 263 insertados.
- Segunda importación con la misma fuente: 0 insertados, 0 actualizados y 263 sin cambios.
- Estado al corte: 168 realizados, 95 pendientes, 246 vinculados y 17 por conciliar.
- La compilación de producción y el lint específico de `CctvModule.jsx` terminan correctamente.

## Evolución prevista

La capa canónica permite reemplazar la caché por la API/webhook oficial de Trello sin cambiar el contrato del frontend. Una sincronización bidireccional deberá incorporar control de versiones, cola de reintentos, usuario responsable y política explícita de conflictos antes de habilitar escrituras hacia Trello.

## Reglas de eventos diarios

Los horarios editables pertenecen a Supabase: `zone_schedules` define el
horario por zona y `puntos_venta` conserva las excepciones por punto. La
tolerancia se toma de `zone_schedules.tolerance_minutes`, con 15 minutos como
valor predeterminado.

Para cada punto y día, el estado inicial es `NO_ENTRY`. El primer ping SIIS en
línea es la evidencia principal de llegada; cualquiera de los nodos de un
punto doble puede confirmarla. Las detecciones CCTV se conservan como
corroboración y evidencia visual.

El cierre de almuerzo solo se registra con una detección CCTV de cierre. El
último ping representa última actividad y no crea por sí mismo un cierre de
almuerzo. Las señales tempranas, tardías o fuera de horario generan alertas de
revisión; nunca modifican automáticamente los horarios.
