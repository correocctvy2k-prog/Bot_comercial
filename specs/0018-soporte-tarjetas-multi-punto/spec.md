# SPEC 0018 — Seguridad Electrónica / Soporte: tarjetas que cubren varios puntos ya no se pierden

- **Estado:** Implementado y verificado en local (Docker + re-proceso real
  contra la API de Trello en vivo), pendiente de PR/merge y de desplegar en `.65`
- **Autor:** Claude (a partir del reporte del usuario, 2026-10-01)
- **Fecha:** 2026-10-01
- **Módulos afectados:** `cctv-automation-final/platform/trello-support.js`,
  `cctv-automation-final/platform/import-trello-support.js`,
  `cctv-automation-final/platform/schema.sql`, `cctv-automation-final/api/server.js`,
  `CRM_Frontend/src/pages/CctvModule.jsx` (pestaña Soporte).
- **Rama:** `fix/0018-soporte-tarjetas-multi-punto`
- **PR:** —

## 1. Problema / oportunidad

El usuario reportó (2026-10-01): en Seguridad Electrónica → pestaña Soporte, los
datos de las tarjetas de Trello y la "bitácora visual de soporte" se están
"mezclando" entre sí — un problema de confiabilidad grave.

**Investigado contra datos reales** (`cctv-automation-final/data/cctv-staging.db`,
315 tarjetas de los tableros "Soporte 2025"/"Soporte 2026"):

