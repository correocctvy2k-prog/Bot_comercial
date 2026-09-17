# Nota tecnica - IP en los reportes de Kaspersky Security Center

- Estado: **resuelto** — el "Informe del estado de la protección" es un reporte real por
  dispositivo (173 de 173, sin truncar) y trae IP para 172 de 173 equipos. Ver "Actualización
  2026-09-17 (tercera parte)" más abajo. Este es el reporte a usar como fuente de IP; los otros
  dos (Vulnerabilidades, Amenazas) quedan descartados para este propósito por cobertura
  insuficiente.
- Fecha: 2026-09-17 (actualizada el mismo día, tres veces, tras exports reales del usuario)

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

## Actualización 2026-09-17 — confirmado en la consola: el Informe de vulnerabilidades sí trae IP

El usuario revisó "Propiedades → Campos → Campos Detalles" del **Informe de vulnerabilidades**
en la consola de KSC y encontró ahí, disponibles para activar como columna, **Dirección IP**,
Dirección IPv6, Dominio DNS, Nombre DNS y Nombre NetBIOS — ya las activó (junto con Nombre
NetBIOS y Dominio DNS). No estaban disponibles en el "Informe de hardware" (el que sí procesa
`Monitor-KSC-HardwareInventory.ps1` hoy).

**Con lo que se sabía por código no bastaba para verlo** — confirma que la investigación anterior
tenía razón en advertir su propio límite ("no se puede descartar otro tipo de reporte").

**Pero hay una complicación real, encontrada al revisar de nuevo `Monitor-SERV-KSC.ps1`
(`Parse-InformeVulnerabilidades`, línea 244)**: a diferencia del parser de hardware (que lee la
tabla HTML fila por fila, de forma genérica, mapeando cada columna por su encabezado), el
parser de vulnerabilidades **no lee ninguna tabla por dispositivo**. Solo extrae:

1. Porcentajes agregados de un gráfico de torta embebido en el HTML (regex sobre frases tipo
   "Dispositivos con vulnerabilidades de gravedad crítica...: 90").
2. Las 4 vulnerabilidades más frecuentes, con una columna "Dispositivos" que es un **conteo**
   de cuántos equipos las tienen — no una fila por equipo.

Es decir: aunque el reporte ahora incluya IP/NetBIOS/DNS por dispositivo en su tabla detallada
("Campos Detalles" en la captura del usuario), **el script actual nunca llega a leer esa tabla
en absoluto** — activar las columnas en KSC no alimenta nada todavía sin escribir un parseo
nuevo, con el mismo patrón (genérico, por encabezado) que ya usa el parser de hardware.

### Qué falta para que esto sirva de verdad

1. Confirmar que el HTML re-exportado del Informe de vulnerabilidades, con los campos nuevos
   activados, sí trae una tabla detallada por dispositivo (fila por equipo, no solo el resumen
   de torta) — la pestaña "Campos Detalles" de la captura del usuario sugiere que sí, pero hay
   que verlo en un export real.
2. Escribir una función de parseo nueva (mismo patrón de `Get-HtmlTableRows` + detección de
   encabezado que ya prueba su solidez en el hardware) que extraiga Nombre/Dirección
   IP/NetBIOS/Dominio DNS por fila.
3. Decidir cómo esa IP llega a `cyber_asset_observations`: ¿se agrega un dato nuevo que
   enriquezca la observación Kaspersky ya existente (mismo hostname), o se trata como una
   fuente/importador aparte? `ksc-importer.js` tendría que dejar de forzar `MISSING_IP` para
   esos casos.
4. El script vive y corre en el servidor real (`.65`), fuera del alcance directo de esta sesión
   — el cambio hay que escribirlo aquí, pero el usuario tiene que desplegarlo allá.

**No se escribió el parseo nuevo todavía** — se necesita un export real (con los campos ya
activados) para construirlo contra la estructura HTML real, en vez de adivinarla, siguiendo la
misma disciplina de "verificar contra datos reales antes de escribir código" del resto de esta
sesión.

## Actualización 2026-09-17 (segunda parte) — dos exports reales analizados: cobertura insuficiente

El usuario generó y compartió dos exports reales con los campos de IP ya activados:
`Informe de vulnerabilidades (17-9-2026 14-36-35).html` y
`Informe de amenazas (17-9-2026 14-46-05).html` (ambos guardados en Descargas). Se procesaron
con un script Node de un solo uso (no se guarda en el repo — solo sirvió para contar filas y
dispositivos distintos, no para extraer datos reales de la organización).

**Confirmado, con datos reales**: ambos reportes sí traen una tabla de detalle fila-por-evento
con columna `Dirección IP:` (con dos puntos al final — quirk real de la exportación de KSC),
`Nombre NetBIOS` y `Dominio DNS`/`Dominio de Windows`. La hipótesis de la actualización anterior
era correcta.

**Pero ninguno de los dos sirve como fuente general de IP para los 157 equipos, en la forma en
que se exportan hoy:**

- **Informe de vulnerabilidades**: el título de la sección dice "Detalles (1000 de 16124)" — el
  export HTML de KSC **trunca a las primeras 1000 filas** de las 16.124 totales. Como el reporte
  viene ordenado por severidad/ID de vulnerabilidad (no por equipo), esas 1000 filas quedan
  dominadas por un puñado de equipos con muchísimos CVEs acumulados (ej. un Chrome desactualizado
  genera decenas de CVEs por sí solo). Resultado real medido: **1000 filas → solo 7 equipos
  distintos** de 157 (`14503-BCP2`, `12923-ADMAMAIME`, `020960-SUPERTI`, `MERCADEO-COMERC`,
  `AUXFINAN-019697`, `FABIANSAAVEDRA`, `PFINANCIERO`).
