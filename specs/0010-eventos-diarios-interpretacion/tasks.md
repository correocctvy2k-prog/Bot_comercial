# TASKS 0010 — Eventos diarios: interpretación operativa por ventanas + ping

Referencia: `spec.md` y `plan.md`.

## Ventanas (confirmadas con el usuario, 2026-09-09)

- APERTURA_MANANA 05:00–09:30 · APERTURA_TARDE 15:00–17:00 · CIERRE_NOCHE 18:00–22:00.
  Tolerancia ping↔evento 20 min. Todo configurable por env.
- **CIERRE_MEDIODIA desactivada por defecto** (2026-09-10): su ventana con gracia se solapaba
  con la mañana y marcaba un cierre falso a ~300 puntos que solo seguían online. Activable por
  `CCTV_WIN_CLOSE_MIDDAY=13:00-14:00` si un punto real lo necesita.

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

## Tanda 1b — arreglos tras smoke visual (2026-09-10)

Reportado por el usuario revisando en local: cierres en horario de apertura, barra de "Cierres"
enorme en el gráfico, "DESCONOCIDO" repetido en OFICINA PRINCIPAL.

- [x] **Gráfico:** `PING_PRESENCE` ya no crea fase de cierre ni se cuenta en `hourly`
      (solo transición de ping o correo CCTV). Repro: 317 cierres falsos a las 10:00 → 0.
- [x] **DESCONOCIDO:** `interpretPointDay` devuelve `eventPhases` (clasifica TODAS las
      detecciones de la ventana, no solo la representativa). Server etiqueta cada `evidenceItem`.
      Front: máx. 3 tiles por punto en el grid.
- [x] **Lista "Señales CCTV de jornada" + KPIs:** `pointOperations` recableado a las fases
      interpretadas; `closing` solo con evidencia real; puntos sin identidad pierden el cierre
      crudo; estado `NONE` → "Sin señal en ventana".
- [x] `CIERRE_MEDIODIA` desactivada por defecto (ver arriba). `npm test` 64/64.
- [ ] Pendiente decidir con el usuario: ¿la card "Señales CCTV de jornada" debe volverse
      ping-primary (todos los puntos con apertura interpretada, ~318) o seguir acotada a los
      puntos que notifican por correo Dahua (~13, hoy)? Ahora mismo es lo segundo.

## Tanda 2 — corte diario (posterior)

- [ ] `platform/operational-closure.js`: contar fases interpretadas en vez de `event_type` crudo.
- [ ] Verificar `scripts/generate-operational-closure.js` + registro histórico.

## Verificación

- [x] `cd cctv-automation-final && npm test` → **61/61**.
- [x] Docker local + datos reales (2026-09-10): aperturas por hora solo 05:00-08:00 (cero de
      noche); 23 inconsistencias; 303 puntos con apertura interpretada; evidencias del grid con
      `operationalPhase` = "Apertura mañana".
- [ ] Smoke **visual** en `127.0.0.1:3003` (requiere login) — badges, panel de inconsistencias,
      "· tarde Nm", gráfico por hora.
- [ ] `192.168.8.65`: rebuild `cctv-api` + `crm-frontend` (+ **`docker restart crm-frontend`**
      tras el rebuild — nginx cachea la IP, lección del incidente 0008); revisión con datos
      reales; ajustar `CCTV_WIN_*` por env si un punto real no encaja.

## Documentación (DoD)

- [ ] `CHANGELOG.md` — sección "CCTV" (pendiente).
- [x] `docs/MODULO-ALARMAS-Y-CIERRE-PING.md` — sección "4 ventanas + ping".
- [ ] `LL` si aparece un tropiezo (candidato: el endpoint `events/daily` ya tardaba ~6 s; 0010
      suma ~650 ms — deuda de rendimiento de `dailyEventsData`, no de 0010).
- [ ] ADR: no aplica.

## Estado para retomar (2026-09-10)

- Rama `fix/0010-eventos-diarios-interpretacion` **pusheada** (7 commits `770012f`→`6ab976a`),
  árbol limpio, **sin PR**. Sale de `main@0386cd8`, fast-forward.
- **Tanda 1 completa y probada en local.** Falta: (1) smoke visual, (2) `CHANGELOG.md`,
  (3) PR + deploy a `.65`, (4) decidir sobre la deuda de ~6 s del endpoint.
- **Tanda 2 sin empezar**: `platform/operational-closure.js` cuenta `event_type='OPENING'/
  'CLOSING'` crudos → alinear a las fases interpretadas (reutilizar `interpretDailyOperations`).
- Definición clave confirmada por el usuario: `WITH_CCTV` = el punto envió ≥1 correo Dahua en
  30 días (no `cctv_coverage_status`). El PING es el vector primario.

## Cierre

- [ ] `CHANGELOG.md`. PR enlazando la spec (`npm test` 61/61 anotado; no hay CI para el
      servicio). Merge. Deploy `cctv-api` + `crm-frontend` a `.65` y verificación.
- [ ] Tanda 2 (corte diario) como PR aparte.
