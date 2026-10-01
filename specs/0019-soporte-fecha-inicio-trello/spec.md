# SPEC 0019 — Soporte: usar la fecha de inicio de Trello cuando no hay fecha "due"

- **Estado:** Implementado y verificado en local (Docker + re-proceso real
  contra la API de Trello en vivo), pendiente de PR/merge y de desplegar en `.65`
- **Autor:** Claude (a partir de un segundo reporte del usuario, tras spec 0018, 2026-10-01)
- **Fecha:** 2026-10-01
- **Módulos afectados:** `cctv-automation-final/platform/trello-support.js`,
  `cctv-automation-final/platform/import-trello-support.js`,
  `cctv-automation-final/platform/schema.sql`, `cctv-automation-final/api/server.js`,
  `CRM_Frontend/src/pages/CctvModule.jsx` (pestaña Soporte).
- **Rama:** `fix/0019-soporte-fecha-inicio-trello`
- **PR:** —

## 1. Problema / oportunidad

Tras desplegar la spec 0018 (vínculo a múltiples puntos), el usuario reportó
que la inconsistencia seguía: comparando el bucket "3 De Sept" de nuestra
bitácora contra la lista real "Eventos Septiembre 2026" de Trello, las 2
tarjetas no coincidían entre ambos lados.

**Investigado con datos reales contra la API de Trello en vivo** (no solo la
base local): confirmado que el fix de spec 0018 sí funciona (la tarjeta
"Guayacanes del Ingenio" aparece correctamente vinculada en ambos lados) —
esto es una causa raíz **distinta**, sobre qué fecha usa el sistema para
decidir en qué día cae cada tarjeta, no sobre a qué punto está vinculada.

Encontradas dos tarjetas reales de "Gestión Humana" con nombres parecidos:
- *"Se instaló placa de soporte electroimán..."* → `due` real en Trello:
  28 de agosto. Correcta en ambos lados.
- *"Instalación de soporte para magnético..."* → **sin `due` ni `start` en
  Trello** (ambos `null`), solo organizada a mano en la lista "Eventos Agosto
  2026". Su última actividad en Trello fue el 3 de septiembre (por una edición
  o cambio de estado ese día) — nuestro sistema usa esa fecha como respaldo y
  la tarjeta termina apareciendo en el bucket "3 De Sept", donde el usuario no
  la esperaba ver.

**Hallazgo más grave en el camino**: la tarjeta real *"Se realizó cambio de
tegnología... en el punto Cementerio Palmira"* tiene **fecha de inicio
("start") = 3 de septiembre**, un campo de Trello que nuestro importador
**nunca pedía a la API** (`fields` del `fetch` de tarjetas no incluía
`start`). Sin `due`, el sistema caía directo a "última actividad" — que para
esta tarjeta era **1 de octubre (hoy)**, casi un mes después del inicio real.
La tarjeta estaba efectivamente invisible en el bucket correcto.

**Alcance confirmado contra la API real** (ambos tableros, 281 tarjetas): 14
tarjetas tienen `start` pero no `due` (fecha real completamente ignorada
hoy); 17 no tienen ninguna de las dos (el respaldo a "última actividad" sigue
siendo lo único posible ahí, es una limitación real de los datos, no un bug).

## 2. Objetivo

Que la fecha operacional de una tarjeta use, en orden: `due` (fecha del
evento) → `start` (fecha de inicio) → última actividad (solo si Trello no
tiene ninguna fecha real) — nunca saltarse `start` directo a última
actividad, que puede estar semanas o meses desalineada del trabajo real.

## 3. Alcance

- `import-trello-support.js`: el `fetch` de tarjetas a la API de Trello pide
  también el campo `start`.
- `schema.sql`: columna nueva `support_cards.start_at`; migración automática
  (`ALTER TABLE ... ADD COLUMN`) para bases ya existentes, mismo patrón que
  `migrate-assets-fixed-code.js`.
- `trello-support.js` (`normalizeCards`): captura `startAt` desde `card.start`.
- `api/server.js` (`supportData()`): `operationalAt = due_at || start_at ||
  source_updated_at`; `dateSource` gana un tercer valor `'TRELLO_START'`.
- `CctvModule.jsx`: la etiqueta "Fuente de fecha" del detalle de la tarjeta
  distingue los 3 casos ("Fecha del evento" / "Fecha de inicio" / "Última
  actividad").
- Re-proceso de las tarjetas existentes (local y `.65`) para poblar
  `start_at` en las que ya estaban importadas.

## 4. No-objetivos

- Solo el tablero de Soporte (decisión explícita del usuario, confirmada vía
  `AskUserQuestion`) — no se revisa si el tablero de Mantenimiento (spec
  0008) tiene el mismo patrón de fechas ignoradas. Queda como pendiente a
  evaluar en otra ronda si aparece el mismo síntoma ahí.
- No se cambia nada del vínculo a puntos (spec 0018, ya verificado que
  funciona correctamente) ni la lógica de clasificación de actividad.
- Las 17 tarjetas sin `due` ni `start` siguen usando "última actividad" como
  mejor aproximación disponible — no hay forma de mejorar esto sin inventar
  una fecha que Trello no tiene.

## 5. Criterios de aceptación

- [x] El campo `start` de Trello se captura y persiste (`support_cards.
      start_at`).
- [x] `operationalAt` usa `due_at || start_at || source_updated_at`, en ese
      orden, verificado contra el caso real de "Cementerio Palmira"
      (`dateSource` pasa de implícitamente "última actividad" — 1 de octubre
      — a `TRELLO_START` — 3 de septiembre, correcto).
- [x] Migración automática aplica sin intervención manual sobre una base ya
      existente (confirmado: re-proceso local sin errores, 122 tarjetas
      actualizadas con su `start_at` nuevo).
- [x] `cctv-automation-final`: `npm test` en verde, con test nuevo para la
      captura de `start`.
- [x] `cd CRM_Frontend && npm run lint` + `npm run build` verdes, sin errores
      nuevos.
- [x] Verificado en Docker local contra datos reales re-procesados.

## 6. Restricciones de arquitectura y diseño

- Migración de esquema aditiva y automática (no requiere intervención manual
  como el alias de spec 0018), corre dentro del propio importador en cada
  ejecución, idempotente.
- Ningún dato se infiere — si Trello no tiene `due` ni `start`, se sigue
  usando honestamente "última actividad" como respaldo, nunca se inventa una
  fecha.

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| El mismo patrón (fechas `start`-only ignoradas) podría existir en el tablero de Mantenimiento | Medio | Fuera de alcance explícito de esta spec (decisión del usuario); queda como candidato a revisar si se reporta el mismo síntoma ahí. |

## 8. Impacto en producción

Cambia en qué día aparece una tarjeta sin `due` pero con `start` en la
bitácora (más preciso, no menos) — no quita información, solo deja de
ignorar un campo real de Trello. Requiere re-procesar las tarjetas existentes
en `.65` para poblar `start_at` retroactivamente. Rollback: revertir el
commit; la columna `start_at` queda sin usarse si se revierte, no rompe nada.
