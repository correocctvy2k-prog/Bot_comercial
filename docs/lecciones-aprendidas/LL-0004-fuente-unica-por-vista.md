# LL-0004 — Dos vistas del mismo dato, dos fuentes: una viva, otra muerta

- **Fecha:** 2026-09-09
- **Contexto:** `specs/0008-cctv-mantenimiento-refresco/` — CCTV / Mantenimiento.

## Qué pasó

El usuario reportó que al editar una tarjeta en Trello, el cambio se veía en el **dashboard**
de CCTV pero **no** en la ventana "Ejecución del programa". Ambas muestran datos de Trello.

Al abrir el código: las dos vistas se alimentan de **importadores distintos**:

- `platform/import-trello-support.js` (dashboard) → `fetch` **directo a la API de Trello**.
- `platform/import-trello-maintenance.js` ("Ejecución") → **no llamaba a la API**; leía una
  caché SQLite (`skylab-tareas.db`) que mantiene **otro servicio** (el backend de
  `CRM_Frontend/Table Trello`), que **no está desplegado en el servidor** y cuyo "calentador"
  (`refresh-trello-maintenance-cache.js`, un `require()` en proceso de ese otro backend) no
  puede funcionar dentro del contenedor `cctv-operational-worker`.

Resultado: la vista de mantenimiento llevaba **5 días** congelada (`maintenance_source_runs`
sin un run exitoso desde el 4-sep) mientras el dashboard estaba fresco al segundo. El
`GET /api/cctv/sync-status` marcaba `TRELLO: STALE` pero nadie lo miraba.

## Lección

- **Dos vistas del mismo dominio deben leer la misma fuente.** Si una lee la API y otra una
  caché intermedia mantenida por un tercer servicio, tarde o temprano divergen y el síntoma
  ("una se actualiza, la otra no") es confuso de diagnosticar.
- **Una caché sólo vale si algo la mantiene fresca *en el entorno donde se usa*.** El
  "calentador" existía pero dependía de código y credenciales de otro servicio que no viven
  en ese contenedor → caché muerta silenciosa.
- **`require()` en proceso de otro backend** (con su propio `node_modules`, `db/init` y `.env`)
  es un acoplamiento frágil que se rompe al contenerizar. Preferir una llamada HTTP o
  replicar el acceso a la fuente primaria.

## Acción

- `import-trello-maintenance.js` reescrito para leer la API de Trello directo, como soporte
  (spec 0008). Eliminado `refresh-trello-maintenance-cache.js`.
- Regla para el futuro: antes de introducir una caché entre una fuente y una vista, responder
  "¿qué proceso, en qué contenedor, con qué credenciales, la mantiene fresca?". Si la respuesta
  es "otro servicio", probablemente la vista debe ir a la fuente.
- El `sync-status` ya expone la frescura de cada fuente; convendría que una fuente `STALE`
  dispare una notificación (ver `specs/0007`, healthchecks).
