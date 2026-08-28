# Plan de integración CCTV en Skylab

> Estado detallado del módulo al 2026-08-21:
> `ESTADO-MODULO-CCTV-2026-08-21.md`. Próximas integraciones y criterios de
> aceptación: `ROADMAP-ECOSISTEMA-CCTV.md`.

## Fase 0 — Staging y conciliación

**Estado: implementada para las fuentes actuales.** La identidad del proyecto
de modernización quedó conciliada 58/58. Se mantiene revisión humana para
nuevas fuentes y alias.

- Importar ambos Excel sin modificarlos.
- Resolver los códigos SIIS y alias pendientes.
- Identificar agregados, filas anónimas y direcciones repetidas.
- Aprobar el catálogo maestro inicial.

## Fase 1 — Inventario

**Estado: primera versión funcional.** Hay API local, interfaz, alta manual de
instalaciones y activos, calidad, tecnologías y sincronización conceptual con
Operación de Puntos.

- API de ubicaciones, activos y canales.
- Cobertura CCTV por punto.
- Estado de calidad y última verificación.
- Vista restringida de topología, IP, serial y firmware.

## Fase 2 — Mantenimiento

**Estado: siguiente frente de integración.**

- Migrar el estado operativo del Excel a `maintenance_plan`.
- Registrar Trello primero en base de datos.
- Mantener compatibilidad temporal con el Excel.
- Adjuntar evidencia y hallazgos por activo/canal.

## Fase 3 — Eventos

**Estado: motor standalone funcional; persistencia canónica pendiente.**

- Persistir el pipeline de correo en `cctv_events`.
- Integrar DSS como fuente principal.
- Correlacionar horarios y contexto SIIS.
- Crear incidentes agrupados y alertas proactivas.

## Fase 4 — Inteligencia

**Estado: diseño.** Requiere estabilizar eventos y mantenimiento antes de
automatizar decisiones operativas.

- Salud técnica y detección temprana de fallos.
- Falsos positivos y degradación de cámaras.
- Cobertura faltante y priorización de inversión.
- ANPR, MVR y analítica humana según permisos y políticas.

## Condiciones antes de automatizar decisiones

- Identidad de ubicación validada por código SIIS.
- Cobertura de activos y canales medida.
- Zona horaria y reloj del dispositivo confiables.
- Idempotencia por fuente.
- Auditoría y rollback de cambios.
