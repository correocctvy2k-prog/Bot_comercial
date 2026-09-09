# PLAN 0008 — CCTV/Mantenimiento: refrescar "Ejecución del programa" desde la API de Trello

Referencia: `spec.md`. Opción A: la importación de mantenimiento pasa a leer la API de Trello,
igual que la de soporte.

## Archivos a tocar

| Archivo | Cambio | Riesgo |
|---------|--------|--------|
| `platform/import-trello-maintenance.js` | Sustituir la lectura de `skylab-tareas.db` por `fetchJson` a la API de Trello (boards/lists/cards con `checklists=all`); filtrar la lista `MANTENIMIENTO CCTV 2026`; pasar cada `card` a `parseWorkItems` con `checklists` **serializado** (`JSON.stringify`). Resto (upsert, `maintenance_source_runs`, desactivar no vistos) igual. | medio |
| `scripts/run-operational-cycle.js` | Quitar el paso `trelloRefresh` (`refresh-trello-maintenance-cache.js`). `maintenanceDue()` y cadencia intactos. | bajo |
| `scripts/refresh-trello-maintenance-cache.js` | Eliminar (o dejar como script manual de diagnóstico, sin uso en el ciclo). | bajo |
| `.env.example` (`cctv-automation-final`) | `TRELLO_MAINTENANCE_BOARD_ID` (requerido), `TRELLO_MAINTENANCE_LIST_NAME` (opcional, def. `MANTENIMIENTO CCTV 2026`). Nota: usa `TRELLO_API_KEY`/`TRELLO_TOKEN`. | bajo |
| `platform/trello-maintenance.js` | **Sin cambios** — el import serializa `checklists` antes de llamar a `parseWorkItems` (el parser ya hace `JSON.parse`). | — |
| `docker-compose.yml` | Evaluar quitar el mount `./CRM_Frontend/Table Trello/backend/data` (ya no lo usa CCTV). El `.env` de Table Trello se mantiene **solo si** de ahí salen `TRELLO_API_KEY/TOKEN`; si no, moverlas al `.env` de `cctv-automation-final` y quitar también ese mount. | bajo |
| `docs/MODELO-CANONICO-MANTENIMIENTO-TRELLO.md` | Actualizar el origen de datos (API directa, no caché). | bajo |

## Contratos

- `maintenance_source_runs` / `maintenance_work_items`: **sin cambios de esquema**.
- `GET /api/cctv/maintenance` (`trelloMaintenanceData()`): **sin cambios**. Solo cambia que
  `cacheUpdatedAt` (= `run.completed_at`) vuelve a avanzar.
- Frontend `RealMaintenance` / `refreshMaintenance` (poll 60 s, `cache:'no-store'`): sin cambios.

## Datos que faltan (bloqueante)

- **`TRELLO_MAINTENANCE_BOARD_ID`** — board id (o URL) del tablero con la lista
  `MANTENIMIENTO CCTV 2026`. Lo aporta el usuario.
- Confirmar de qué `.env` salen hoy `TRELLO_API_KEY`/`TRELLO_TOKEN` en `.65` (el de
  `Table Trello/backend`, montado como `trelloEnvFile`).

## Verificación

1. Local: `TRELLO_MAINTENANCE_BOARD_ID=… node platform/import-trello-maintenance.js` →
   `{ok:true, cards, total, completed}` y `maintenance_source_runs` con `completed_at` actual.
2. `npm test` en `cctv-automation-final` (incl. `tests/trello-maintenance.test.js`).
3. Editar un checkitem en Trello → esperar ≤ 1 ciclo → `GET /api/cctv/maintenance` refleja el
   cambio; `GET /api/cctv/sync-status` TRELLO `HEALTHY`.
4. Prod `.65`: rebuild `cctv-api` + `cctv-operational-worker`; repetir (3) contra
   `http://192.168.8.65:3003/`.

## Rollout / rollback

Rama `fix/0008-…` → PR → CI (no hay CI para `cctv-automation-final`; correr `npm test` a mano
y anotarlo en el PR) → merge → deploy `cctv-api` + `cctv-operational-worker`. Rollback:
`git revert` del merge + rebuild.
