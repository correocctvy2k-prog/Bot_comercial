# TASKS 0019 — Fecha de inicio de Trello en Soporte

Referencia: `spec.md` y `plan.md` en esta misma carpeta.

## Implementación

- [x] `import-trello-support.js`: `fields` del fetch de tarjetas pide `start`.
- [x] `schema.sql`: `start_at TEXT` en `CREATE TABLE support_cards`.
- [x] `import-trello-support.js`: migración automática `ALTER TABLE ADD COLUMN
      start_at` para bases existentes (idempotente, corre en cada ejecución).
- [x] `trello-support.js`: `normalizeCards` captura `startAt`; `fingerprint`
      lo incluye para detectar cambios reales.
- [x] `import-trello-support.js`: upsert guarda `start_at`; comparación de
      "unchanged" también lo considera.
- [x] `api/server.js`: `operationalAt = due_at || start_at ||
      source_updated_at`; `dateSource` con 3 valores
      (`TRELLO_DUE`/`TRELLO_START`/`LAST_ACTIVITY`).
- [x] `CctvModule.jsx`: etiqueta "Fuente de fecha" distingue los 3 casos.

## Verificación

- [x] Test nuevo en `trello-support.test.js` (captura de `start` con y sin
      `due`). `cctv-automation-final`: 111/111 en verde.
- [x] Re-proceso real local contra la API de Trello en vivo (backup previo):
      122 tarjetas actualizadas, 16 con `start_at` poblado sin `due`.
- [x] Confirmado el caso real que motivó la spec: "Cementerio Palmira"
      (cámara facial) pasa de `operationalAt` = 1 de octubre (última
      actividad, incorrecto) a 3 de septiembre (`TRELLO_START`, correcto).
- [x] `cd CRM_Frontend && npm run lint`/`build` — 7 errores preexistentes,
      sin cambio; build verde.
- [x] Docker local: `cctv-api`/`crm-frontend` reconstruidos, `GET /api/cctv/
      support` verificado contra el caso real; sin regresión en
      `/api/cybersecurity/towers`, `/api/cctv/health`, `/api/cctv/maintenance`.

## Documentación (Definition of Done)

- [x] `CHANGELOG.md` — sección "No publicado"
- [x] Ficha de módulo —
      `cctv-automation-final/docs/INTEGRACION-TRELLO-SOPORTE-2026.md`
- [ ] Lección aprendida — no se consideró necesaria (hallazgo específico de
      un campo de API no leído, ya documentado en el CHANGELOG/spec con
      suficiente detalle; no es un patrón nuevo de riesgo como LL-0010)

## Cierre

- [ ] PR abierto y enlazado en `spec.md`
- [ ] Merge a `main`
- [ ] Desplegado y verificado en `.65` (incluye re-proceso real de datos allá
      contra la API de Trello en vivo, con backup previo del `.db`)