`locationMatcher` (`platform/trello-support.js`) vincula cada tarjeta al punto
cuyo nombre/alias aparece en el título. Cuando el título menciona **varios
puntos reales** (común en tarjetas de ronda, p.ej. "cambio de direccionamiento
en los puntos de venta: Cementerio; obrero 1, licores 1..."), el código elige
**en silencio** el nombre más largo que encuentra y descarta los demás — sin
marcarlo como ambiguo, sin avisar a nadie.

**Encontrado y confirmado con datos reales**: 14 tarjetas reales mencionan más
de un punto (de 315 totales); 9 de ellas ya estaban vinculadas (incorrectamente,
solo a uno) y 4 estaban marcadas `AMBIGUOUS` (sin vincular a ninguno) por el
mismo motivo — dos candidatos empatados en longitud. Ejemplos reales:

- *"Cambio de direccionamiento en los puntos de venta: Cementerio; obrero 1,
  licores 1, mariacano, papayal, metro, popular modelo, zamorano III"* →
  archivada solo en "POPULAR MODELO II"; los otros 6 puntos mencionados nunca
  ven esta tarjeta en su bitácora.
- *"Revisión y prueba con los botones de pánico de los puntos ofi poblado
  campestre, ofi Carmelo, ofi Villagorgona, ofi Candelaria y Oficina Florida"*
  → archivada solo en "FLORIDA PRINCIPAL".

**Hallazgo secundario**: el punto "IGLESIA V.GORGONA" tiene registrado el
alias **"Iglesia"** (una sola palabra genérica) — hay otros 3 puntos cuyo
nombre también contiene "Iglesia" (Prado Iglesia II, Emilia Iglesia, Zamorano
Iglesia). Con el matcher actual esto ya causa coincidencias secundarias
espurias; al pasar a vincular por todos los nombres mencionados (no solo el
más largo), este alias multiplicaría el problema si no se corrige primero.

## 2. Objetivo

Que una tarjeta de soporte que realmente cubre varios puntos aparezca en la
bitácora de **todos** los puntos que menciona, no solo de uno — decisión
explícita del usuario (confirmada vía pregunta directa, 2026-10-01): "vincular
a todos los puntos mencionados", en vez de solo marcar para revisión manual.

## 3. Alcance

- `trello-support.js`: `locationMatcher` devuelve **todos** los puntos cuyo
  nombre/alias aparece en el título (ya no solo el de nombre más largo). Esto
  también resuelve de forma natural los 4 casos hoy `AMBIGUOUS` (dos nombres
  empatados en longitud → antes ninguno, ahora ambos).
- Dato: corregir el alias genérico "Iglesia" de "IGLESIA V.GORGONA" (eliminar
  esa fila de `location_aliases`) antes de activar el matcher multi-punto, para
  no multiplicar falsos positivos.
- Esquema: tabla nueva `support_card_locations` (relación muchos-a-muchos
  tarjeta↔punto, con `link_source` `MATCHED`/`MANUAL`). `support_cards.location_id`
  se conserva como "vínculo primario" (compatibilidad con los consumidores que
  no se tocan en esta spec, ver §4), pero deja de ser la única fuente de verdad
  para la pestaña Soporte.
- `GET /api/cctv/support`: cada tarjeta expone `locations: [{id, name, zone}]`
  (todos sus puntos vinculados), además de los campos singulares existentes.
- `CctvModule.jsx` (pestaña Soporte, "Bitácora visual de soporte" + filtro por
  punto si existe): usar `locations[]` para que la tarjeta aparezca en la
  bitácora de cada punto vinculado, mostrando los demás puntos como contexto.
- Endpoint de vínculo manual (`POST /api/cctv/support/:id/link`): pasa de
  "reemplazar el único vínculo" a "agregar un vínculo" (inserta en la tabla de
  unión); nuevo endpoint para quitar un vínculo manual específico.
- Migración de datos: re-procesar las 315 tarjetas existentes con el matcher
  nuevo para poblar `support_card_locations` (incluye los 14 casos reales ya
  identificados).

## 4. No-objetivos

- No se tocan `evidenceByLocation` (`platform/project-evidence.js`, usado para
  evidencia de apertura/cierre operativo) ni el generador de notificaciones
  (`operational_notifications`, `api/server.js` línea ~93) — ambos siguen
  usando `support_cards.location_id` (el vínculo primario) sin cambios. Son
  consumidores distintos, no la pestaña Soporte que el usuario reportó. Si se
  decide extenderlos a multi-punto, es una spec aparte.
- No se audita la calidad de los 581 aliases existentes más allá del caso
  "Iglesia" ya confirmado como colisión real. Queda como riesgo residual
  documentado (§7), no como tarea de esta spec.
- No se cambia la clasificación `activity_type` (`classify()`) ni el resto de
  la lógica de importación de Trello.

## 5. Criterios de aceptación

- [x] Las tarjetas reales que mencionan varios puntos aparecen vinculadas a
      **todos** los que mencionan (11 confirmadas tras re-procesar contra la
      API real de Trello, no datos sintéticos).
- [x] El alias "Iglesia" ya no existe como alias aislado de un solo punto.
- [x] `GET /api/cctv/support` devuelve `locations[]` por tarjeta.
- [x] La "Bitácora visual de soporte" (pestaña Soporte) y el modal de detalle
      muestran todos los puntos vinculados de cada tarjeta.
- [x] `cctv-automation-final`: `npm test` — 110/110 en verde, con 6 tests
      nuevos para `locationMatcher` multi-punto (incluye el caso real de
      Iglesia y el de colisión por prefijo).
- [x] `cd CRM_Frontend && npm run lint` + `npm run build` verdes, sin errores
      nuevos (7 preexistentes, confirmados sin cambio).
- [x] Verificado en Docker local (`http://127.0.0.1:3003/`) contra los datos
      reales re-procesados — incluye prueba end-to-end de los endpoints de
      vínculo manual (agregar y quitar).

## 6. Restricciones de arquitectura y diseño

- Migración de esquema aditiva (tabla nueva), sin romper columnas existentes
  que otros consumidores (`evidenceByLocation`, notificaciones) siguen usando.
- Ningún dato se infiere o se inventa — un punto solo se vincula si su
  nombre/alias aparece realmente en el texto del título, igual que hoy.

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| Otros aliases genéricos de una sola palabra (p.ej. "Hospital", "Policía") podrían causar colisiones similares a "Iglesia" en el futuro, no detectadas aún | Medio | Documentado como riesgo residual, no bloqueante; se corrige el caso confirmado (Iglesia). Recomendación: revisión periódica de aliases cortos contra nombres de otros puntos. |
| Migrar `support_card_locations` desde datos ya importados podría duplicar vínculos si se corre más de una vez | Bajo | `PRIMARY KEY(card_id, location_id)` + `INSERT OR IGNORE`/upsert idempotente, mismo patrón que el resto del importador. |

## 8. Impacto en producción

Cambia qué tarjetas aparecen en la bitácora de cada punto en la pestaña
Soporte (más completo, no menos) — no quita vínculos existentes, solo agrega
los que faltaban. Requiere migración de datos (re-procesar tarjetas) en `.65`
al desplegar. Rollback: revertir el commit del backend/frontend; la tabla
nueva queda sin usarse si se revierte (no rompe nada existente).
