# TASKS 0016 — Sincronización Trello → Excel de mantenimiento CCTV

Referencia: `spec.md` y `plan.md` en esta misma carpeta.
Marcar `[x]` al completar. Mantener actualizado durante toda la tarea.

## Implementación

- [x] `cctv-automation-final/platform/excel-maintenance-sync.js`
- [x] `cctv-automation-final/platform/excel-lock-status.js`
- [x] `cctv-automation-final/platform/import-trello-maintenance.js`: enganche no crítico
- [x] `cctv-automation-final/api/server.js`: `excel-status` + `excel-history`
- [x] `cctv-automation-final/package.json`: `jszip` como dependencia directa
- [x] `CRM_Frontend/src/pages/CctvModule.jsx`: panel de ruta + copiar + estado de bloqueo
- [x] `docs/operacion/montaje-cifs-excel-mantenimiento.md`: runbook para `.65`
- [x] `platform/schema.sql`: `audit_log` movida aquí (antes solo existía vía un script de
      migración de una sola corrida — una base fresca nunca la tenía)

## Verificación

- [x] `cd cctv-automation-final && npm test` — 111/111 (12 nuevos)
- [x] Prueba con `.xlsx` de ejemplo generado en el propio test (misma forma de hoja "Total")
- [x] `cd CRM_Frontend && npm run lint && npm run build` — sin errores nuevos (diff puramente
      aditivo, verificado contra `origin/main`)
- [x] Docker local real: `cctv-api` sano tras el rebuild, `GET .../excel-status` responde
      `{"configured":false}` con `MAINTENANCE_EXCEL_PATH` vacío, `GET .../maintenance` sigue en
      200, y `node platform/import-trello-maintenance.js` corrió con datos reales de Trello
      (263 ítems, 193 completados) sin errores nuevos
- [ ] Runbook CIFS entregado al usuario (documento listo, pendiente que lo ejecute en `.65`)

## Documentación (Definition of Done)

- [x] `CHANGELOG.md` — sección "No publicado"
- [x] Ficha de módulo (`docs/modulos/`)
- [x] ADR — no aplica (decisión de reconstruir dentro de `cctv-automation-final` documentada en
      `spec.md`, sin cambio de stack/arquitectura base)
- [x] Lección aprendida (`LL-0005-dos-integraciones-trello-desconectadas.md`)

## Cierre

- [ ] PR abierto y enlazado en `spec.md`
- [ ] CI verde
- [ ] Merge a `main`
- [ ] Runbook CIFS ejecutado en `.65` por el usuario
- [ ] Desplegado y verificado en `.65`
