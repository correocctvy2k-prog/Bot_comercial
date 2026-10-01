# PLAN 0018 — Tarjetas de soporte que cubren varios puntos

Referencia: `spec.md` en esta misma carpeta.

## Enfoque técnico

`locationMatcher` hoy devuelve `{location, status}` (un solo punto o null).
Pasa a devolver `{locations: Location[], status}` — `locations` son todos los
candidatos cuyo nombre/alias aparece como palabra completa en el título
(ya no se descartan los que no son "el más largo"). `status` se simplifica:
`LINKED_NAME_EXACT` si `locations.length >= 1`, `UNLINKED` si 0. El estado
`AMBIGUOUS` deja de generarse por el matcher automático (dos nombres
empatados en longitud ahora son, correctamente, dos vínculos) — se conserva
en el esquema solo por si `LINKED_MANUAL` necesita volver a él en el futuro.

Alternativa descartada: mantener `location_id` único y agregar un campo
`related_location_ids` aparte. Se descarta por ser más confuso que una tabla
de unión estándar, y porque ya existe precedente de ese patrón en el propio
esquema (`cctv_tower_sites`, `site_id`+`location_id` como PK compuesta).

## Archivos a tocar

| Archivo | Cambio | Riesgo |
|---------|--------|--------|
| `cctv-automation-final/platform/schema.sql` | Tabla nueva `support_card_locations` (card_id, location_id, link_source, created_at; PK compuesta) | bajo (aditivo) |
| `cctv-automation-final/platform/trello-support.js` | `locationMatcher` devuelve array de locations en vez de uno solo | medio (cambia contrato de la función, hay que actualizar todos los llamadores) |
| `cctv-automation-final/platform/import-trello-support.js` | Inserta en `support_card_locations` por cada location devuelta; conserva `support_cards.location_id` = primer vínculo (compatibilidad) | medio |
| `cctv-automation-final/api/server.js` | `supportData()` adjunta `locations[]` por tarjeta (query a la tabla nueva); endpoint de vínculo manual pasa a INSERT aditivo + nuevo endpoint DELETE | medio |
| `CRM_Frontend/src/pages/CctvModule.jsx` | `RealSupport`/`SupportCardModal`: usar `locations[]`, mostrar chips de los puntos vinculados | medio |
| Dato: `location_aliases` | `DELETE` de la fila `alias_raw='Iglesia'` para `IGLESIA V.GORGONA` | bajo (dato, no código) |

## Contratos de datos / API

`GET /api/cctv/support` — cada item gana:
```json
{
  "locationId": "<primario, igual que hoy>",
  "location": "<nombre primario, igual que hoy>",
  "locations": [{ "id": "...", "name": "...", "zone": "..." }]
}
```
Los campos singulares (`locationId`/`location`/`zone`) se mantienen para no
romper nada que ya los consuma; `locations[]` es el array completo.

`POST /api/cctv/support/:id/link` — cambia de "reemplaza el vínculo" a
"agrega un vínculo" (`link_source='MANUAL'`). Nuevo
`DELETE /api/cctv/support/:id/link/:locationId` para quitar un vínculo
específico (manual o automático — un operador puede corregir un falso
positivo del matcher).

## Diseño / UI

Sin componente nuevo grande: el tile de la bitácora y `SupportCardModal` en
`CctvModule.jsx` ganan una fila de chips con los puntos vinculados (reusa el
patrón de chip/badge ya existente en el módulo, p.ej. `CategoryChips` de
`entityBits.jsx` si aplica, o un chip simple inline si no).

## Plan de rollout

1. Migración de esquema (tabla nueva) + corrección del alias "Iglesia".
2. Backend: matcher multi-punto, importador, API.
3. Script de re-proceso: correr el importador contra los datos ya en
   `cctv-staging.db` (re-matching de las 315 tarjetas existentes) para poblar
   `support_card_locations` con los vínculos reales que faltaban, con
   respaldo previo del `.db`.
4. Frontend: chips de puntos vinculados en Soporte.
5. `npm test` + lint/build + Docker local.
6. PR + deploy a `.65` (con el mismo re-proceso de datos allá).

## Plan de rollback

Revertir el commit; la tabla `support_card_locations` queda sin consumidores
si se revierte el código, no afecta nada existente. El `DELETE` del alias
"Iglesia" es el único cambio de datos no trivial de revertir — documentar el
alias eliminado en el commit por si hace falta reinsertarlo.

## Verificación

- Tests nuevos en `cctv-automation-final/tests/trello-support.test.js` (o el
  archivo de tests ya existente para este módulo) cubriendo el caso real de
  Iglesia (4 puntos con "Iglesia" en el nombre, un título que solo dice
  "Iglesia" no debe vincular a ninguno tras quitar el alias genérico; un
  título con el nombre completo de un punto específico sí).
- Re-proceso real contra `cctv-staging.db` (con respaldo previo), confirmar
  que las 14 tarjetas reales quedan vinculadas a todos los puntos esperados.
- Docker local: `GET /api/cctv/support` devuelve `locations[]` poblado;
  bitácora visual muestra las tarjetas multi-punto en cada punto.
