# TASKS 0010 — Eventos diarios: interpretación operativa por ventanas + ping

Referencia: `spec.md` y `plan.md`.

## Ventanas (confirmadas con el usuario, 2026-09-09)

- APERTURA_MANANA 05:00–09:30 · CIERRE_MEDIODIA 13:00–14:00 · APERTURA_TARDE 15:00–17:00 ·
  CIERRE_NOCHE 18:00–22:00. Tolerancia ping↔evento 20 min. Todo configurable por env.

## Tanda 1 — interpretación + vista · HECHA (`eb9c634`, `46ebc98`, `ac39e87`)

- [x] `platform/window-config.js`: parseo `"HH:MM-HH:MM"` + defaults + gracia
      (`CCTV_WIN_GRACE_MIN=150`, recortada para no invadir la ventana vecina).
- [x] `platform/operational-event-policy.js`: `interpretPointDay` / `interpretDailyOperations`.
      **Ping = vector primario** (transición > evidencia CCTV > presencia de ping). Cruce con
      ping para `notificationConfigInconsistency` (solo `WITH_CCTV`); `PING_ONLY` nunca es
      anomalía por falta de detección. `lateBy`, `anomalies` (fuera de toda gracia),
      `interpretation` (`NORMAL`/`CIERRE_SIN_APERTURA`/`SIN_ACTIVIDAD`).
- [x] `api/server.js` `dailyEventsData`: arma input por punto (eventos + pings del día +
      `cctv_coverage_status`), llama a `interpretDailyOperations`. `hourly.openings/closures`
      por fase interpretada. `evidenceItems` con `operationalPhase`/`Label`/`Kind`/`lateBy`.
      Respuesta gana `operationalDays[]`, `operationalWindows`, `notificationInconsistencies`,
      `summary.{notificationInconsistencies,outOfWindowDetections,cierreSinApertura,pointsWithOpening}`.
- [x] `cctv-automation-final/.env.example`: 6 vars nuevas.
- [x] `tests/operational-event-policy.test.js`: +9 casos (**61/61**).
- [x] `CctvModule.jsx`: `PHASE_BADGE` en el grid (+ "· tarde Nm"); panel "Inconsistencias de
      notificación CCTV"; subtítulo del gráfico por hora. Build verde.
- [x] Verificado con datos reales (BD local): 353 puntos, 285 con apertura interpretada,
      2 inconsistencias (OFICINA PRINCIPAL con 69 min de desfase ping↔aviso).
- [ ] `docs/MODULO-ALARMAS-Y-CIERRE-PING.md`: sección nueva.
- [ ] Smoke visual en Docker local + prod.

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
