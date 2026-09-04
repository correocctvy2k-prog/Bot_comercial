# Skylab Cybersecurity

Contexto acotado para inventario de activos, autorizaciones de escaneo y,
posteriormente, hallazgos de vulnerabilidades.

La especificacion funcional vive en
[`docs/modulos/ciberseguridad/`](../docs/modulos/ciberseguridad/README.md).

## Estado

El modulo contiene inventario con evidencia protegida de FortiGate y KSC,
autorizaciones de escaneo, respaldo verificado del estado y la primera etapa
del dominio de vulnerabilidades.

Los resultados Greenbone se pueden normalizar como evidencia append-only y
agrupar en casos de remediacion deterministas. La prioridad tecnica se conserva
separada del estado de tratamiento humano; por ejemplo, un caso `P1` puede
permanecer `TEMPORARILY_ACCEPTED` sin perder su severidad original.

El modulo todavia no inicia escaneos, no ejecuta correcciones sobre activos y
no consulta automaticamente la API o base operativa de Greenbone. Ya dispone
de contrato, importador y receptor protegido para recibir exportaciones
sanitizadas mediante un buzon desacoplado.

## Vulnerabilidades

- `src/vulnerability-normalizer.js`: normaliza ubicacion, CVE, QoD, causa y
  prioridad; agrupa multiples resultados de una misma causa tecnica.
- `src/vulnerability-importer.js`: persiste evidencia y casos en una unica
  transaccion idempotente.
- `cyber_vulnerability_findings`: evidencia inmutable del escaner.
- `cyber_remediation_cases`: flujo operativo de validacion, aceptacion,
  planificacion, remediacion y verificacion.
- `src/greenbone-protected-contract.js`: frontera de validacion que excluye
  identidades de red crudas y secretos.
- `src/greenbone-protected-receiver.js`: custodia por hash y recepcion sin red.
- `src/greenbone-protected-exporter.js`: pseudonimiza objetivos, sanitiza
  evidencia y publica contratos completos de forma atomica.

La clasificacion actual reconoce explicitamente el piloto Eclipse Jetty y la
configuracion TLS DHE. Las reglas genericas mantienen cada NVT separado hasta
que exista evidencia suficiente para agruparlo de forma segura.

## Verificacion

```bash
cd cybersecurity
npm test
npm run db:verify
```

Las bases runtime, exportaciones, capturas originales y fixtures privados estan
excluidos de Git.
