# Integración frontend CCTV

MVP visual para Skylab: resumen operativo y ficha integral del punto.

- Ruta principal: `/points/cctv`
- Detalle: `/points/cctv/:siisCode`
- Permiso heredado: `points`
- Datos actuales: snapshot explícito del corte conciliado del 20 de agosto de 2026.
- Próxima conexión: reemplazar el objeto `snapshot` por `/api/cctv/overview` y `/api/cctv/points/:siisCode`.

El snapshot evita presentar datos de demostración como información en vivo y no contiene IP, credenciales ni secretos.

## Evolución visual v2

El módulo adopta el ADN de Operación de Puntos sin duplicar su propósito:

- `Centro operativo`: salud CCTV, cobertura, carga por zona y puntos priorizados.
- `Inventario`: tarjetas expandibles con sistema, canales, tecnología, evidencia y acción.
- `Zonas`: cobertura, dispositivos, canales y casos por revisar.
- `Alertas`: severidad, fuente y siguiente acción; ningún caso se descarta automáticamente.
- `Proyecto`: avance explícito, incluyendo y diferenciando kits reutilizados.
- `Ficha integral`: identidad SIIS, infraestructura, eventos, mantenimiento y modernización.

Operación de Puntos responde por conectividad y funcionamiento del punto; CCTV profundiza en protección, evidencia, estado tecnológico y actuación técnica.
