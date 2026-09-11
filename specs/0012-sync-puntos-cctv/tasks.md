# TASKS 0012 — Sync Operación de Puntos ↔ CCTV

Referencia: `spec.md`, `plan.md`. Estado: **Validada — en implementación.**

## Decisiones confirmadas (2026-09-11)

- Dirección: **ambas** — CCTV → Puntos (`has_cctv`/`has_alarm` reales) y Puntos → CCTV
  (horario real por punto en `lateBy`).
- Mecanismo: **job programado** dentro de `run-operational-cycle.js` (no botón manual, no
  script puntual sin automatizar).
- Conflictos: **el dato real siempre gana** — se sobrescribe aunque haya sido editado a mano.
- Credencial: **se reutiliza `SUPABASE_SERVICE_ROLE_KEY` de `ChatBotSoporte`** (mismo proyecto
  Supabase). Decisión explícita del usuario, prioriza rapidez sobre aislar el blast radius.

## Tanda 1 — Matching y cómputo puros + reporte

- [ ] `platform/crm-points-sync.js`: `matchCrmPoints`, `computeCapabilities`,
      `diffCapabilities`, `buildScheduleCache`.
- [ ] `tests/crm-points-sync.test.js`.
- [ ] `scripts/sync-crm-points.js --dry-run`.
- [ ] Correr contra datos reales, anotar cuántas filas cambiarían.

## Tanda 2 — Escritura real a Supabase

- [ ] `.env`/`.env.example`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] `sync-crm-points.js` real (PATCH por lote + `audit_log` local).
- [ ] `crm_point_schedules` en `schema.sql` + población.
- [ ] `reports/crm-points-sync-latest.{json,md}`.
- [ ] Run real en local + verificación de idempotencia (segundo run = 0 cambios).

## Tanda 3 — Horario real en la interpretación

- [ ] `interpretPointDay` acepta `point.customSchedule`; ajusta `lateBy` de
      `APERTURA_MANANA`/`CIERRE_NOCHE`. Tests.
- [ ] `dailyEventsData` carga `crm_point_schedules` y lo pasa por punto.
- [ ] Verificar con un punto real de horario custom.

## Tanda 4 — Ciclo operativo

- [ ] Paso `crmPointsSync` en `run-operational-cycle.js`, no crítico,
      `CRM_POINTS_SYNC_INTERVAL_MINUTES` (default 1440).
- [ ] Verificar en `operational-cycle.jsonl`.

## Verificación

- [ ] `npm test` verde (anotar número en el PR).
- [ ] Docker local: dry-run → run real → Supabase verificado → `crm_point_schedules` verificado.
- [ ] `.65`: `.env` configurado a mano (no versionado) → migración → rebuild `cctv-api` +
      `cctv-operational-worker` → dry-run → run real → verificación.

## Documentación (DoD)

- [ ] `CHANGELOG.md`.
- [ ] `cctv-automation-final/docs/` nota del paso nuevo.
- [ ] `.env.example`.
- [ ] `specs/README.md` fila 0012.
- [ ] LL si aparece tropiezo (candidato: primera escritura real a Supabase desde este servicio).

## Cierre

- [ ] PR `feat/0012` → `main` enlazando la spec (`npm test` N/N; sin CI). Merge. Deploy a `.65`
      con configuración manual de `.env` + verificación.
