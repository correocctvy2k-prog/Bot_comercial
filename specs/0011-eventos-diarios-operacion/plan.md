# PLAN 0011 — Eventos diarios: operación por zona, conciliación y resolución

Referencia: `spec.md`. Se ejecuta en **tandas**; cada tanda es un commit (o varios) verificable.
PR único al final de las tandas 1–4 salvo que el usuario pida partir.

## Investigación previa (antes de tocar código)

- [ ] `motionBursts`: `grep -rn "motionBursts" CRM_Frontend/src` — ¿lo usa otra vista además
      del panel de "Movimiento consolidado" de Eventos diarios? Decide si se recorta en backend.
- [ ] Patrón de migración: ¿hay `cctv-automation-final/migrations/` o el esquema se crea al
      arranque? Buscar `CREATE TABLE` en `api/server.js` / `db/` / `scripts/`. La tabla
      `cctv_notification_resolutions` sigue ese patrón.
- [ ] `POST /api/cctv/events/identity/link` (server.js ~566): confirmar contrato exacto
      (`{alias, locationId}`, header `x-actor`, respuesta) y que crea `location_aliases`
      duradero. Ver si ya hay UI que lo llame en otra pestaña para reutilizar componente.
- [ ] Modal de evidencia actual (`setEvidence`/`insight`): localizar el JSX y qué campos
      pinta hoy, para añadir el bloque de detalle del correo sin duplicar.
- [ ] `zone` en `locations`: valores reales y normalización (`normalizeZone` ya existe en
      server.js). Cuántos puntos activos por zona y cuántos "Sin zona".
- [ ] Confirmar con el usuario los mapeos de identidad dudosos (§3.3.a de la spec).

## Tanda 1 — Legibilidad (frontend puro, sin riesgo)

1. Modal de evidencia: bloque "Detalle del aviso" con `rawEventType` / `channelRaw` / `alarm`
   / `subject` / `sender` / `sourceIp` / fase + `lateBy`. Filas vacías omitidas.
2. Escala tipográfica/iconos de las tarjetas de la vista (grid evidencias, lista jornada,
   panel inconsistencias). Un escalón arriba, por breakpoint, respetando design-system.
3. Smoke visual local 1280/1920. Build verde.

## Tanda 2 — Conciliación de identidades

1. **Limpieza puntual:** `scripts/reconcile-eventos-diarios-pendientes-20260910.mjs` (o
   equivalente al patrón existente `reconcile-email-identities-*.js`) que aplica los mapeos
   confirmados vía la misma lógica que el endpoint (o llamándolo). Dry-run + `--apply`.
2. **UI de conciliación:** panel "Identidades por conciliar" → por fila, selector de punto
   canónico (reutiliza catálogo `locations`; buscador con normalización de tildes) + botón
   **Vincular** → `POST /api/cctv/events/identity/link`. Optimista: la fila desaparece al
   200; error → toast y se mantiene. Cuadro oculto si `identityPending.length === 0`.
3. **Quitar "Movimiento consolidado"** del frontend. Backend: según investigación previa,
   dejar `motionBursts` o recortarlo a contador en `summary`.
4. Correr la limpieza en local, verificar que el cuadro queda vacío. Tests si se toca
   `platform/`.

## Tanda 3 — Resolución de inconsistencias

1. **Esquema:** `cctv_notification_resolutions` (idempotente, patrón del repo).
2. **`platform/notification-resolutions.js`** (nuevo, con tests):
   - `loadActiveResolutions(db, date)` → `{ pingOnlyForced:Set, followUp:Set, silencedToday:Set }`.
   - helpers de inserción/reapertura + validación del enum.
3. **`interpretPointDay` / `dailyEventsData`:** aceptar `forcedPingOnly:Set` y respetarlo al
   fijar `coverage`. Filtrar `notificationInconsistencies` por resoluciones vigentes; añadir
   `notificationsInFollowUp[]` y `summary.notificationsResolved`.
4. **Rutas:** `POST /api/cctv/notifications/:locationId/resolve` y `.../reopen`
   (`x-actor`, `audit_log`, idempotencia).
5. **Frontend:** menú de 3 opciones + nota por fila; sección plegable "En seguimiento";
   enlace "reabrir". Botón "Crear tarjeta de mantenimiento" **deshabilitado** con tooltip
   "próximamente" (no-objetivo de esta spec).
6. Tests: filtrado por `DATE` vs `PERSISTENT`, `PING_ONLY` forzado cambia el `coverage`,
   reapertura.

## Tanda 4 — Tableros por zona

1. **`platform/zone-boards.js`** (nuevo, con tests): `buildZoneBoards(operationalDays, locByZone)`
   → `zoneBoards[]` con `counts` de los 5 estados y `points[]` slim. Función `pointState(day)`
   con la prioridad `ANOMALY > LATE > CLOSED > ON_TIME > IDLE`.
2. **`dailyEventsData`:** llamar a `buildZoneBoards` reutilizando `operationalDays` ya
   calculado (sin queries nuevas); añadir `zoneBoards` a la respuesta.
3. **Frontend:** grid de tarjetas de zona; rejilla de cubos con `title`; click resalta el
   punto en la lista de jornada. Leyenda. "Sin zona" al final. `prefers-reduced-motion`.
4. Verificar que los conteos cuadran con la lista de jornada filtrada por zona.

## Verificación (todas las tandas)

- [ ] `cd cctv-automation-final && npm test` verde (sin CI; anotar el número en el PR).
- [ ] Docker local: `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d
      --build cctv-api crm-frontend && docker compose ... restart crm-frontend`. Revisar
      `127.0.0.1:3003` con datos reales: detalle del correo, cuadros de identidad/movimiento
      fuera, resolución de inconsistencias, tableros de zona.
- [ ] `192.168.8.65`: backup del `.db`, migración, rebuild `cctv-api` + `crm-frontend`,
      `docker restart crm-frontend`, correr la limpieza de identidades una vez, verificación.

## Documentación (DoD)

- [ ] `CHANGELOG.md` — sección "CCTV" bajo `[No publicado]`.
- [ ] `cctv-automation-final/docs/MODULO-ALARMAS-Y-CIERRE-PING.md` — sección de resolución de
      inconsistencias + estados de zona.
- [ ] `cctv-automation-final/.env.example` — si aparece alguna var nueva (no se prevé).
- [ ] Ficha de módulo CCTV + lección aprendida si hay tropiezo (candidato: migración sobre
      SQLite en prod).
- [ ] `specs/README.md` — fila 0011 y estados a medida que avanza.
- [ ] ADR: no se prevé (sin decisión arquitectónica nueva; se reutiliza infra de alias y el
      patrón `x-actor` + `audit_log`).

## Orden y dependencias

Tanda 1 y 2 son independientes. Tanda 3 antes que la 4 no es obligatorio, pero la 4 reutiliza
`operationalDays` igual que la 3. Sugerido: 1 → 2 → 3 → 4, PR único.
