# PLAN 0010 — Eventos diarios: interpretación operativa por ventanas + ping

Referencia: `spec.md`. Se hace en 2 tandas; la Tanda 1 es el fix visible y de bajo riesgo.

## Enfoque

Capa nueva de **interpretación operativa** en `platform/operational-event-policy.js`, con
tests propios. `dailyEventsData` la consume para etiquetar `evidenceItems` / `pointOperations`
y para el `hourly`. `engine.js:classify()` **no se toca** (sigue devolviendo `categoria`/`tipo`/
`fase`); la interpretación va encima.

`operational-closure.js` (corte diario persistente) queda **para la Tanda 2** — hoy cuenta
`event_type='OPENING'/'CLOSING'` crudos; alinearlo es más blast radius (registro persistido).
La Tanda 1 no lo toca: solo cambia la vista.

## Tanda 1 — interpretación + vista

| Archivo | Cambio |
|---------|--------|
| `platform/operational-event-policy.js` | `interpretDailyOperations(events, pings, opts)` → por punto/día: `phases {APERTURA_MANANA, CIERRE_MEDIODIA, APERTURA_TARDE, CIERRE_NOCHE}`, `missingDetections[]`, `notificationConfigInconsistency`, `anomalies[]`. Ventanas desde `opts` (env). Reglas §4.1 de la spec. |
| `platform/window-config.js` (nuevo, pequeño) | Parseo de `CCTV_WIN_*` (`"HH:MM-HH:MM"` → `{startMin,endMin}`) + defaults. |
| `api/server.js` `dailyEventsData` | Llama a `interpretDailyOperations`; `evidenceItems`/`pointOperations` llevan `phase` + `interpretation` + `lateBy`; `hourly.openings/closures` cuentan fases interpretadas; `summary` añade `notificationInconsistencies`, `outOfWindow`. |
| `cctv-automation-final/.env.example` | `CCTV_WIN_OPEN_AM`, `CCTV_WIN_CLOSE_MIDDAY`, `CCTV_WIN_OPEN_PM`, `CCTV_WIN_CLOSE_PM`, `CCTV_PING_EVENT_TOLERANCE_MIN`. |
| `CRM_Frontend/src/pages/CctvModule.jsx` | Badges por fase interpretada (config `phase`→label/tono); gráfico por hora con las series interpretadas; aviso de inconsistencias de configuración; "abrió tarde N min" cruzando `pointContext.schedules`. |
| `tests/operational-event-policy.test.js` | Casos: apertura matinal de tipo DESCONOCIDO, CLOSING a las 07:00 → fuera de ventana / apertura, primera detección nocturna → cierre sin apertura, ping sin evento → inconsistencia. |
| `docs/MODULO-ALARMAS-Y-CIERRE-PING.md` | Sección "Eventos diarios: 4 ventanas + ping". |

## Tanda 2 — alinear el corte diario (opcional / posterior)

- `platform/operational-closure.js`: `openingEvents/closingEvents/openingPoints/closingPoints`
  pasan a contar fases interpretadas (reutilizando `interpretDailyOperations`).
- Verificar `scripts/generate-operational-closure.js` y el registro histórico.

## Contratos de datos

- **Sin cambios de esquema.** `dailyEventsData` gana campos **aditivos**
  (`operationalDay`, `phase`, `interpretation`, `lateBy`, `summary.notificationInconsistencies`).
- El frontend antiguo sigue funcionando: si `phase` falta, cae al `eventType`/`evidenceType`
  actual.

## Verificación

1. `cd cctv-automation-final && npm test` (casos nuevos verdes).
2. Local docker (`cctv-api` + `crm-frontend`): pestaña "Eventos diarios" de OFICINA PRINCIPAL
   → las detecciones matinales salen "Apertura mañana"; el gráfico por hora sin cierres < 13:00
   ni aperturas > 17:00.
3. Forzar una inconsistencia (ping online 06:30, sin correo CCTV en ventana) → aparece en el
   aviso.
4. Prod `.65`: rebuild `cctv-api` + `crm-frontend`; revisar con datos reales; ajustar `CCTV_WIN_*`
   por env si un punto real no encaja.

## Rollout / rollback

Rama `fix/0010-…` → PR (sin CI; `npm test` a mano) → merge → deploy `cctv-api` + `crm-frontend`
(recordar `restart crm-frontend` tras rebuild del backend — lección del incidente 0008).
Rollback: `git revert` del merge + rebuild.
