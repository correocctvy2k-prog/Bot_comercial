# Auditoría de integración Trello + Mantenimiento CCTV

Fecha de corte: 2026-08-22  
Modo de la primera integración: solo lectura

## Fuentes revisadas

- Módulo local `CRM_Frontend/Table Trello`.
- Caché SQLite `skylab-tareas.db`.
- Libro `2026 programacion anual CCTV.xlsx` y sus nueve hojas.
- Catálogo canónico CCTV/SIIS de `cctv-staging.db`.

## Estado encontrado

- Trello conserva 12 tableros en caché, pero solo dos listas están materializadas localmente: `Mantenimiento CCTV 2025` y `Mantenimiento CCTV 2026`.
- La lista 2026 tiene 12 tarjetas mensuales y 263 ítems de checklist.
- 168 ítems están completos y 95 pendientes: 64% del plan anual total.
- El libro anual reporta 263 mantenimientos, 194 programados al corte, 168 realizados y 86,60% de cumplimiento. Este porcentaje no representa avance anual total: divide realizados entre programados al corte.
- El vínculo más confiable disponible es el código SIIS al inicio del ítem. Los nombres presentan abreviaturas, guiones bajos, errores ortográficos y variantes.
- Trello y CCTV estaban configurados para usar el mismo puerto local `3003`; no deben ejecutarse como dos API independientes en ese puerto.
- La caché Trello revisada fue actualizada por última vez el 2026-08-21. Por ello la interfaz debe mostrar siempre la fecha de captura.

## Riesgos del sincronizador existente

1. Al consultar tarjetas de la lista 2026, el backend puede reconciliar y escribir en Excel; una lectura no es completamente libre de efectos secundarios.
2. El ítem se busca por texto y coincidencia aproximada cuando falta código. Esto puede seleccionar el punto equivocado.
3. El estado completo/incompleto se traduce directamente a `1/null` en Excel.
4. La idempotencia de escritura en Excel se deduce del `checkItemId` almacenado dentro de JSON y consultas `LIKE`, no de una restricción estructural.
5. Existen tarjetas mensuales duplicadas entre las listas 2025 y 2026; el año debe resolverse por `listId`, nunca solo por nombre de tarjeta.
6. `historial_cambios` estaba vacío, mientras `sync_log` contenía 344 registros: la auditoría de cambios de negocio aún es incompleta.
7. Los webhooks dependen de una URL local y no constituyen todavía un canal confiable de producción.

## Contrato canónico propuesto

Cada actividad de mantenimiento debe convertirse en una entidad independiente:

| Campo | Regla |
|---|---|
| `maintenance_id` | UUID interno Skylab |
| `location_id` | FK al catálogo canónico |
| `siis_code` | Identificador externo conservado como texto |
| `asset_id` | Opcional; activo específico cuando se conozca |
| `maintenance_type` | Preventivo, correctivo, instalación, diagnóstico o mejora |
| `scheduled_at` | Fecha programada normalizada |
| `status` | Planificado, en ejecución, realizado, reprogramado, cancelado |
| `trello_board_id` | ID persistente de tablero |
| `trello_list_id` | ID persistente de lista/año |
| `trello_card_id` | ID persistente de tarjeta/mes |
| `trello_check_item_id` | ID persistente de actividad; clave externa idempotente |
| `source_updated_at` | Marca temporal de la fuente |
| `evidence` | Adjuntos, fotografías, informe o firma |
| `sync_state` | Sincronizado, pendiente o conflicto |

La clave externa recomendada es `TRELLO + trello_check_item_id`. El nombre nunca debe ser la clave.

## Primera integración aplicada

- Endpoint CCTV `GET /api/cctv/maintenance`.
- Apertura directa de la base Trello en modo SQLite `readOnly`.
- Selección exacta de la lista `Mantenimiento CCTV 2026`.
- Cruce con ubicaciones únicamente por código SIIS exacto.
- Exposición de tareas no vinculadas como conflictos, sin coincidencia forzada.
- Nueva pestaña `Mantenimiento` en CCTV con KPIs, ejecución mensual y detalle de actividades.
- No se escribe en Trello ni en Excel.

## Siguiente fase segura

1. Actualizar la caché Trello mediante un proceso explícito de extracción sin efectos secundarios.
2. Importar actividades a tablas canónicas con `trello_check_item_id` único.
3. Conciliar manualmente ítems sin código o con código inexistente.
4. Agregar responsables, activos, evidencias y resultado técnico.
5. Habilitar escrituras hacia Trello solo detrás de una acción confirmada y con auditoría antes/después.
