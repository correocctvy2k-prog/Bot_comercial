# TASKS 0008 — CCTV/Mantenimiento: refresco desde la API de Trello

Referencia: `spec.md` y `plan.md`.

## Bloqueante · RESUELTO

- [x] Board id: **"Mantenimientos"** `62a0bd9b2203177716f8afdc` (lista
      `Mantenimiento CCTV 2026` `6a4d648f211add41f8d11db4`) — de la caché local `skylab-tareas.db`.
- [x] `TRELLO_API_KEY`/`TRELLO_TOKEN` viven en `TRELLO_ENV_FILE` (`Table Trello/backend/.env`,
      montado); `import-trello-support.js` ya los usa así en `.65`.

## Implementación · HECHA

- [x] `platform/import-trello-maintenance.js`: lee la API de Trello (`fetchJson`,
      `/boards/:id/lists` + `/lists/:id/cards?checklists=all`), filtra `MANTENIMIENTO CCTV 2026`,
      serializa `checklists` antes de `parseWorkItems`. Sin `trelloCacheDb`. Ahora es `async`.
- [x] `scripts/run-operational-cycle.js`: quitado el paso `trelloRefresh` y su check en `status`.
- [x] `scripts/refresh-trello-maintenance-cache.js`: **eliminado** (+ script `refresh:trello-maintenance` de `package.json`).
- [x] `.env.example`: `TRELLO_MAINTENANCE_BOARD_ID` (con default), `TRELLO_MAINTENANCE_LIST_NAME`;
      quitados `TRELLO_CACHE_DB` / `TRELLO_BACKEND_ROOT` (sin uso).
- [x] `docs/MODELO-CANONICO-MANTENIMIENTO-TRELLO.md` + `docs/RUNBOOK-DESPLIEGUE-SERVIDOR.md`.
- [ ] `docker-compose.yml`: el mount `Table Trello/backend/data` (skylab-tareas.db) queda sin
      uso — se puede quitar aparte; el mount del `.env` se mantiene (credenciales de soporte).

## Verificación

- [x] `node platform/import-trello-maintenance.js` local → `{ok:true, cards:12, total:263, completed:180}`,
      run exitoso.
- [x] `cd cctv-automation-final && npm test` → **52/52** (incl. `trello-maintenance.test.js`).
- [x] `docker compose ... up -d --build cctv-api cctv-operational-worker` local → tras 1 ciclo
      `GET /api/cctv/maintenance` `cacheUpdatedAt` de hace ~1 min; `sync-status` TRELLO **HEALTHY**
      (antes 5 días / STALE).
- [ ] `192.168.8.65`: deploy + editar un checkitem en Trello → verlo en "Ejecución del programa"
      en ≤ 3 min.

## Documentación (DoD)

- [x] `CHANGELOG.md` — sección "CCTV / Mantenimiento" en "No publicado".
- [x] `docs/MODELO-CANONICO-MANTENIMIENTO-TRELLO.md`.
- [x] `LL-0004` — dos vistas / dos fuentes.
- [x] ADR: no aplica.

## Cierre

- [ ] PR enlazando la spec (`npm test` 52/52 anotado). Merge. Deploy `cctv-api` +
      `cctv-operational-worker` a `.65` y verificación. Añadir `TRELLO_MAINTENANCE_BOARD_ID` al
      `.env` del `.65` (o dejar el default del código).
