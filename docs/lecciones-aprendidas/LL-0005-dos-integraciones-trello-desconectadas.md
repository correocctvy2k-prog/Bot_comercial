# LL-0005 — Dos integraciones de Trello viviendo en paralelo, sin que nadie lo supiera

- **Fecha:** 2026-09-23
- **Contexto:** `specs/0016-mantenimiento-excel-sync/` — CCTV / Mantenimiento.

## Qué pasó

El usuario reportó que el Excel de seguimiento de mantenimiento nunca se actualiza, aunque la
pestaña "Mantenimiento" del CRM sí muestra los cambios de Trello casi en tiempo real.

Al investigar, la UI real (`CctvModule.jsx`) lee de `cctv-automation-final` (spec 0008: sondeo
directo a la API de Trello cada ~1 minuto). La lógica de escritura a Excel —matching de puntos,
recálculo de fórmulas, detección de archivo bloqueado— vivía en un proyecto completamente
distinto, `CRM_Frontend/Table Trello/backend/`, con su propio Kanban aparte que nadie usa a
diario, y dependía de un webhook de Trello que la propia documentación del proyecto (`fase
2/ESTADO_ACTUAL.md`) tenía marcado como **nunca confirmado activo**.

Es decir: existían dos integraciones de Trello para el mismo tablero, construidas en momentos
distintos, sin que ninguna reemplazara formalmente a la otra ni se documentara la relación entre
ellas. Cuando la primera (spec 0008) resolvió el problema de "la vista queda vieja" leyendo
Trello directo, nadie notó que eso dejaba a la segunda (la que sabía escribir a Excel) sin
ningún dato fresco que procesar.

## Lección

Cuando se resuelve un problema creando una **segunda vía de lectura** para no depender de un
sistema viejo que falla, hay que auditar explícitamente qué otras capacidades dependían del
sistema viejo (en este caso, la escritura a Excel dependía del webhook que llegaba al backend
antiguo) — si no, esas capacidades quedan huérfanas en silencio, sin ningún error visible,
porque el código que fallaría ya ni siquiera se ejecuta.

## Acción

Al construir spec 0016, la sincronización a Excel se reenganchó directamente al pipeline vivo
(spec 0008) en vez de intentar reparar el webhook del sistema viejo — la fuente de verdad para
"qué cambió en Trello" debe ser una sola.
