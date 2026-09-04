# Modulo - Ciberseguridad

Estado: inventario protegido y normalizacion inicial de vulnerabilidades, 2026-08-31

## Proposito

Consolidar el inventario tecnico y la postura de vulnerabilidades de Skylab sin
convertir una fuente operacional aislada en verdad corporativa. El modulo debe
correlacionar FortiGate, Kaspersky, Active Directory, Greenbone y fuentes
manuales, conservar la procedencia de cada dato y limitar los escaneos a
alcances expresamente autorizados.

## Principios

- La base de Skylab es la fuente canonica; Greenbone no lo es.
- Una observacion no crea ni retira por si sola un activo canonico.
- Toda afirmacion conserva fuente, instante, captura y nivel de confianza.
- La identidad prevalece sobre el nombre visible o la IP actual.
- La ausencia genera candidatos de revision, nunca bajas automaticas.
- La autorizacion de escaneo forma parte del modelo de datos.
- La evidencia del escaner es inmutable; el tratamiento del riesgo es mutable y auditable.
- Varios CVE de una misma causa tecnica forman un caso de remediacion sin perder su evidencia individual.
- Los datos brutos y secretos no se versionan en Git.
- XLSX es una vista de revision y exportacion, no la persistencia principal.

## Documentos SDD

- [ADR-001: persistencia del inventario](./adr/ADR-001-PERSISTENCIA-INVENTARIO.md)
- [ADR-002: canal KSC protegido](./adr/ADR-002-CANAL-KSC-PROTEGIDO.md)
- [Especificacion del inventario de activos](./SPEC-INVENTARIO-ACTIVOS.md)
- [Runbook del receptor KSC protegido](./RUNBOOK-RECEPTOR-KSC-PROTEGIDO.md)
- [Runbook del receptor Greenbone protegido](./RUNBOOK-RECEPTOR-GREENBONE-PROTEGIDO.md)
- [Runbook del exportador Greenbone protegido](./RUNBOOK-EXPORTADOR-GREENBONE-PROTEGIDO.md)
- [Interfaz Skylab Cybersecurity MVP](./INTERFAZ-CIBERSEGURIDAD-MVP.md)

## Limites de la primera fase

Incluye:

- Registro de fuentes y capturas.
- Observaciones normalizadas de activos e identificadores.
- Identidad canonica con conciliacion auditable.
- Segmentos, clasificacion y autorizaciones de escaneo.
- Calculo explicable de vigencia.
- Exportacion XLSX sanitizada.
- Normalizacion de resultados Greenbone y agrupacion inicial por activo, causa y puerto.
- Estados de tratamiento desde `NEW` hasta `VERIFIED`, incluida aceptacion temporal.

No incluye todavia:

- Escaneos masivos o automaticos.
- Acciones de remediacion sobre equipos.
- Enriquecimiento automatico con KEV, EPSS o MITRE ATT&CK.
- Priorizacion contextual con criticidad de negocio y exposicion de red.
- Importacion directa a tablas canonicas sin staging.
- Exposicion de Greenbone a la LAN o Internet.
- Integracion productiva con credenciales de FortiGate.

## Informacion sensible

IPs, MAC, hostnames, usuarios, topologia, versiones y hallazgos se clasifican
como informacion interna restringida. Las capturas originales se conservan en
almacenamiento operativo con acceso limitado y retencion definida. La base
solo almacena una referencia opaca y el hash SHA-256; nunca credenciales.
