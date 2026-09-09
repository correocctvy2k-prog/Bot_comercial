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
| [0001](0001-modelo-de-trabajo-sdd/spec.md) | Modelo de trabajo SDD y gobernanza | En progreso | repo, docs, CI, CRM_Frontend |

## Estados

`Borrador` → `Validada` → `En progreso` → `En revisión` (PR) → `Hecha` (merge) → `Publicada` (prod).
