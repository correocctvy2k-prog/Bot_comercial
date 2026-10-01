# PLAN 0019 — Usar `start` de Trello cuando no hay `due`

Referencia: `spec.md` en esta misma carpeta.

## Enfoque técnico

Trello expone dos fechas por tarjeta: `due` (fecha del evento/vencimiento) y
`start` (fecha de inicio) — independientes, una tarjeta puede tener solo una,
ambas o ninguna. El importador solo leía `due`. Se agrega `start` como campo
pedido a la API, columna nueva en `support_cards`, y un tercer nivel de
respaldo en la prioridad de fecha operacional.

Alternativa descartada: ignorar `start` y solo mejorar el mensaje "Última
actividad" para dejar claro que es aproximado. Se descarta porque Trello SÍ
tiene el dato real (`start`) para 14 tarjetas — no usarlo cuando existe sería
dejar pasar información real disponible, inconsistente con el principio del
proyecto de no aproximar cuando hay un dato exacto.

## Archivos a tocar

| Archivo | Cambio | Riesgo |
|---------|--------|--------|
| `cctv-automation-final/platform/import-trello-support.js` | `fields` del fetch de tarjetas pide `start`; migración automática `ALTER TABLE ADD COLUMN start_at`; upsert incluye `start_at` | bajo (aditivo) |
| `cctv-automation-final/platform/schema.sql` | `support_cards.start_at TEXT` en el `CREATE TABLE` (instalaciones nuevas) | bajo |
| `cctv-automation-final/platform/trello-support.js` | `normalizeCards` captura `startAt`; `fingerprint` lo incluye | bajo |
| `cctv-automation-final/api/server.js` | `operationalAt`/`dateSource` con prioridad due→start→última actividad | bajo |
| `CRM_Frontend/src/pages/CctvModule.jsx` | Etiqueta "Fuente de fecha" distingue los 3 casos | bajo |

## Contratos de datos / API

`GET /api/cctv/support` — cada item gana `startAt` (además de `dueAt` ya
existente); `dateSource` gana el valor `'TRELLO_START'`.

## Plan de rollout

1. Migración de esquema (automática, corre sola al importar).
2. Backend: fetch de `start`, prioridad de fecha.
3. Re-proceso real local contra la API de Trello en vivo (con backup previo).
4. Frontend: etiqueta de fuente de fecha.
5. `npm test` + lint/build + Docker local.
6. PR + deploy a `.65` (con el mismo re-proceso allá).

## Plan de rollback

Revertir el commit; `start_at` queda como columna sin usar, no rompe nada
existente (es aditiva, nunca reemplaza `due_at`).

## Verificación

- Test nuevo en `trello-support.test.js` para la captura de `start` con y sin
  `due` presente.
- Re-proceso real contra `cctv-staging.db` (con backup), confirmar que
  "Cementerio Palmira" (el caso real que motivó esta spec) queda con
  `start_at` poblado y `dateSource: 'TRELLO_START'` vía la API en vivo.
- Docker local: `GET /api/cctv/support` verificado contra el caso real.
