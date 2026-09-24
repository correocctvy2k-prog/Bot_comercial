# PLAN 0016 — Sincronización Trello → Excel de mantenimiento CCTV

Referencia: `spec.md` en esta misma carpeta.

## Enfoque técnico

Puerto funcional (no clase, sin acoplar a la SQLite de `Table Trello`) de la lógica ya probada
en `CRM_Frontend/Table Trello/backend/src/services/excel.service.js`. Se engancha directamente
en el diff que `import-trello-maintenance.js` (spec 0008) ya calcula por ítem
(`before.status !== item.status`), en vez de depender de un webhook de Trello (que nunca se
confirmó activo en el sistema viejo). Como ese import ya corre cada ~1 minuto y alimenta la UI
real, la sincronización a Excel queda "gratis" en el mismo ciclo, con el mismo retraso máximo
que ya tiene la UI hoy.

Mejora real sobre el sistema viejo: el ítem de Trello ya trae `item.locationId` resuelto (por
`siis_code`, spec 0008) cuando existe, así que se le pasa a `findPoint` el nombre/zona
**canónicos** de `locations` en vez del nombre crudo de la tarjeta de Trello — reduce la
ambigüedad del matching difuso.

## Archivos a tocar

| Archivo | Cambio | Riesgo |
|---------|--------|--------|
| `cctv-automation-final/platform/excel-maintenance-sync.js` | Nuevo. Puerto de `excel.service.js`: `loadWorkbook`, `findPoint`, `marcarMantenimiento`, `getResumen`, etc. | medio — lógica compleja (XML/JSZip), mitigado con tests |
| `cctv-automation-final/platform/excel-lock-status.js` | Nuevo. Detecta `~$<nombre>.xlsx`, intenta extraer el usuario | bajo |
| `cctv-automation-final/tests/excel-maintenance-sync.test.js` | Nuevo | bajo |
| `cctv-automation-final/tests/excel-lock-status.test.js` | Nuevo | bajo |
| `cctv-automation-final/platform/import-trello-maintenance.js` | Engancha `marcarMantenimiento` cuando cambia el estado de un ítem con `location_id` resuelto; no crítico | bajo — try/catch propio, no interrumpe el ciclo |
| `cctv-automation-final/api/server.js` | Nuevas rutas `GET /api/cctv/maintenance/excel-status`, `GET /api/cctv/maintenance/excel-history` | bajo |
| `cctv-automation-final/package.json` | Declara `jszip` como dependencia directa (hoy solo transitiva vía `exceljs`) | bajo |
| `CRM_Frontend/src/pages/CctvModule.jsx` | Panel nuevo en pestaña Mantenimiento: ruta + copiar + estado de bloqueo | bajo |
| `docs/operacion/montaje-cifs-excel-mantenimiento.md` | Nuevo runbook para `.65` | — |

## Contratos de datos / API

**`GET /api/cctv/maintenance/excel-status`**
```json
{
  "configured": true,
  "path": "\\\\ganepalmir\\dpto.informatica\\...\\2026 programacion anual CCTV.xlsx",
  "accessible": true,
  "locked": false,
  "lockedBy": null,
  "lastSyncAt": "2026-09-23T20:10:00.000Z",
  "lastSyncStatus": "SUCCESS"
}
```
Si `MAINTENANCE_EXCEL_PATH` no está configurada: `{"configured": false}` (sin más campos).

**`marcarMantenimiento({ filePath, nombrePunto, zona, fecha, valor })`** — misma forma que el
original: `{ punto, zona, periodo, celda, valor, previousValue }`. Lanza con `statusCode: 423`
si el archivo está bloqueado (mismo contrato de error ya probado).

**Auditoría**: `audit_log` con `entity_type='EXCEL_MAINTENANCE_CELL'`,
`action='SYNCED'|'SYNC_FAILED'`, `source_system='TRELLO_TO_EXCEL'`.

## Diseño / UI

Panel nuevo en la pestaña Mantenimiento de `CctvModule.jsx`, superficie estándar
(`bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl`), con:
- Ruta de red en `font-mono text-xs` + botón "Copiar ruta" (`navigator.clipboard`).
- Badge de estado: verde "Sincronizado" / ámbar "Bloqueado por: {usuario}" / gris "No
  configurado en este entorno".

## Plan de rollout

1. Implementar y probar la lógica pura con `npm test` (sin necesidad del montaje CIFS).
2. Verificar en Docker local: `MAINTENANCE_EXCEL_PATH` sin configurar → todo sigue funcionando
   igual que hoy, sin errores.
3. Entregar el runbook CIFS al usuario para `.65`.
4. Una vez montado en `.65`: configurar `MAINTENANCE_EXCEL_PATH`, verificar con un cambio real
   en Trello que la celda se actualiza.
5. PR + CI + merge + deploy.

## Plan de rollback

Quitar `MAINTENANCE_EXCEL_PATH` del `.env` de `.65` (la sincronización se apaga sola, el resto
del pipeline de Trello sigue igual) o revertir el commit. Sin cambios de esquema.

## Verificación

- `cd cctv-automation-final && npm test`.
- Prueba manual con un `.xlsx` de ejemplo (misma estructura de hoja `"Total"`) fuera de la red
  real, para validar `findPoint`/`marcarMantenimiento`/recálculo de fórmulas sin depender del
  montaje CIFS.
- Docker local con `MAINTENANCE_EXCEL_PATH` vacío: confirmar que `import-trello-maintenance.js`
  sigue corriendo sin errores nuevos.
