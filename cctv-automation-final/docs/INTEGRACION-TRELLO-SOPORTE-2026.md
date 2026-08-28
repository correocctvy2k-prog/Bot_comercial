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
- `support_identity_overrides`: conciliaciones manuales persistentes.

La clave idempotente es `TRELLO_SUPPORT + source_card_id`. La segunda
importación produjo 0 inserciones, 0 actualizaciones y 83 registros sin cambios.

## Clasificación

Las tarjetas se clasifican como instalación, CCTV/tecnología, alarma, red y
HapLite, control de acceso, energía/UPS o soporte general. El texto original se
preserva. La identidad solo se asigna cuando un nombre canónico o alias aparece
de forma exacta y no ambigua en el título.

## Operación

`npm run import:trello-support` actualiza la instantánea. El ciclo operativo la
ejecuta junto con mantenimiento cuando corresponde la actualización Trello. El
sondeo API se realiza cada minuto; la importación es idempotente para evitar
duplicados. El frontend consume `GET /api/cctv/support` desde la pestaña
**Soporte**.
