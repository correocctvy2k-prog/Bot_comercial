# TASKS 0012 — Sync Operación de Puntos ↔ CCTV

Referencia: `spec.md`, `plan.md`. Estado: **Implementada en local, pendiente deploy a `.65`.**

## Decisiones confirmadas (2026-09-11)

- Dirección: **ambas** — CCTV → Puntos (`has_cctv`/`has_alarm` reales) y Puntos → CCTV
  (horario real por punto en `lateBy`).
- Mecanismo: **job programado** dentro de `run-operational-cycle.js`.
- Conflictos: **el dato real siempre gana** — se sobrescribe aunque haya sido editado a mano.
  Confirmado explícitamente tras ver el dry-run: 62 de los cambios de `has_cctv` son
  `true→false` (punto con cámara que no ha notificado en 30 días).
- Credencial: **se reutiliza `SUPABASE_SERVICE_ROLE_KEY` de `ChatBotSoporte`** (mismo proyecto
  Supabase, ya en `cctv-automation-final/.env` local, no versionado).

## Tanda 1 — Matching y cómputo puros + reporte ✅

- [x] `platform/crm-points-sync.js`: `matchCrmPoints`, `computeCapabilities`,
      `diffCapabilities`, `buildScheduleCache`. `platform/alarm-coverage.js`: `alarmLocationIds`.
- [x] `tests/crm-points-sync.test.js` (10 casos).
- [x] `scripts/sync-crm-points.js --dry-run`.
- [x] Corrido contra datos reales: `crmPoints:375, autoLinkable:358, capabilityUpdates:75,
      scheduleRows:7`.

## Tanda 2 — Escritura real a Supabase ✅

- [x] `.env`/`.env.example`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
      `CRM_POINTS_SYNC_INTERVAL_MINUTES`.
- [x] `sync-crm-points.js` real (PATCH por lote + `audit_log` local).
- [x] `crm_point_schedules` en `schema.sql` (idempotente) + población.
- [x] `reports/crm-points-sync-latest.json`.
- [x] Run real: **75 correcciones aplicadas, 0 errores** (62 `has_cctv` true→false, 7
      false→true, 6 solo `has_alarm`, 13 ambos). Segundo run (`--dry-run`) confirma
      `capabilityUpdates:0` — idempotente.

## Tanda 3 — Horario real en la interpretación ✅

- [x] `interpretPointDay` acepta `point.customSchedule`; ajusta `lateBy` de
      `APERTURA_MANANA`/`CIERRE_NOCHE`. 3 tests nuevos.
- [x] `dailyEventsData` carga `crm_point_schedules` → `customScheduleByLoc` → se pasa por punto.
- [x] Verificado por test (no por punto real del día — ningún punto con horario custom tuvo
      apertura/cierre el día de la verificación; queda para el smoke visual en `.65`).

## Tanda 4 — Ciclo operativo ✅

- [x] Paso `crmPointsSync` en `run-operational-cycle.js`, no crítico,
      `CRM_POINTS_SYNC_INTERVAL_MINUTES` (default 1440).
- [ ] Verificar en `operational-cycle.jsonl` en un ciclo real (worker corriendo).

## Verificación

- [x] `npm test` → **89/89**.
- [x] Local: dry-run → run real (75 escrituras, 0 errores) → Supabase verificado (segundo
      dry-run en 0) → `crm_point_schedules` verificado (7 filas, `audit_log` 75 entradas).
- [ ] `.65`: `.env` configurado a mano (no versionado) → migración → rebuild `cctv-api` +
      `cctv-operational-worker` → dry-run → run real → verificación.

## Documentación (DoD)

- [x] `CHANGELOG.md`.
- [ ] `cctv-automation-final/docs/` nota del paso nuevo (pendiente, candidato: sección en
      `MODULO-ALARMAS-Y-CIERRE-PING.md` o doc nueva de sincronización).
- [x] `.env.example`.
- [x] `specs/README.md` fila 0012.
- [ ] LL si aparece tropiezo (candidato: primera escritura real a Supabase desde este
      servicio — de momento sin incidente).

## Cierre

- [ ] PR `feat/0012` → `main` enlazando la spec (`npm test` 89/89; sin CI). Merge. Deploy a
      `.65` con configuración manual de `.env` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
      — copiar de `ChatBotSoporte/.env` en el servidor) + verificación.
