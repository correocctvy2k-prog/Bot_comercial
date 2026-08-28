# ADR-001 — Identidad de ubicaciones e integración SIIS

- Estado: aceptada
- Fecha: 2026-08-20
- Alcance: CCTV Automation / futuro módulo CCTV de Skylab

## Contexto

Los puntos aparecen con nombres diferentes en SIIS, DSS, inventarios, correos,
mantenimiento y Trello. Las IP cambian y algunos equipos comparten una misma
dirección de registro. Por tanto, ni el nombre ni la IP son identidades de negocio.

La implementación actual de Skylab ya relaciona `puntos_venta.siiss_id` con
`estacodi` y utiliza `estaping` como señal de conectividad. CCTV necesita reutilizar
esa identidad sin acoplarse al mecanismo actual de actualización de estados.

## Decisión

1. `locations.id` será la identidad interna estable.
2. `locations.siis_code` almacenará `estacodi` como texto y será único cuando exista.
3. Los nombres de cada fuente vivirán como alias trazables; no crearán relaciones
   automáticas salvo coincidencia exacta previamente aprobada.
4. Las respuestas SIIS ingresarán primero en `stg_siis_locations` y nunca se
   promoverán directamente al catálogo canónico.
5. La extracción SIIS, la conciliación y la actualización operativa serán pasos
   independientes e idempotentes.
6. `estaping` es una señal operativa de SIIS; no demuestra por sí sola que el CCTV
   esté funcionando ni reemplaza el estado del DSS.

## Seguridad

- `SIISS_URL`, `SIISS_USER` y `SIISS_PASS` deben ser obligatorias en el backend.
- No se permiten valores de credenciales de respaldo dentro del repositorio.
- Tokens y contraseñas no se guardan en staging, logs, Excel ni payloads auditables.
- El frontend nunca debe autenticarse directamente contra SIIS.

## Consecuencias

- La conciliación inicial requiere revisión humana, pero queda auditable.
- Es posible combinar SIIS, DSS y eventos sin confundir identidades ni estados.
- Una caída de SIIS no modifica identidades ni elimina el último estado conocido.

