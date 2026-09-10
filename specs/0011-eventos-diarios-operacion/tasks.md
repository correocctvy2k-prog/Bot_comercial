# TASKS 0011 — Eventos diarios: operación por zona, conciliación y resolución

Referencia: `spec.md` y `plan.md`. Estado: **Borrador — pendiente de aprobación del usuario.**

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

## Pendiente de confirmar antes de codear

- [ ] Mapeos de identidad dudosos (§3.3.a spec):
  - [ ] `Parque Prado 2301` → ¿`PARQUE EL PRADO`?
  - [ ] `Parq Bolivar 3333` → ¿`PARQUEADERO PARQUE BOLIVAR`?
  - [ ] `Ant. Ppal 3054` → ¿?
  - [ ] `Antigua Ppal Rozo` → ¿`ANTIGUA PRINCIPAL ROZO`?
  - [ ] `Antigua Ppal cll31#32 29` → ¿`ANTIGUA PPAL II` u otra?
  - Claros: `Independencia 3931`→`INDEPENDENCIA`, `Metro 2242`→`CARREFOUR METRO`,
    `19 con 35`→`LA 19 CON 35`.
- [ ] ¿`motionBursts` se recorta del backend o se deja? (según investigación previa del plan)

## Tanda 1 — Legibilidad · frontend

- [ ] Modal de evidencia: bloque "Detalle del aviso" (6-7 filas, omite vacías).
- [ ] Escala tipográfica/iconos de las tarjetas de la vista (por breakpoint, design-system).
- [ ] Smoke visual 1280 / 1920. `npm run build` verde.

## Tanda 2 — Conciliación de identidades · backend + frontend

- [ ] Script de limpieza puntual (dry-run + `--apply`), patrón `reconcile-email-identities-*`.
- [ ] UI: panel "Identidades por conciliar" accionable (selector de punto + Vincular →
      `POST /api/cctv/events/identity/link`). Cuadro oculto si lista vacía.
- [ ] Quitar panel "Movimiento consolidado" del frontend (+ recorte backend si aplica).
- [ ] Correr limpieza en local; verificar cuadro vacío.

## Tanda 3 — Resolución de inconsistencias · backend + frontend

- [ ] Esquema `cctv_notification_resolutions` (idempotente).
- [ ] `platform/notification-resolutions.js` + tests (`loadActiveResolutions`, validación enum).
- [ ] `interpretPointDay`/`dailyEventsData`: `forcedPingOnly` respetado; filtrar
      `notificationInconsistencies`; añadir `notificationsInFollowUp[]`,
      `summary.notificationsResolved`.
- [ ] `POST /api/cctv/notifications/:locationId/resolve` + `.../reopen` (`x-actor`,
      `audit_log`, idempotencia).
- [ ] Frontend: menú 3 opciones + nota; sección "En seguimiento" plegable; "reabrir";
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
