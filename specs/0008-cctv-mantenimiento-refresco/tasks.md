# TASKS 0008 — CCTV/Mantenimiento: refresco desde la API de Trello

Referencia: `spec.md` y `plan.md`.

## Bloqueante

- [ ] Obtener del usuario el **`TRELLO_MAINTENANCE_BOARD_ID`** (board con la lista
      `MANTENIMIENTO CCTV 2026`).
- [ ] Confirmar de qué `.env` salen `TRELLO_API_KEY`/`TRELLO_TOKEN` en `.65`.

## Implementación

- [ ] `platform/import-trello-maintenance.js`: leer boards/lists/cards de la API de Trello
      (`fetchJson`, `checklists=all`), filtrar la lista `MANTENIMIENTO CCTV 2026`, serializar
      `card.checklists` antes de `parseWorkItems`. Quitar `trelloCacheDb`.
- [ ] `scripts/run-operational-cycle.js`: quitar el paso `trelloRefresh`.
- [ ] `scripts/refresh-trello-maintenance-cache.js`: eliminar (o marcar como diagnóstico manual).
- [ ] `cctv-automation-final/.env.example`: `TRELLO_MAINTENANCE_BOARD_ID`,
      `TRELLO_MAINTENANCE_LIST_NAME` (opcional).
- [ ] `docker-compose.yml`: evaluar/quitar el mount de `Table Trello/backend/data`; asegurar
      `TRELLO_*` disponibles para `cctv-api` + `cctv-operational-worker`.
- [ ] `docs/MODELO-CANONICO-MANTENIMIENTO-TRELLO.md`: origen = API directa.

## Verificación

- [ ] `node platform/import-trello-maintenance.js` en local → run exitoso, `completed_at` actual.
- [ ] `cd cctv-automation-final && npm test` verde.
- [ ] Editar un checkitem en Trello → ≤ 3 min → visible en "Ejecución del programa" local.
- [ ] `docker compose ... up -d --build cctv-api cctv-operational-worker` local; repetir.
- [ ] En `192.168.8.65`: añadir `TRELLO_MAINTENANCE_BOARD_ID` al `.env`, deploy, repetir la
      prueba contra `http://192.168.8.65:3003/`. `sync-status` TRELLO `HEALTHY`.

## Documentación (DoD)

- [ ] `CHANGELOG.md` — sección "CCTV" / "Infra".
- [ ] `docs/MODELO-CANONICO-MANTENIMIENTO-TRELLO.md`.
- [ ] `LL` — la asimetría "un módulo lee la API y otro una caché muerta"; lección: fuente única.
- [ ] ADR: no (no cambia esquema ni arquitectura base; sí una nota en el doc del modelo canónico).

## Cierre

- [ ] PR enlazando la spec. `npm test` anotado. Merge. Deploy y verificación en `.65`.
