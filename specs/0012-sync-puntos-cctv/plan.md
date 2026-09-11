# PLAN 0012 — Sync Operación de Puntos ↔ CCTV

Referencia: `spec.md`. Tandas, PR único.

## Investigación ya hecha (no repetir)

- `reconcile-crm-points.mjs` re-ejecutado hoy: `siisExact:356/357`, `unmatchedCrm:14`,
  `crmWithoutCctvFlag:271`. Reporte en `reports/crm-points-reconciliation-latest.{json,md}`.
- `alarmsData()` en `api/server.js` (línea ~246) ya clasifica alarmas por ubicación canónica.
- `puntos_venta` columnas relevantes: `id, siiss_id, alias, name, segment, has_cctv, has_alarm,
  custom_open_time, custom_close_time, has_custom_schedule, is_permanently_closed, is_double`.
- Credencial: `ChatBotSoporte/.env` → `SUPABASE_SERVICE_ROLE_KEY` (mismo proyecto que
  `VITE_SUPABASE_URL` de CRM_Frontend: `fxlbqlzsbrgnkpcduzxt`).

## Tanda 1 — Matching y cómputo puros + reporte (sin escribir aún)

1. `platform/crm-points-sync.js`: extraer `matchCrmPoints` de `reconcile-crm-points.mjs`
   (misma firma/comportamiento, con tests). Añadir `computeCapabilities`, `diffCapabilities`,
   `buildScheduleCache`.
2. `tests/crm-points-sync.test.js`: casos de match (SIIS exacto, alias, ambiguo, sin match,
   doble compartido), cómputo de capacidades, diff (solo cuando cambia), schedule cache.
3. `scripts/sync-crm-points.js --dry-run`: usa las funciones de arriba contra datos reales
   (lectura con la key que ya exista — anon sirve para leer `puntos_venta`), imprime el mismo
   resumen que `reconcile-crm-points.mjs` + cuántos `has_cctv`/`has_alarm` cambiarían.
4. Verificar contra datos reales: cuántas filas cambiarían de verdad (para que el usuario vea
   el tamaño del cambio antes de la Tanda 2).

## Tanda 2 — Escritura real a Supabase

1. `.env` + `.env.example`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
2. `sync-crm-points.js` (sin `--dry-run`): `PATCH` por lote de las filas que difieren; cada
   escritura → `audit_log` local (`entity_type='CRM_POINT_CAPABILITY'`).
3. `crm_point_schedules` en `platform/schema.sql` (`CREATE TABLE IF NOT EXISTS`, idempotente) +
   `INSERT OR REPLACE` desde `buildScheduleCache`.
4. `reports/crm-points-sync-latest.{json,md}` (no reemplaza `crm-points-reconciliation-latest`,
   es un reporte nuevo centrado en qué se escribió).
5. Correr en local contra Supabase real (con cuidado — escribe datos reales); verificar
   idempotencia con un segundo run.

## Tanda 3 — Horario real en la interpretación

1. `operational-event-policy.js` `interpretPointDay`: acepta `point.customSchedule`; ajusta
   `lateBy` de `APERTURA_MANANA`/`CIERRE_NOCHE` cuando existe. Tests nuevos.
2. `api/server.js` `dailyEventsData`: carga `crm_point_schedules` → `customScheduleByLoc` →
   se pasa por punto a `interpretDailyOperations`.
3. Verificar con un punto real que tenga `has_custom_schedule=true` que `lateBy` cambia.

## Tanda 4 — Ciclo operativo

1. `run-operational-cycle.js`: paso `crmPointsSync` gateado por
   `operationalSourceDue('crmPointsSync', CRM_POINTS_SYNC_INTERVAL_MINUTES||1440)`. No crítico.
2. Verificar en `operational-cycle.jsonl` que aparece y respeta el intervalo.

## Verificación

- [ ] `npm test` verde (número exacto en el PR).
- [ ] Docker local: dry-run primero, luego run real, verificar Supabase (`has_cctv`/`has_alarm`
      de un punto conocido) y `crm_point_schedules`.
- [ ] `.65`: configurar `.env` (a mano, no versionado) → migración → rebuild `cctv-api` +
      `cctv-operational-worker` → dry-run → run real → verificación.

## Documentación (DoD)

- [ ] `CHANGELOG.md` sección CCTV.
- [ ] `cctv-automation-final/docs/` — nota sobre el nuevo paso del ciclo operativo y
      `crm_point_schedules`.
- [ ] `.env.example` con las 2 vars nuevas (sin valores).
- [ ] `specs/README.md` fila 0012.
- [ ] LL si aparece un tropiezo (candidato: primera escritura real a Supabase desde este
      servicio — verificar dos veces antes del primer run sin `--dry-run`).
