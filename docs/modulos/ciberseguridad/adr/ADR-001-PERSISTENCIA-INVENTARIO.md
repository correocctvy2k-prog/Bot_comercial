# ADR-001: persistencia canonica del inventario de activos

- Estado: aceptado
- Fecha: 2026-08-29
- Alcance: modulo Ciberseguridad de Skylab

## Contexto

El inventario inicial combina observaciones de FortiGate con informacion de
Kaspersky, Active Directory, Greenbone y revision humana. Las fuentes pueden
discrepar, reutilizar IPs, conservar registros antiguos o describir el mismo
activo con nombres diferentes. Una hoja de calculo no representa bien estas
relaciones ni su historial.

Skylab ya utiliza SQLite para persistencia operativa y su arquitectura futura
contempla PostgreSQL. Greenbone mantiene una base interna propia que no ofrece
un contrato estable para ser el inventario corporativo.

## Decision

1. El inventario canonico se persistira en una base relacional administrada por
   Skylab.
2. La primera implementacion usara SQLite por compatibilidad operacional.
3. El esquema evitara extensiones propietarias y se accedera mediante una capa
   de repositorios para facilitar una futura migracion a PostgreSQL.
4. Las fuentes escribiran primero observaciones inmutables o idempotentes de
   staging; una conciliacion separada promovera identidades canonicas.
5. XLSX se generara desde la base como artefacto de revision y exportacion.
6. La base interna de Greenbone no se consultara como fuente canonica ni se
   modificara fuera de sus interfaces soportadas.
7. Los archivos brutos no se almacenaran en Git ni como BLOB en la base. Se
   registraran su hash, fecha, tipo, clasificacion y referencia de custodia.

## Consecuencias positivas

- Trazabilidad de cada valor y decision de identidad.
- Historial de IP, MAC, hostname, sistema operativo y vigencia.
- Deteccion de conflictos y reutilizacion de identificadores.
- Exportaciones reproducibles.
- Separacion entre inventario, vulnerabilidades y motor de escaneo.

## Costos y riesgos

- Requiere reglas de conciliacion y una cola de revision humana.
- SQLite necesita transacciones breves, WAL, copias consistentes y un unico
  escritor coordinado.
- La migracion futura exige pruebas de tipos, restricciones e idempotencia.

## Alternativas descartadas

### XLSX como fuente principal

Descartada por concurrencia, duplicados, relaciones multivalor, auditoria
limitada y dificultad para mantener observaciones historicas.

### Base interna de Greenbone

Descartada porque pertenece al ciclo de vida de una herramienta externa y no
modela propiedad, fuentes corporativas ni decisiones de identidad de Skylab.

### PostgreSQL desde la primera captura

Pospuesta. Es la opcion prevista cuando haya varios escritores, mayor volumen o
alta disponibilidad, pero no es necesaria para validar el modelo y el flujo de
conciliacion inicial.

## Criterios para migrar a PostgreSQL

- Mas de un escritor concurrente sostenido.
- Bloqueos o tiempos de ingestion que afecten la operacion.
- Necesidad de alta disponibilidad o replicas.
- Volumen historico que vuelva costosas las consultas operativas.
- Integracion transaccional con el backend unificado de Skylab.
