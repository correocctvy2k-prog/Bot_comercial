# Integración Trello · Soporte 2026

Implementada el 2026-08-24 como una importación de solo lectura hacia el modelo
canónico CCTV. No crea, mueve ni modifica tarjetas Trello.

## Fuente y resultado inicial

- Tablero: `Soporte 2026`.
- Listas: 9.
- Tarjetas activas: 83.
- Tareas pendientes: 15.
- Actividades ejecutadas: 68.
- Identidades vinculadas automáticamente: 35.
- Sin vínculo forzado: 48.

## Modelo

- `support_source_runs`: historial auditable de importaciones.
- `support_cards`: instantánea normalizada y clasificación operativa.
  `location_id`/`identity_status` son el vínculo **primario** (compatibilidad
  con consumidores que no distinguen multi-punto, ver spec 0018).
- `support_card_locations` (spec 0018, 2026-10-01): una tarjeta puede cubrir
  **varios puntos reales** a la vez (ronda de mantenimiento que menciona
  varios locales en el mismo título) — tabla de unión tarjeta↔punto,
  `link_source` `MATCHED` (detectado en el título) o `MANUAL`. Es la fuente
  completa para la bitácora visual de la pestaña Soporte; `support_cards.
  location_id` solo expone el primero.
- `support_identity_overrides`: conciliaciones manuales persistentes — se
  **suman** a los vínculos automáticos, ya no los reemplazan.

La clave idempotente es `TRELLO_SUPPORT + source_card_id`. La segunda
importación produjo 0 inserciones, 0 actualizaciones y 83 registros sin cambios.

## Clasificación

Las tarjetas se clasifican como instalación, CCTV/tecnología, alarma, red y
HapLite, control de acceso, energía/UPS o soporte general. El texto original se
preserva. La identidad se asigna a **todos** los puntos cuyo nombre canónico o
alias aparece de forma exacta en el título (spec 0018) — antes solo se
vinculaba al de nombre más largo, perdiendo en silencio los demás cuando una
tarjeta real cubría varios puntos (hallazgo real: 11 de 315 tarjetas). Para
evitar que un nombre corto que es prefijo de otro punto distinto (p.ej.
"OFICINA PRINCIPAL" dentro de "OFICINA PRINCIPAL AMAIME", 43 pares
confirmados) se cuente como mención aparte, una coincidencia se descarta si su
tramo de texto queda contenido dentro de la coincidencia de otro punto con
nombre más largo en esa misma posición — menciones realmente independientes
(otra posición del título) sí se conservan todas.

## Operación

`npm run import:trello-support` actualiza la instantánea. El ciclo operativo la
ejecuta junto con mantenimiento cuando corresponde la actualización Trello. El
sondeo API se realiza cada minuto; la importación es idempotente para evitar
duplicados. El frontend consume `GET /api/cctv/support` desde la pestaña
**Soporte** — cada tarjeta expone `locations: [{id,name,zone}]` con todos sus
puntos vinculados, además de `locationId`/`location` (el primario, por
compatibilidad).

`POST /api/cctv/support/:id/link` agrega un vínculo manual (ya no reemplaza
los automáticos). `DELETE /api/cctv/support/:id/link/:locationId` quita un
vínculo específico (automático o manual) — útil para corregir un falso
positivo puntual sin esperar al próximo re-proceso.
