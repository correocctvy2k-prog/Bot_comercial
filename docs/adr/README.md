# ADR — Architecture Decision Records

Registro de decisiones de arquitectura del ecosistema Skylab. Una decisión que cambia
stack, contratos, topología de red/puertos, modelo de configuración o de despliegue
**requiere un ADR** antes de implementarse (ver `docs/WORKING_MODEL.md`, §2 y §4).

## Cómo crear uno

1. `cp docs/adr/ADR-0000-template.md docs/adr/ADR-NNNN-slug.md`.
2. Rellenar contexto, decisión, consecuencias, alternativas.
3. Enlazarlo desde la spec que lo motiva y desde este índice.
4. Un ADR no se borra: si se revierte, se crea otro que lo marque como `Superado por ADR-XXXX`.

## Índice

| ID | Título | Estado | Fecha |
|----|--------|--------|-------|
| [ADR-0001](ADR-0001-modelo-sdd-y-gobernanza.md) | Modelo SDD, gobernanza multi-herramienta y pipeline local→PR→prod | Aceptado | 2026-09-07 |

## ADRs por módulo (históricos)

- Ciberseguridad: `docs/modulos/ciberseguridad/adr/ADR-001-*`, `ADR-002-*`.

## Estados

`Propuesto` → `Aceptado` → (`Superado por ADR-XXXX` | `Deprecado`).
