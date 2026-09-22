# TASKS 0014 — Sincronización directa SIISS → Operación de Puntos

Referencia: `spec.md` y `plan.md` en esta misma carpeta.
Marcar `[x]` al completar. Mantener actualizado durante toda la tarea.

## Implementación

- [x] `cctv-automation-final/platform/siis-points-sync.js`: `diffSiissStatus()` (puro) + `syncSiissPoints()` (I/O)
- [x] `cctv-automation-final/tests/siis-points-sync.test.js`
- [x] `cctv-automation-final/scripts/sync-siiss-points.js` (CLI, `--dry-run`)
- [x] Ruta `POST /api/cctv/siiss/sync-points` en `cctv-automation-final/api/server.js`
- [x] `CRM_Frontend/src/pages/Points.jsx`: botón apunta a `VITE_CCTV_API_BASE` + ruta nueva (vía `pointsService.syncSiiss()`)

## Verificación

- [x] `cd cctv-automation-final && npm test` — 96/96 (7 nuevos)
- [x] `cd CRM_Frontend && npm run lint` — `Points.jsx` y `points.service.js` sin errores nuevos (2 errores preexistentes sin relación en `points.service.js:264,328`, deuda ya documentada)
- [x] `cd CRM_Frontend && npm run build` — verde
- [x] Docker local (`cctv-api` reconstruido + `crm-frontend` ya corriendo sin tocar): ruta real probada vía `curl` contra `http://127.0.0.1:3003/api/cctv/siiss/sync-points`
- [x] Smoke test con datos reales: `{"ok":true,"stations":366,"crmPoints":358,"matched":351,"updated":351,"errors":[]}` (~64s, ver riesgo en `spec.md` §7)

## Documentación (Definition of Done)

- [x] `CHANGELOG.md` — sección "No publicado"
- [x] Ficha de módulo en `docs/modulos/crm-frontend.md`
- [x] ADR en `docs/adr/` — no aplica (no hay decisión de arquitectura nueva, se reutiliza el
      cliente SIIS y el patrón de I/O ya establecidos por ADR-001 y spec 0012)
- [x] Lección aprendida — no aplica (la única fricción no obvia, latencia de ~64s por PATCH
      secuenciales, ya estaba anticipada y documentada en `spec.md` §7 antes de correr el smoke test)

## Cierre

- [ ] PR abierto y enlazado en `spec.md`
- [ ] CI verde
- [ ] Merge a `main`
- [ ] Desplegado y verificado en `http://192.168.8.65:3003/`
