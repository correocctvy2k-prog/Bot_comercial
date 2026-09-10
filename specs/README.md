# specs/ — Spec-Driven Development

Toda tarea que cambie comportamiento, UI, contratos o infraestructura empieza aquí.
El código es consecuencia de la spec.

## Flujo

1. `cp -r specs/TEMPLATE specs/NNNN-slug` (NNNN = siguiente correlativo de 4 dígitos).
2. Redactar `spec.md` → validar con quien pidió el cambio.
3. Redactar `plan.md` (técnico) y `tasks.md` (checklist).
4. Rama `feat/NNNN-slug` · implementar · marcar `tasks.md`.
5. PR en GitHub enlazando la carpeta de la spec. Merge solo con CI verde y Definition of Done.

Fix trivial: `spec.md` ligero de 5 líneas, sin `plan.md`/`tasks.md`.

Detalle del modelo: [`../docs/WORKING_MODEL.md`](../docs/WORKING_MODEL.md).

## Índice

| ID | Título | Estado | Módulos afectados |
|----|--------|--------|-------------------|
| [0001](0001-modelo-de-trabajo-sdd/spec.md) | Modelo de trabajo SDD y gobernanza | Publicada | repo, docs, CI, CRM_Frontend |
| [0002](0002-analitica-agentes-ranking/spec.md) | Ranking de Analítica de Agentes | Publicada | CRM_Frontend |
| [0003](0003-estandarizacion-interfaz/spec.md) | Estandarización de interfaz de los módulos | Publicada (parcial) | CRM_Frontend |
| [0004](0004-integracion-analitica-chatbots/spec.md) | Integración de analítica de chatbots (Oskitar/Betty) | Publicada | CRM_Frontend, `chatbot-analytics` |
| [0005](0005-bots-gane-palmira/spec.md) | Módulo "Bots Gane Palmira" (detalle, consistencia, ficha por bot) | Publicada | CRM_Frontend, `chatbot-analytics` |
| [0006](0006-polish-tipografia-ranking/spec.md) | Polish: tipografía de encabezados, avatar de bot, ranking Top 5 | Publicada | CRM_Frontend |
| [0007](0007-endurecer-proceso-desarrollo/spec.md) | Endurecer el proceso de desarrollo | Borrador (roadmap) | repo, CI, `ops/`, docs |
| [0008](0008-cctv-mantenimiento-refresco/spec.md) | CCTV/Mantenimiento: "Ejecución del programa" muestra datos de hace días | En revisión | `cctv-automation-final` |
| [0009](0009-bots-tiempo-real-rediseno/spec.md) | Bots Gane Palmira: tiempo real y rediseño premium | Publicada | CRM_Frontend, `chatbot-analytics` |
| [0010](0010-eventos-diarios-interpretacion/spec.md) | CCTV/Eventos diarios: interpretación operativa por ventanas + ping | Validada | `cctv-automation-final`, CRM_Frontend |

## Estados

`Borrador` → `Validada` → `En progreso` → `En revisión` (PR) → `Hecha` (merge) → `Publicada` (prod).
