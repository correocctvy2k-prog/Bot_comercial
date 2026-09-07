# AGENTS.md

Este repositorio trabaja bajo un **modelo único y obligatorio**, independiente de la
herramienta de IA que se use.

> **Antes de proponer o escribir cualquier cambio, lee y cumple
> [`docs/WORKING_MODEL.md`](docs/WORKING_MODEL.md).**

Reglas mínimas que no se negocian (el detalle está en el documento canónico):

1. **SDD**: nada se implementa sin una spec en `specs/NNNN-slug/`.
2. **Producto norte = `CRM_Frontend`**. Respeta la arquitectura base y
   `CRM_Frontend/docs/design-system.md`.
3. **Pipeline**: build dockerizado local en `http://127.0.0.1:3003/` y verificación →
   PR en GitHub → recién ahí producción `http://192.168.8.65:3003/`.
4. **Documenta el avance** en el mismo PR: `CHANGELOG.md`, ficha de módulo, ADR y
   lección aprendida cuando corresponda.
5. Nunca hagas commit directo a `main`. Nunca versiones `.env` ni secretos.

Definition of Done completo: sección 4 de `docs/WORKING_MODEL.md`.
