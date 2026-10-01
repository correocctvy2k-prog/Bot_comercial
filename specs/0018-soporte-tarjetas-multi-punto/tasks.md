# TASKS 0018 — Tarjetas de soporte multi-punto

Referencia: `spec.md` y `plan.md` en esta misma carpeta.

## Implementación

- [x] `schema.sql`: tabla `support_card_locations` (card_id, location_id,
      link_source, created_at; PK compuesta; FKs a `support_cards`/`locations`).
- [x] Dato: eliminar el alias "Iglesia" de `location_aliases` (IGLESIA V.GORGONA)
      — `scripts/fix-generic-alias-iglesia-20261001.js`, corrido con `--apply`.
- [x] `trello-support.js`: `locationMatcher` devuelve `{locations: [...], status}`,
      con contención de posición (LL-0010) para evitar los 43 pares reales de
      colisión por prefijo/sufijo entre puntos distintos.
- [x] `import-trello-support.js`: inserta en `support_card_locations` por cada
      location devuelta (`link_source` `MATCHED`/`MANUAL`); `support_cards.
      location_id` = primer vínculo, para compatibilidad.
- [x] `api/server.js`: `supportData()` adjunta `locations[]`; endpoint de
      vínculo manual pasa a INSERT aditivo; nuevo endpoint
      `DELETE /api/cctv/support/:id/link/:locationId`; `DELETE` agregado al
      allowlist de CORS.
- [x] `CctvModule.jsx`: bitácora (tile) y `SupportCardModal` muestran todos
      los puntos vinculados de cada tarjeta.

## Migración de datos reales

- [x] Backup de `cctv-staging.db` antes de re-procesar
      (`cctv-staging.pre-0018-fix-alias-<timestamp>.db`).
- [x] Re-corrido real del importador contra la API de Trello en vivo (no modo
      auditoría — el importador siempre escribe, es idempotente por diseño).
- [x] Confirmado `support_card_locations` poblada: 181 vínculos, 11 tarjetas
      reales multi-punto, verificado consultando la tabla directamente.

## Verificación

- [x] Tests nuevos para `locationMatcher` multi-punto (6 tests: multi-punto
      real, colisión por prefijo con las 43 reales confirmadas, caso real de
      Iglesia con y sin el alias genérico, vínculo manual aditivo).
- [x] `cctv-automation-final`: `npm test` — 110/110 en verde.
- [x] `cd CRM_Frontend && npm run lint`/`build` — 7 errores, todos
      preexistentes (confirmado comparando contra la versión sin estos
      cambios vía `git stash`), build verde.
- [x] Docker local: `cctv-api`/`crm-frontend` reconstruidos, `GET /api/cctv/
      support` confirmado con `locations[]` y 11 tarjetas multi-punto reales;
      `POST`/`DELETE` de vínculo manual probados end-to-end (agregar y quitar,
      estado revertido limpio); sin regresión en `/api/cybersecurity/towers`,
      `/api/cctv/health`, `/api/cctv/maintenance`.

## Documentación (Definition of Done)

- [x] `CHANGELOG.md` — sección "No publicado"
- [x] Ficha de módulo —
      `cctv-automation-final/docs/INTEGRACION-TRELLO-SOPORTE-2026.md`
- [x] Lección aprendida —
      `docs/lecciones-aprendidas/LL-0010-matcher-multi-punto-contencion.md`

## Cierre

- [x] PR abierto y enlazado en `spec.md` — [#26](https://github.com/correocctvy2k-prog/Bot_comercial/pull/26)
- [x] Merge a `main` (2026-10-01, `4706dcb`)
- [x] Desplegado y verificado en `.65` (2026-10-01): backup previo del `.db`,
      alias "Iglesia" eliminado, `cctv-api`/`cctv-operational-worker`/
      `cctv-visitor-worker`/`crm-frontend` reconstruidos, re-proceso real
      contra la API de Trello en vivo (desde dentro del contenedor —
      `.65` host no tiene salida directa a internet, solo los contenedores).
      **160 tarjetas vinculadas, 11 multi-punto confirmadas en producción
      real**, sin regresión en `/api/cybersecurity/towers`, `/api/cctv/health`,
      `/api/cctv/maintenance`.
- [x] Fix de seguimiento (`busy_timeout` faltante en el script de limpieza del
      alias, encontrado al correrlo contra la base real de `.65` con
      contenedores escribiendo activamente) — PR
      [`fix/0018-busy-timeout-script`](https://github.com/correocctvy2k-prog/Bot_comercial/pull/new/fix/0018-busy-timeout-script),
      aplicado directo en `.65` mientras tanto, sin bloquear el cierre.
