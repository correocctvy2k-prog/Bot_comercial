# SPEC 0008 — CCTV/Mantenimiento: la "Ejecución del programa" muestra datos de hace días

- **Estado:** En revisión (implementada y verificada en local; PR pendiente)
- **Board:** "Mantenimientos" (`62a0bd9b2203177716f8afdc`, `https://trello.com/b/zPSPi2ka/mantenimientos`),
  lista `Mantenimiento CCTV 2026` (`6a4d648f211add41f8d11db4`) — obtenido de la caché local.
- **Autor:** equipo Skylab (@jbeltran)
- **Fecha:** 2026-09-09
- **Módulos afectados:** `cctv-automation-final` (`platform/import-trello-maintenance.js`,
  `scripts/run-operational-cycle.js`, `scripts/refresh-trello-maintenance-cache.js`);
  eventualmente `docker-compose.yml` (mounts que dejan de ser necesarios).
- **Rama:** `fix/0008-cctv-mantenimiento-refresco`

## 1. Problema (reportado y confirmado)

En Seguridad Electrónica → Mantenimiento: al editar una tarjeta en Trello, el cambio aparece
en el **dashboard** ("Ritmo de atención" / "Centro de actividad técnica") pero **no** en la
ventana **"Ejecución del programa"**.

**Evidencia en prod `192.168.8.65` (2026-09-09 20:44 UTC):**

| Endpoint | Marca de frescura | Antigüedad |
|----------|-------------------|-----------|
| `GET /api/cctv/support` (dashboard) | `syncedAt: 2026-09-09T20:43:59Z` | **~45 s** |
| `GET /api/cctv/maintenance` ("Ejecución") | `cacheUpdatedAt: 2026-09-04T19:59:01Z` | **5 días** |
| `GET /api/cctv/sync-status` → TRELLO | `STALE`, `lastRunAt: 2026-09-04T19:59:01Z` | 5 días |

El ciclo operativo **sí corre** (EMAIL y SIIS marcan `HEALTHY` con `lastRunAt` de hace minutos,
y comparten `scripts/run-operational-cycle.js`). Lo que no avanza es la importación de
mantenimiento.

## 2. Causa raíz (confirmada leyendo el código)

Las dos vistas se alimentan de **fuentes distintas**:

- **Dashboard / soporte** → `platform/import-trello-support.js`: hace `fetch` **directo a la
  API de Trello** (`https://api.trello.com/1/...`, con `TRELLO_API_KEY`/`TRELLO_TOKEN` del
  `.env` montado de `Table Trello/backend`). Boards fijos en código (`Soporte 2025`, `Soporte
  2026`). → **siempre en vivo**.
- **"Ejecución del programa"** → `platform/import-trello-maintenance.js`: **no llama a la API
  de Trello**. Lee la lista `MANTENIMIENTO CCTV 2026` desde **`skylab-tareas.db`**
  (`runtimePaths.trelloCacheDb`), una caché SQLite que **escribe el backend de "Table Trello"**
  (`CRM_Frontend/Table Trello/backend`, servicio del tablero).
- El "calentador" de esa caché, `scripts/refresh-trello-maintenance-cache.js`, hace
  `require()` **en proceso** del backend de Table Trello
  (`trelloBackendRoot/src/services/trello.service.js`) para llamar a `getTarjetas()`.

**Por qué se rompe en el servidor:**
1. En `docker-compose.yml` **no hay servicio para el backend de "Table Trello"** — solo se
   monta su carpeta `data/` (con `skylab-tareas.db`) y su `.env` como volúmenes. Nada en el
   `.65` mantiene fresca esa caché.
2. `refresh-trello-maintenance-cache.js` no puede funcionar dentro del contenedor
   `cctv-operational-worker`: necesitaría el `node_modules`, el `db/init` y el `.env` del
   backend de Table Trello, que no están en esa imagen.
3. Resultado: `import-trello-maintenance.js` lee una `skylab-tareas.db` congelada (o falla), y
   `maintenance_source_runs` no tiene un run exitoso desde el 4 de septiembre.

Además, esto acopla la vista de Mantenimiento a que el backend de Table Trello / `comercial-bot`
esté vivo — y su build está roto (bullseye EOL).

## 3. Objetivo

Que "Ejecución del programa" refleje los cambios de Trello con la **misma latencia que el
dashboard** (~1-2 min, la cadencia del ciclo operativo), sin depender de `skylab-tareas.db` ni
del backend de Table Trello.

## 4. Alcance — solución elegida (Opción A)

**Reescribir `platform/import-trello-maintenance.js` para leer la lista de mantenimiento
directamente de la API de Trello**, con el mismo patrón que `import-trello-support.js`:

