# Lecciones aprendidas

Registro append-only de tropiezos no obvios y sus reglas resultantes. Un archivo por
lección: `LL-NNNN-slug.md`. Se crea/actualiza en el mismo PR que el cambio que la originó
(Definition of Done, `docs/WORKING_MODEL.md` §4).

Qué merece una lección: algo que costó tiempo o rompió algo y **no era evidente de antemano**.
Qué no: lo que ya está en la doc de un módulo o en un ADR.

## Cómo crear una

1. `cp docs/lecciones-aprendidas/LL-0000-template.md docs/lecciones-aprendidas/LL-NNNN-slug.md`.
2. Rellenar. Ser concreto: rutas de archivo, comandos, mensajes de error.
3. Si la lección genera una regla permanente, reflejarla en `docs/WORKING_MODEL.md` o el ADR correspondiente.
4. Enlazarla en este índice.

## Índice

| ID | Título | Módulo | Fecha |
|----|--------|--------|-------|
| [LL-0001](LL-0001-config-build-time-vite.md) | La config del CRM_Frontend es build-time, no runtime | CRM_Frontend | 2026-09-07 |
| [LL-0002](LL-0002-cadena-de-ramas-sin-merge.md) | Cadena larga de ramas sin fusionar a `main` | Infra/Docs | 2026-09-08 |
| [LL-0003](LL-0003-resolver-telefono-enmascarado.md) | Resolver un teléfono enmascarado sin exponer el crudo ni cambiar el modelo | chatbot-analytics | 2026-09-08 |
