# SPEC 0012 — Sincronización Operación de Puntos ↔ Seguridad Electrónica (CCTV)

- **Estado:** Validada (2026-09-11)
- **Autor:** equipo Skylab (@jbeltran)
- **Fecha:** 2026-09-11
- **Módulos afectados:** `cctv-automation-final` (`platform/`, `scripts/`, `api/server.js`,
  `.env`), Supabase (`puntos_venta`, tabla `store_alerts`/`audit_log` no aplica — auditoría
  queda en SQLite), `CRM_Frontend` (sin cambios de código; `/points` lee `has_cctv`/`has_alarm`
  ya existentes).
- **Rama:** `feat/0012-sync-puntos-cctv`
- **Depende de:** spec 0010 (`WITH_CCTV` real, `interpretPointDay`), spec 0011 (tableros/resolución).

## 1. Problema

"Operación de Puntos" (`/points`, tabla Supabase `puntos_venta`) y "Seguridad Electrónica"
(`/points/cctv`, `cctv-automation-final`) describen los mismos puntos físicos pero cada uno con
su propio catálogo, y **no se hablan**:

- `puntos_venta.has_cctv` / `has_alarm` no tienen ningún formulario que los edite en
  `Points.jsx` — se mantienen a mano o quedaron de una carga inicial. Verificado con datos
  reales: **271 de 375 puntos** muestran `has_cctv=false` aunque el catálogo CCTV ya identifica
  a la inmensa mayoría con cobertura real.
- `puntos_venta.custom_open_time`/`custom_close_time` (el horario real por punto) no llega al
  backend de CCTV: `interpretPointDay` (spec 0010) solo usa las 4 ventanas **globales**
  (`CCTV_WIN_*`), por lo que "abrió tarde" se mide contra un umbral genérico, no contra el
  horario real de cada punto.

## 2. Qué ya existe (no se reconstruye)

- **`scripts/reconcile-crm-points.mjs`**: cruza `puntos_venta` (por `siiss_id`) contra
  `locations` (por `siis_code`), con fallback por alias. Re-ejecutado con datos de hoy:
  `crmPoints:375, canonicalLocations:357, siisExact:356, unmatchedCrm:14`. El cruce por SIIS
  está prácticamente resuelto; **falta el paso de escritura**, no el de identidad.
- **`WITH_CCTV` real** (spec 0010, `notifyingLocs` en `dailyEventsData`): el punto envió ≥1
  correo Dahua en 30 días.
- **`alarmsData()`** (`api/server.js`): clasifica alarmas reales por punto (OSZFORD, Dahua
  dedicado, Dahua NVR/E-S) — ya endpoint `/api/cctv/alarms`.

## 3. Objetivo

Un punto sincronizado desde `cctv-automation-final` hacia Supabase (`has_cctv`, `has_alarm`
reales) y desde Supabase hacia `cctv-automation-final` (horario real por punto usado en la
interpretación operativa), corriendo solo como **job programado** dentro del ciclo operativo
existente (`run-operational-cycle.js`), sin intervención manual.

## 4. Alcance

### 4.1 Credenciales