1. `fetchJson('/boards/{BOARD}/lists')` + `fetchJson('/boards/{BOARD}/cards', { checklists: 'all', … })`.
2. Filtrar la lista cuyo nombre (upper) sea `MANTENIMIENTO CCTV 2026` (configurable por
   `TRELLO_MAINTENANCE_LIST_NAME`).
3. Adaptar `platform/trello-maintenance.js` `parseWorkItems` para aceptar `card.checklists`
   como **array** (hoy espera un string JSON de la caché) — o serializar antes de pasarlo.
4. Guardar en `maintenance_source_runs` + `maintenance_work_items` **igual que ahora** (sin
   cambios de esquema ni del endpoint `GET /api/cctv/maintenance`).
5. En `scripts/run-operational-cycle.js`: quitar el paso `refresh-trello-maintenance-cache.js`
   (ya no hace falta); `maintenanceDue()` y la cadencia se mantienen.
6. `.env.example`: documentar `TRELLO_MAINTENANCE_BOARD_ID` (y opcional
   `TRELLO_MAINTENANCE_LIST_NAME`). Requiere `TRELLO_API_KEY`/`TRELLO_TOKEN` (ya presentes para
   soporte).
7. Limpieza (si aplica): el mount de `skylab-tareas.db` en `docker-compose.yml` deja de ser
   necesario para CCTV; se evalúa quitarlo (el `.env` de Table Trello sigue usándose para las
   credenciales de Trello — o se mueven esas credenciales al `.env` de `cctv-automation-final`).

**Necesario del usuario:** el **board id (o URL)** del tablero que contiene la lista
`MANTENIMIENTO CCTV 2026`.

### Opciones descartadas
- **B — Levantar el backend de Table Trello en el `.65`** para mantener la caché: más piezas,
  mantiene el acoplamiento y la caché de 981 MB.
- **C — Botón "Actualizar" en la vista**: no arregla la causa; el dato seguiría viniendo de una
  caché muerta.
- **D — Webhook de Trello**: más trabajo; la Opción A ya deja la latencia en ~1-2 min.

## 5. Criterios de aceptación

- [ ] Tras editar una tarjeta/checkitem en la lista `MANTENIMIENTO CCTV 2026`, el cambio
      aparece en "Ejecución del programa" en **≤ 3 min** sin acción manual.
- [ ] `GET /api/cctv/maintenance` → `cacheUpdatedAt` con menos de ~3 min de antigüedad;
      `GET /api/cctv/sync-status` → TRELLO `HEALTHY`.
- [ ] `import-trello-maintenance.js` no lee `skylab-tareas.db` ni requiere el backend de Table
      Trello; sí exige `TRELLO_API_KEY`/`TRELLO_TOKEN`.
- [ ] El esquema de la BD y el contrato de `GET /api/cctv/maintenance` no cambian; el frontend
      (`RealMaintenance`) no se toca.
- [ ] `npm test` de `cctv-automation-final` verde (incl. `tests/trello-maintenance.test.js`,
      adaptado si hace falta).
- [ ] Verificado en local y en `192.168.8.65`.

## 6. No-objetivos

- No rediseñar la vista de Mantenimiento.
- No cambiar el esquema de la BD (`platform/schema.sql`) — solo el origen de los datos.
- No tocar `import-trello-support.js` ni el dashboard (ya refresca bien).
- No arreglar el backend de Table Trello ni `comercial-bot` (queda desacoplado, no reparado).

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| Límite de rate de la API de Trello con cadencia de ~1 min | Bajo | Soporte ya llama 2 boards/min sin problema; mantenimiento añade 1 board más. Subir `MAINTENANCE_SYNC_INTERVAL_MINUTES` si hiciera falta |
| `parseWorkItems` asume checklists como string JSON | Medio | Adaptar el parser para aceptar array o `JSON.stringify` en el import; cubierto por `tests/trello-maintenance.test.js` |
| El board id cambia o el usuario da uno equivocado | Bajo | Configurable por env; log claro "lista MANTENIMIENTO CCTV 2026 no encontrada en el board X" |
| Quitar el mount de `skylab-tareas.db` rompe otra cosa | Bajo | Verificar que nada más en `cctv-automation-final` usa `trelloCacheDb` (solo lo usan `import-trello-maintenance.js` y `refresh-trello-maintenance-cache.js`, ambos que esta spec retira/cambia) |

## 8. Impacto en producción

- **Usuario:** "Ejecución del programa" pasa a estar tan fresca como el dashboard.
- **Despliegue:** rebuild de `cctv-api` + `cctv-operational-worker` en `192.168.8.65`; añadir
  `TRELLO_MAINTENANCE_BOARD_ID` al `.env` de `cctv-automation-final` (y `TRELLO_API_KEY`/
  `TRELLO_TOKEN` si se decide moverlas ahí).
- **Rollback:** `git revert` del merge + rebuild. Sin migraciones.
