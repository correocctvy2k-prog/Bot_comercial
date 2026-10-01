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
| [LL-0004](LL-0004-fuente-unica-por-vista.md) | Dos vistas del mismo dato, dos fuentes: una viva, otra muerta | cctv-automation-final | 2026-09-09 |
| [LL-0007](LL-0007-alter-table-rename-reescribe-fk.md) | `ALTER TABLE ... RENAME TO` en SQLite reescribe las FK de las tablas hijas | cybersecurity | 2026-09-18 |
| [LL-0008](LL-0008-deploy-65-seed-antes-de-rebuild.md) | En deploys con seed fuera del contenedor, sembrar antes de reconstruir (no después) | cybersecurity | 2026-09-30 |
| [LL-0009](LL-0009-ps1-ksc-powershell5-vs-pwsh.md) | `Monitor-KSC-HardwareInventory.ps1` falla en silencio con PowerShell 5.1, usar `pwsh` | Monitoreo IT | 2026-10-01 |
| [LL-0010](LL-0010-matcher-multi-punto-contencion.md) | Un matcher "todos los que calcen" necesita contención de posición, no solo quitar el límite viejo | Seguridad Electrónica (Soporte) | 2026-10-01 |
