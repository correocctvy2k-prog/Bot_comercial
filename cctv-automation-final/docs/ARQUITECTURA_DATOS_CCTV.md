# Arquitectura de datos CCTV para Skylab

## Objetivo

Construir una fuente confiable para inventario, eventos, mantenimiento y
automatización CCTV sin convertir nombres de Excel, correos o Trello en
identificadores definitivos.

## Principios

1. El código SIIS identifica la ubicación empresarial cuando exista.
2. Cada activo conserva sus identificadores de origen: DSS, serial, IP,
   correo, Trello y archivo/fila.
3. Los Excel entran primero a `staging`; nunca se promueven automáticamente.
4. Una coincidencia aproximada es una sugerencia, no una decisión.
5. El evento crudo se conserva y el evento normalizado puede evolucionar.
6. El correo es una fuente redundante; DSS deberá ser la fuente técnica
   principal cuando se habilite su integración.

## Capas

```text
SIIS ───────────────┐
DSS ────────────────┤
Correo Dahua ───────┼──> Staging / evidencia ──> Catálogo canónico
DATOS CCTV.xlsx ────┤                                  │
Programación 2026 ──┤                                  ├─> Eventos y salud
Trello ─────────────┘                                  └─> Mantenimiento
```

## Identidad

### Ubicación

- `locations.id`: UUID interno de Skylab.
- `locations.siis_code`: código empresarial estable.
- `canonical_name`: nombre aprobado para interfaz.
- `location_aliases`: nombres usados por Excel, DSS, correos y Trello.

### Activo

`assets` representa NVR, DVR, MVR, cámara independiente, panel de alarma,
sensor, ANPR, servidor o equipo de red. Un activo puede depender de otro,
por ejemplo una cámara conectada a un NVR.

### Canal

`channels` representa video, entrada de alarma, salida, audio o analítica.
Separar canal de activo permite modelar grabadores con capacidades mixtas.

### Evento

`cctv_events` usa `(source_system, source_event_id)` como clave idempotente.
La referencia cruda permite auditar el correo o identificador DSS original.

## Flujo de promoción

1. Ejecutar `npm run import:staging`.
2. Revisar `reports/reconciliation-latest.md`.
3. Resolver primero por código SIIS.
4. Aprobar o rechazar alias sugeridos.
5. Crear ubicación canónica solo cuando la identidad sea verificable.
6. Asociar activos y fuentes a esa ubicación.
7. Ejecutar controles de duplicados y cobertura.

## Integración con mantenimiento

El módulo `Table Trello` ya sincroniza checklists con el Excel anual. La
transición recomendada es:

```text
Trello Webhook -> maintenance_execution -> Skylab
                                      └-> exportación/compatibilidad Excel
```

Durante la transición, el Excel puede seguir recibiendo actualizaciones,
pero la base de datos debe registrar primero la operación, su idempotencia,
el usuario/fuente y el resultado de la escritura.

## Integración con Operación de Puntos

Operación de Puntos y CCTV comparten la misma ubicación; CCTV no mantiene una
copia independiente de nombre, zona o tipo. El alta manual de instalaciones,
la derivación de cobertura y la sincronización funcional se especifican en
`ADR-002-PUNTOS-CCTV-FUENTE-COMPARTIDA-Y-ALTA-MANUAL.md`.

## Seguridad

- IP, serial, SIM y topología: clasificación interna restringida.
- Credenciales: nunca deben entrar a staging ni reportes.
- La interfaz debe enmascarar IP y SIM según rol.
- Toda promoción, edición de activo y mantenimiento debe quedar auditada.
- Las copias locales de fuentes corporativas deben tener retención definida.

## Migración futura

El esquema inicial usa SQLite por compatibilidad con `Table Trello`. Las
tablas evitan características propietarias para facilitar una migración a
PostgreSQL cuando el backend unificado de Skylab lo requiera.