`cctv-automation-final/.env` gana `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — **se reutiliza
la misma service role key que ya usa `ChatBotSoporte`** (mismo proyecto Supabase, decisión del
usuario 2026-09-11: prioriza rapidez sobre aislar el blast radius entre servicios). La key
**nunca** se loguea ni se persiste en `audit_log`/reportes.

### 4.2 `platform/crm-points-sync.js` (nuevo, con tests) — funciones puras reutilizables

- `matchCrmPoints(crmPoints, locations, aliases)`: misma lógica de
  `reconcile-crm-points.mjs` (SIIS exacto → alias → sin match), extraída a función pura.
- `computeCapabilities(locationId, { notifyingLocs, alarmLocationIds })`
  → `{ hasCctv: boolean, hasAlarm: boolean }`.
- `diffCapabilities(matches, computed)` → solo las filas donde el valor de Supabase
  **difiere** del real (real siempre gana, decisión del usuario — sin excepción por edición
  manual previa).
- `buildScheduleCache(matches, crmPoints)` → `[{ locationId, openMin, closeMin,
  hasCustomSchedule }]` para los puntos con `has_custom_schedule=true`.

### 4.3 `scripts/sync-crm-points.js` (nuevo, ejecutable)

1. Lee `puntos_venta` completo vía REST con la service role key (bypassa RLS, no hace falta
   paginar credenciales de anon).
2. Lee `locations`/`location_aliases` de SQLite + `notifyingLocs` (30 días) + `alarmsData()`.
3. `matchCrmPoints` → `diffCapabilities` → **`PATCH` a Supabase** solo las filas que cambian
   (`has_cctv`, `has_alarm`), en lotes; cada escritura deja un `audit_log`
   (`entity_type='CRM_POINT_CAPABILITY'`) en el SQLite local (Supabase no tiene la tabla
   `audit_log` del proyecto CCTV).
4. `buildScheduleCache` → `INSERT OR REPLACE` en la tabla nueva `crm_point_schedules`
   (idempotente, `platform/schema.sql`).
5. Igual que `reconcile-crm-points.mjs`, escribe `reports/crm-points-sync-latest.{json,md}`
   para auditoría visual — **no se pierde el reporte existente**, se le agrega la sección de
   capacidades corregidas.
6. Modo `--dry-run`: calcula y reporta sin escribir (para verificar antes del primer run real).

### 4.4 Cadena del ciclo operativo (`scripts/run-operational-cycle.js`)

Nuevo paso `crmPointsSync`, gateado por `operationalSourceDue('crmPointsSync', intervalMinutes)`
con `CRM_POINTS_SYNC_INTERVAL_MINUTES` (default **1440** = una vez al día; no necesita la
cadencia de 5 min de email/SIIS). No es una fuente "crítica": una falla no cambia el `status`
global a `PARTIAL_FAILURE`, igual que `maintenance`/`support`.

### 4.5 Horario real por punto en la interpretación (`platform/operational-event-policy.js`)

`interpretPointDay(point, cfg)` acepta opcionalmente `point.customSchedule =
{ openMin, closeMin }` (de `crm_point_schedules`, cargado en `dailyEventsData`). Cuando existe:

- **`APERTURA_MANANA`**: si hay fase resuelta, `lateBy` se calcula contra `customSchedule.openMin`
  en vez del fin de la ventana global (`win.endMin`).
- **`CIERRE_NOCHE`**: `lateBy` (cierre temprano) se calcula contra `customSchedule.closeMin`.
- El resto de la lógica (fuente ping/CCTV/presencia, ventanas de asignación con gracia,
  anomalías) **no cambia** — solo se refina el umbral de "a tiempo" para los dos eventos que
  tienen un horario declarado real. `APERTURA_TARDE`/`CIERRE_MEDIODIA` siguen con la ventana
  global (la mayoría de horarios en Supabase son de una sola jornada).

## 5. No-objetivos

- **No** se sincronizan `is_mall`, `has_sportbook`, `is_double`, `asesor_*` ni ningún otro
  campo de `puntos_venta` fuera de `has_cctv`/`has_alarm` (lectura) y `custom_open_time`/
  `custom_close_time`/`has_custom_schedule` (escritura hacia CCTV, no hacia Supabase).
- **No** se construye UI nueva en `/points` ni en CCTV para este cruce; el resultado se ve en
  los flags ya existentes de `Points.jsx` y en `lateBy` de "Eventos diarios".
- **No** se cambian las 4 ventanas globales ni su desactivación de `CIERRE_MEDIODIA` (spec 0010).
- **No** se resuelven los 14 `unmatchedCrm` ni los 3 `aliasExactReview` automáticamente — quedan
  en el reporte para revisión manual, como ya hacía `reconcile-crm-points.mjs`.

## 6. Criterios de aceptación

- [ ] `node scripts/sync-crm-points.js --dry-run` sin credenciales de escritura reporta cuántos
      `has_cctv`/`has_alarm` cambiarían, sin tocar Supabase.
- [ ] Con service role key configurada, un run real corrige los `has_cctv`/`has_alarm` que
      difieren del dato real; un segundo run inmediato reporta 0 cambios (idempotente).
- [ ] `crm_point_schedules` queda poblada para los puntos con `has_custom_schedule=true` en
      Supabase.
- [ ] Un punto con horario real (p. ej. abre 08:00 según `custom_open_time`) que abre a las
      08:15 sale con `lateBy=15`, no con el `lateBy=0` que daría la ventana global (termina a
      las 09:30).
- [ ] El paso `crmPointsSync` aparece en el audit log del ciclo operativo (`operational-cycle.jsonl`)
      y respeta `CRM_POINTS_SYNC_INTERVAL_MINUTES`.
- [ ] `cd cctv-automation-final && npm test` verde con casos nuevos.
- [ ] Verificado en local y en `192.168.8.65` con datos reales.

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| Service role key compartida con ChatBotSoporte: si `cctv-automation-final` se ve comprometido, el radio de impacto incluye lo que toca esa key en todo el proyecto Supabase | Alto | Decisión explícita del usuario (rapidez sobre aislamiento); la key vive solo en `.env` (no versionado), nunca se loguea; `--dry-run` obligatorio en el primer run de cada ambiente |
| Escribir `has_cctv=false` de vuelta a un punto que en realidad sí tiene cámara pero no ha enviado correo Dahua en 30 días (mantenimiento, cámara caída) | Medio | Es el mismo criterio `WITH_CCTV` ya validado en spec 0010/0011 (con su propia opción de resolución `MISCONFIGURED_NO_NOTIFY`); no se inventa un criterio nuevo |
| `crm_point_schedules` desactualizada si `sync-crm-points.js` falla silenciosamente varios días | Bajo | Igual que otras fuentes del ciclo: `operational-cycle.jsonl` expone la antigüedad; candidato a alerta en spec 0007 |
| Un punto con `siiss_id` duplicado en Supabase (ya detectado por el script: `is_double`) escribe capacidades contradictorias | Bajo | Se reutiliza la misma resolución `SIIS_SHARED_DOUBLE_LOCATION`/`HELD` que ya tiene `reconcile-crm-points.mjs`; los `HELD` no se escriben |

## 8. Impacto en producción

- **Usuario:** "Operación de Puntos" muestra `has_cctv`/`has_alarm` reales sin mantenimiento
  manual; "Eventos diarios" mide "abrió tarde" contra el horario real de cada punto en vez de
  un umbral genérico.
- **Despliegue:** `cctv-automation-final/.env` gana `SUPABASE_URL`+`SUPABASE_SERVICE_ROLE_KEY`
  en `.65` (no versionado, se configura a mano); migración de esquema (`crm_point_schedules`,
  idempotente); rebuild `cctv-api` + `cctv-operational-worker`; `docker restart crm-frontend`
  no aplica (sin cambios de frontend).
- **Rollback:** `git revert` + rebuild. Los `has_cctv`/`has_alarm` corregidos en Supabase
  **no se revierten solos** (quedan como estaban al momento del rollback) — es una corrección de
  datos, no un cambio de esquema.
