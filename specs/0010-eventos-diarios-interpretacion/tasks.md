# TASKS 0010 — Eventos diarios: interpretación operativa por ventanas + ping

Referencia: `spec.md` y `plan.md`.

## Ventanas (confirmadas con el usuario, 2026-09-09)

- APERTURA_MANANA 05:00–09:30 · CIERRE_MEDIODIA 13:00–14:00 · APERTURA_TARDE 15:00–17:00 ·
  CIERRE_NOCHE 18:00–22:00. Tolerancia ping↔evento 20 min. Todo configurable por env.

## Tanda 1 — interpretación + vista

- [ ] `platform/window-config.js`: parseo `"HH:MM-HH:MM"` + defaults; lee `CCTV_WIN_*` y
      `CCTV_PING_EVENT_TOLERANCE_MIN`.
- [ ] `platform/operational-event-policy.js`: `interpretDailyOperations(events, pings, opts)`
      → `{ phases, missingDetections, notificationConfigInconsistency, anomalies }` por punto/día.
      Reglas: primera detección por ventana = esa fase; cruce con primer/último ping;
      primera detección nocturna sin mañana = `CIERRE_SIN_APERTURA_DETECTADA`; fuera de las
      4 ventanas = `FUERA_DE_VENTANA` (anomalía); `lateBy` si pasa el fin de ventana.
- [ ] `api/server.js` `dailyEventsData`: consumir la interpretación; `phase`/`interpretation`/
      `lateBy` en `evidenceItems` y `pointOperations`; `hourly` con series interpretadas;
      `summary.notificationInconsistencies` + `summary.outOfWindow`.
- [ ] `cctv-automation-final/.env.example`: 5 vars nuevas con sus defaults.
- [ ] `tests/operational-event-policy.test.js`: 4+ casos nuevos.
- [ ] `CctvModule.jsx`: badges por fase; gráfico por hora interpretado; aviso de
      inconsistencias; "abrió tarde N min" vs `pointContext.schedules`.
- [ ] `docs/MODULO-ALARMAS-Y-CIERRE-PING.md`: sección nueva.

## Tanda 2 — corte diario (posterior)

- [ ] `platform/operational-closure.js`: contar fases interpretadas en vez de `event_type` crudo.
- [ ] Verificar `scripts/generate-operational-closure.js` + registro histórico.

## Verificación

- [ ] `cd cctv-automation-final && npm test` verde.
- [ ] Docker local: OFICINA PRINCIPAL — detecciones matinales = "Apertura mañana"; hourly sin
      cierres < 13:00 ni aperturas > 17:00.
- [ ] Inconsistencia forzada (ping sin evento) visible en el aviso.
- [ ] `192.168.8.65`: rebuild `cctv-api` + `crm-frontend` (+ `restart crm-frontend`), revisión
      con datos reales; ajuste de `CCTV_WIN_*` si hace falta.

## Documentación (DoD)

- [ ] `CHANGELOG.md` — "CCTV".
- [ ] `docs/MODULO-ALARMAS-Y-CIERRE-PING.md`.
- [ ] `LL` si aparece un tropiezo no obvio (p. ej. TZ / DST, o el corte diario descuadrando).
- [ ] ADR: no aplica (sin cambio de esquema ni de arquitectura base).

## Cierre

- [ ] PR enlazando la spec (`npm test` anotado). Merge. Deploy y verificación en `.65`.
