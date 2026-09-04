# ADR-002: canal protegido para identidad Kaspersky

- Estado: implementado en piloto local
- Fecha: 2026-08-29
- Implementacion validada: 2026-08-31
- Alcance: KSC Hardware Inventory y modulo Ciberseguridad

## Contexto

El flujo `KSC-HARDWARE` publica en Skylab la informacion necesaria para el
dashboard de Monitoreo IT. El informe HTML original tambien contiene MAC,
serial y datos de hardware, pero el contrato JSON actual los descarta. Agregar
identificadores crudos al endpoint existente ampliaria la exposicion y
mezclaria presentacion operacional con identidad restringida.

El endpoint de Monitoreo usa HTTP interno y no constituye un canal apropiado
para credenciales, identificadores crudos ni material criptografico.

## Decision

1. `KSC-HARDWARE` conserva su contrato actual sin nuevos identificadores.
2. El recolector puede generar opcionalmente un archivo compañero de
   Ciberseguridad.
3. Hostname, MAC, serial y compuesto de hardware se transforman con
   HMAC-SHA-256 antes de abandonar SERV-KSC.
4. La clave HMAC tiene al menos 256 bits, vive fuera de Git y se referencia por
   una version de clave no secreta.
5. El archivo incluye hash SHA-256 del informe fuente, timestamps y version de
   esquema, pero nunca la ruta local del informe ni la clave.
6. La salida no se enviara por `/api/monitoring/upload`.
7. El transporte del piloto usa SFTP con usuario tecnico dedicado, clave SSH
   dedicada, host key fijada y directorio chroot sin acceso de shell.
8. La rotacion de clave no reescribe historia. Cada fingerprint conserva
   `identityKeyVersion`; la reindexacion se realiza mediante una captura nueva.

## Propiedades de seguridad

- HMAC evita exponer identificadores directamente y evita hashes sin clave
  susceptibles a tablas precalculadas.
- La seudonimizacion no anonimiza: los fingerprints siguen siendo datos
  restringidos y requieren control de acceso.
- La clave HMAC nunca se registra, transmite o incorpora al JSON.
- Un archivo de clave ausente, invalido o menor de 32 bytes causa fallo cerrado.
- La generacion es opcional y no afecta el dashboard.

## Implementacion del piloto

- Receptor: `skylab-scanner01` (`10.2.6.30`), usuario `skylabksc`.
- Origen de red unico: SERV-KSC (`192.168.8.42`) hacia TCP/22, sin NAT.
- La clave privada SFTP pertenece exclusivamente a `SYSTEM` en SERV-KSC.
- La tarea `Skylab_Monitor_Inventory` genera el archivo protegido a las 09:00
  sin cambiar el contrato enviado a Monitoreo IT.
- La tarea separada `Skylab_Cyber_KSC_Transfer` entrega a las 09:10 y puede
  reintentarse sin duplicar un archivo ya publicado.
- El nombre remoto combina `GeneratedAt` y SHA-256; la publicacion usa `.part`
  y `rename` atomico.
- Cada entrega correcta conserva una copia local en el archivo protegido de
  SERV-KSC.
- El receptor `0.1.1` se ejecuta cada cinco minutos como contenedor sin red y
  usuario no privilegiado; valida el contrato antes de importar a staging.
- La primera importacion protegida registro 158 observaciones, cero activos
  canonicos, cero autorizaciones y cero rechazos, con integridad SQLite valida.
- El estado cuenta con snapshots SQLite diarios verificados y serializados con
  la ingestion mediante un bloqueo comun. No existe borrado automatico.

## Pendiente operativo

- Definir y automatizar retencion en receptor y archivo local.
- Formalizar custodia, respaldo y rotacion de la clave HMAC.
- Integrar alertas para fallos del receptor y elementos en cuarentena.
- Ejecutar una prueba documentada de recuperacion y rotacion de claves.

## Criterios antes del despliegue

- Cuenta SFTP dedicada y sin shell interactiva.
- Host key fijada y validada en SERV-KSC.
- Permisos de directorio probados.
- Archivo temporal y renombrado atomico al completar la transferencia.
- Importador idempotente por hash antes de promover datos a staging.
- Prueba de rotacion y recuperacion de la clave.
- Runbook de desactivacion sin afectar `KSC-HARDWARE`.
