# TASKS 0011 — Eventos diarios: operación por zona, conciliación y resolución

Referencia: `spec.md` y `plan.md`. Estado: **Validada (2026-09-10) — en implementación.**

## Decisiones confirmadas (2026-09-10)

- Detalle del correo en la tarjeta ampliada: `rawEventType` ("Evento de alarma"),
  `channelRaw` ("Canal de entrada"), `alarm` ("Alarma"). Ya vienen en `payload`.
- Identidades por conciliar: **ambas vías** — limpieza puntual de los 8 + UI en la vista.
- Inconsistencias: 3 opciones de resolución — `PING_ONLY` (persistente),
  `MISCONFIGURED_NO_NOTIFY` (persistente, en seguimiento), `FALSE_POSITIVE` (solo esa fecha).
  **No** "ya atendido en sitio". **No** crear tarjeta Trello automática (solo enganche).
- Cubos por zona: **5 estados** — `ON_TIME` verde, `LATE` ámbar, `CLOSED` azul, `IDLE` gris,
  `ANOMALY` rojo. "Sin zona" = tablero propio.
- Subir un escalón fuentes/iconos de las tarjetas.

## Mapeos de identidad — CONFIRMADOS (2026-09-10)

| storeRaw | Punto canónico |
|---|---|
| Independencia 3931 | INDEPENDENCIA |
| Metro 2242 | CARREFOUR METRO |
| 19 con 35 | LA 19 CON 35 |
| Parque Prado 2301 | PARQUE EL PRADO |
| Parq Bolivar 3333 | PARQUEADERO PARQUE BOLIVAR |
| Ant. Ppal 3054 | ANTIGUA PPAL II |
| Antigua Ppal cll31#32 29 | ANTIGUA PPAL II |
| Antigua Ppal Rozo | ANTIGUA PRINCIPAL ROZO |

## Resuelto durante la implementación

- `motionBursts`: solo lo consumía Eventos diarios (panel "Movimiento consolidado" + modal
  `bursts` muerto). Se quita el array de la respuesta; se conservan `summary.motionBursts`/
  `noisyBursts` y la serie `hourly[].motion` del gráfico.

## Tanda 1 — Legibilidad · frontend ✅ (commit 017d3be)

- [x] Modal de evidencia: bloque "Detalle del aviso" (rawEventType/channelRaw/alarm/subject/
      sender/sourceIp/fase). Filas vacías omitidas. Columna más ancha (1.35/0.65).
- [x] Escala tipográfica/iconos: grid de evidencias + lista "Señales CCTV de jornada".
      Panel de inconsistencias se rehace en Tanda 3.
- [x] `npm run build` verde. Smoke visual en el rebuild final.

## Tanda 2 — Conciliación de identidades · backend + frontend ✅

- [x] `scripts/reconcile-eventos-diarios-pendientes-20260910.mjs` (dry-run + `--apply`).
      Dry-run OK: 8 aliases resueltos.
- [x] `EventIdentityCard` + panel "Identidades por conciliar" accionable (buscador + Vincular →
      `POST /api/cctv/events/identity/link`). Cuadro oculto si lista vacía.
- [x] Fuera "Movimiento consolidado" (+ `motionPointGroups`, modal `bursts`, configs muertas).
      `motionBursts` recortado del backend.
- [x] `refreshDailyEvents` cableado (`RealEvents onChanged`) para refresco tras vincular.
- [ ] Correr limpieza con `--apply` en local + verificar cuadro vacío (en el rebuild final).

## Tanda 3 — Resolución de inconsistencias · backend + frontend ✅

- [x] Esquema `cctv_notification_resolutions` + índice en `platform/schema.sql` (idempotente,
      se crea en cada arranque; no hace falta script de migración).
- [x] `platform/notification-resolutions.js` + `tests/notification-resolutions.test.js` (6 casos,
      `normalizeResolveInput` / `loadActiveResolutions` / idempotencia / reopen). **70/70**.
- [x] `dailyEventsData`: `coverageByLoc` respeta `pingOnlyForced`; `notificationInconsistencies`
      filtra `followUp`+`silenced`; añade `notificationsInFollowUp[]`,
      `summary.{notificationsInFollowUp,notificationsResolved}`.
- [x] `POST /api/cctv/notifications/:locationId/resolve` + `.../reopen` (`x-actor`, `audit_log`,
      idempotente por (location, resolution, effective_date)).
- [x] Frontend: `NotificationInconsistencyCard` (3 botones + nota) +
      `NotificationFollowUpSection` plegable con "Reabrir".
      botón "Crear tarjeta de mantenimiento" deshabilitado (tooltip "próximamente").
- [ ] Tests: `DATE` vs `PERSISTENT`, `PING_ONLY` fuerza `coverage`, reapertura.

## Tanda 4 — Tableros por zona · backend + frontend

- [ ] `platform/zone-boards.js` + tests: `buildZoneBoards`, `pointState` con prioridad
      `ANOMALY > LATE > CLOSED > ON_TIME > IDLE`.
- [ ] `dailyEventsData`: `zoneBoards[]` reutilizando `operationalDays` (sin queries nuevas).
- [ ] Frontend: grid de tarjetas de zona, rejilla de cubos (`title`), click → resalta punto,
      leyenda, "Sin zona" al final, `prefers-reduced-motion`.
- [ ] Conteos por zona cuadran con la lista de jornada filtrada.

## Verificación

- [ ] `cd cctv-automation-final && npm test` verde (anotar número en el PR; sin CI).
- [ ] Docker local con datos reales: los 5 puntos de la spec §4.
- [ ] `192.168.8.65`: backup `.db` → migración → rebuild `cctv-api`+`crm-frontend` →
      `docker restart crm-frontend` → limpieza de identidades una vez → verificación.

## Documentación (DoD)

- [ ] `CHANGELOG.md` (sección CCTV, `[No publicado]`).
- [ ] `docs/MODULO-ALARMAS-Y-CIERRE-PING.md` (resolución de inconsistencias + estados de zona).
- [ ] `specs/README.md` fila 0011 + estados.
- [ ] Lección aprendida si hay tropiezo (candidato: migración SQLite en prod).

## Cierre

- [ ] PR `feat/0011` → `main` enlazando la spec. Merge. Deploy a `.65` + verificación.
