# ADR-003: Sitios físicos, cobertura DSS y aperturas compartidas

Fecha: 2026-08-26

## Decisión

La presencia de un punto en SIIS o en Operación de Puntos no confirma que tenga
CCTV. La cobertura `ACTIVE` exige evidencia técnica vinculada al inventario DSS
o una pertenencia explícita a un sitio físico que tenga dispositivos DSS.

Los registros heredados sin confirmación DSS se conservan como
`REPORTED_ACTIVE` para auditoría, pero no se cuentan ni se muestran como
cobertura confirmada en Inventario.

## Separación de entidades

- `locations`: códigos y operaciones SIIS.
- `physical_sites`: inmueble o instalación física compartida.
- `physical_site_members`: operaciones atendidas por el sitio y política de
  apertura.
- `dss_device_registry`: los 111 dispositivos observados en DSS, incluidos
  identificador, IP, tipo, modelo, organización y captura fuente.
- `assets`: dispositivos promovidos al inventario canónico cuando la identidad
  del punto o sitio es suficientemente confiable.

Una coincidencia dudosa nunca se promueve automáticamente. Permanece con estado
`UNLINKED` y aparece en el reporte de conciliación.

## Casos especiales iniciales

### Edificio Principal Palmira

- Sitio físico: `SITE-EDIFICIO-PPAL-PALMIRA`.
- Cuatro NVR confirmados, además de cámaras ANPR, cámara analítica y controlador
  de alarma visibles en DSS.
- Capacidad observada: más de 70 canales; se registra como mínimo observado y
  no como conteo exacto mientras no exista exportación de canales.
- Los códigos SIIS `2220` y `3055` comparten apertura: la primera señal válida
  de cualquiera se aplica a ambos.
- `3761`, Parqueadero El Ganador, comparte infraestructura física, pero conserva
  apertura independiente.

### Oficina Principal Pradera

- Sitio físico: `SITE-OFICINA-PRADERA`.
- Grabadores DSS: NVR `1000055` y DVR/XVR `1000046`.
- Los códigos SIIS `2039` y `3061` comparten apertura.

## Resultado de la primera conciliación

- Dispositivos DSS procesados: 111.
- Modelos conservados: 111.
- Vínculos automáticos o explícitos promovidos: 79.
- Pendientes de revisión manual: 32.

El detalle auditable está en
`reports/dss-canonical-reconciliation-latest.json`.