- **Informe de amenazas**: por diseño solo incluye equipos con una amenaza detectada en el
  período — **63 filas → solo 2 equipos** (`20106-DIRTESORE`, `POPERACIONES`).

Ninguno de los dos es "un reporte por dispositivo" — son reportes por evento (una fila por
CVE o por detección de amenaza), y el de vulnerabilidades además viene truncado a 1000 filas
en la exportación HTML sin importar cuántas haya en total.

### Pendiente (el usuario lo revisa directamente en la consola de KSC)

Revisar si KSC ofrece un tipo de reporte distinto que liste **cada equipo administrado una sola
vez** (p. ej. algo como "Lista de dispositivos administrados" o un reporte de inventario de red)
— ese sí tendría las 157 filas completas con IP, sin el problema de truncamiento por evento.
Alternativa si no existe: reexportar el Informe de vulnerabilidades **ordenado por Dispositivo**
en vez de por Vulnerabilidad, para que las primeras 1000 filas cubran muchos más equipos
distintos (sin garantía de llegar a los 157, pero mejor que 7).

Sigue sin escribirse el parseo real — no tiene sentido construirlo contra una fuente que ya se
sabe que no cubre la población completa.

## Actualización 2026-09-17 (tercera parte) — resuelto: "Informe del estado de la protección" sí es por dispositivo

El usuario compartió un tercer export real: `Informe del estado de la protección
(17-9-2026 14-52-35).html`. Analizado con el mismo script de un solo uso.

**Este reporte sí es lo que se necesitaba**: una fila por dispositivo administrado, no por
evento. El título de la sección de detalle dice "Detalles (173 de 173)" — sin truncar — y el
resumen confirma "Número de dispositivos: 173". Encabezados de la tabla de detalle:
`Estado, Servidor de administración virtual, Grupo, Dispositivo, Última conexión con el
Servidor de administración, Motivo:, Estado del dispositivo definido por la aplicación,
Dirección IP:, Visible por última vez, Dominio de Windows, Nombre NetBIOS, Nombre DNS,
Dominio DNS, Sistema operativo, Base de datos antivirus lanzada el, Último análisis completo`.

Medido: **173 filas → 172 dispositivos distintos, los 172 con IP** (la fila 173 probablemente
duplica un NetBIOS entre dos dispositivos distintos con el mismo nombre de equipo, ej.
`PDIR-COMERCIAL` aparece dos veces en el export con IPs distintas — 10.50.3.43 y 10.50.3.29 — a
confirmar si son dos equipos reales o un caso de renombrado sin depurar; no bloquea el uso del
reporte, solo hay que deduplicar por MAC o por el hostname completo del campo `Dispositivo`, no
solo por `Nombre NetBIOS`, al escribir el parser).

También trae, además de IP: Estado de protección (Aceptar/Advertencia/Crítico) y su motivo,
Sistema operativo, fecha de última actualización de firmas y de último análisis completo — todos
datos que hoy no se capturan de ninguna fuente y podrían enriquecer la observación Kaspersky más
allá de solo IP.

**Este es el reporte a usar.** Los otros dos (Vulnerabilidades, Amenazas) quedan descartados
para el propósito de "IP por equipo" — siguen siendo útiles para lo que ya hacían (CVEs,
detecciones), pero no como fuente de ubicación de red.

### Qué falta ahora

1. Escribir la función de parseo nueva (mismo patrón `Get-HtmlTableRows` genérico por encabezado
   que ya prueba su solidez en `Monitor-KSC-HardwareInventory.ps1`) para
   `Informe del estado de la protección`, extrayendo al menos Dispositivo/NetBIOS/Dirección
   IP/Dominio DNS — y evaluando si conviene capturar también Estado/Sistema operativo/fechas de
   análisis ya que están en la misma tabla.
2. Confirmar el caso `PDIR-COMERCIAL` duplicado antes de asumir que el emparejamiento por
   NetBIOS es único — usar MAC (si el reporte la trajera) o el campo `Dispositivo` completo como
   llave, no `Nombre NetBIOS` solo.
3. Decidir si este reporte reemplaza o complementa al "Informe de hardware" que hoy procesa
   `Monitor-KSC-HardwareInventory.ps1` — probablemente conviene un importador nuevo dedicado en
   vez de fusionar los dos parseos, ya que traen columnas distintas (MAC/serie/placa madre en
   hardware; IP/estado/SO aquí).
4. `cybersecurity/src/ksc-importer.js`: dejar de forzar `MISSING_IP` para los equipos que sí
   traigan IP por esta vía nueva, y persistir `ip_value` en `cyber_asset_observations`.
5. El script vive y corre en `.65` — el cambio se escribe aquí, el despliegue lo hace el usuario
   allá.

No se ha escrito el parser todavía en este commit — se documenta el hallazgo primero.

## Enlaces

- `cybersecurity/scripts/pull-ksc-from-monitoring.js`
- `cybersecurity/src/ksc-importer.js`
- `cybersecurity/src/cross-source-matcher.js`
- `cybersecurity/src/cybersecurity-read-model.js` (`getKasperskyInheritedSegments`)
- [Runbook del receptor KSC protegido](./RUNBOOK-RECEPTOR-KSC-PROTEGIDO.md)
