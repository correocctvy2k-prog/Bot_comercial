# Nota tecnica - IP en los reportes de Kaspersky Security Center

- Estado: investigacion cerrada por codigo, pendiente de confirmar en la consola de KSC
- Fecha: 2026-09-17

## Por que importa

Los 157 equipos que llegan por Kaspersky nunca traen direccion IP
(`ip_value` queda `NULL` en `cyber_asset_observations`, marcado con la
bandera de calidad `MISSING_IP`). Sin IP, un equipo Kaspersky no se puede
ubicar por si solo en una subred: solo aparece agrupado cuando se corrobora
por hostname exacto contra un equipo de FortiGate (`cross-source-matcher.js`,
ver `getKasperskyInheritedSegments` en `cybersecurity-read-model.js`). Si el
reporte de Kaspersky trajera IP, ese cruce dejaria de depender unicamente del
hostname.

## Que se revisó

Se inspeccionaron los dos scripts que hoy procesan datos de Kaspersky
Security Center (recuperados del historial de git; la carpeta local
`CRM_Frontend/Monitoreo/` ya no existe, se eliminó por decisión del usuario):

- `Monitor-KSC-HardwareInventory.ps1` — procesa el "Informe de hardware"
  exportado desde KSC. Parsea la tabla HTML de forma **genérica**: captura
  TODAS las columnas de encabezado en un diccionario (`$record`) y luego
  extrae explícitamente Nombre, Proveedor, Número de serie, Placa madre,
  Sistema operativo, Visible por última vez y Dirección MAC (con variantes
  con/sin tilde). En ningún punto busca "Dirección IP" ni una clave
  equivalente.
- `Monitor-SERV-KSC.ps1` — procesa el Informe de Amenazas y el Informe de
  Vulnerabilidades. Identifica equipos por nombre de dispositivo, no por IP;
  tampoco referencia ninguna columna de IP.

Ninguno de los dos ignora una columna de IP existente: si la tabla HTML la
trajera, quedaría capturada en `$record` de todas formas (el parseo es
genérico), pero ningún script la extrae hacia el JSON final porque nunca se
pide.

## Conclusión (con la evidencia disponible desde el código)

Los reportes de KSC que se usan hoy — "Informe de hardware", Amenazas y
Vulnerabilidades — no parecen incluir una columna de dirección IP. Esta
conclusión se apoya en que el autor de los scripts sí fue cuidadoso con
variantes de nombre para las demás columnas (MAC en español/inglés, con y
sin tilde); omitir IP por completo, con ese mismo cuidado en todo lo demás,
sugiere que la columna no existe en esos reportes, no que se pasó por alto.

**Límite de esta investigación**: no hay acceso directo a la consola de
Kaspersky Security Center desde este entorno. No se puede descartar que KSC
ofrezca *otro* tipo de reporte (p. ej. un inventario de red o lista de
dispositivos) que sí incluya IP y que ningún script actual esté leyendo
todavía.

## Pendiente

El usuario va a confirmar directamente en la consola de KSC si existe un
tipo de reporte con columna de IP disponible para exportar.

Si la respuesta es sí, los cambios necesarios son:

1. `Monitor-KSC-HardwareInventory.ps1`: agregar `Dirección IP`/`Direccion IP`
   a las claves que ya lee `Get-FirstRecordValue`, e incluir el valor en el
   objeto `Devices` que arma `Export-CyberHardwareInventory` (canal SFTP
   protegido) y en el resumen que sube a Monitoreo IT.
2. `cybersecurity/src/ksc-importer.js`: dejar de forzar la bandera
   `MISSING_IP` cuando el contrato sí trae IP, y persistir `ip_value` en
   `cyber_asset_observations`.
3. Con IP real, un equipo Kaspersky podría ubicarse en su subred sin
   depender del cruce por hostname contra FortiGate — revisar si conviene
   mantener igual el cruce actual (`cross-source-matcher.js`) como señal de
   corroboración adicional, no solo como única fuente de ubicación.

Si la respuesta es no (ningún reporte de KSC trae IP), este documento queda
como la constancia de que se investigó antes de asumirlo, y el cruce por
hostname (`getKasperskyInheritedSegments`) sigue siendo el mecanismo
definitivo para ubicar equipos Kaspersky en una subred.

## Enlaces

- `cybersecurity/scripts/pull-ksc-from-monitoring.js`
- `cybersecurity/src/ksc-importer.js`
- `cybersecurity/src/cross-source-matcher.js`
- `cybersecurity/src/cybersecurity-read-model.js` (`getKasperskyInheritedSegments`)
- [Runbook del receptor KSC protegido](./RUNBOOK-RECEPTOR-KSC-PROTEGIDO.md)
