# Nota tecnica - IP en los reportes de Kaspersky Security Center

- Estado: **resuelto y con parser real escrito**. El "Informe del estado de la protección" es un
  reporte por dispositivo (173 de 173, sin truncar) y trae IP para los **173 de 173** equipos
  (corregido — ver "Actualización 2026-09-17 (cuarta parte)"). El usuario ya incluyó este reporte
  en la tarea de entrega diaria de KSC; `Monitor-KSC-HardwareInventory.ps1` (rama de trabajo
  local, aún sin desplegar a `SERV-KSC`) ya lee ambos reportes y enriquece el inventario de
  hardware con la IP real. Los otros dos reportes (Vulnerabilidades, Amenazas) quedan
  descartados para este propósito por cobertura insuficiente.
- Fecha: 2026-09-17 (actualizada el mismo día, cuatro veces, tras exports reales del usuario)

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

Medido en ese momento con un script que usaba `Nombre NetBIOS` como llave: **173 filas → 172
"dispositivos" distintos** — corregido en la cuarta actualización más abajo: no era un duplicado
real, era dos equipos distintos compartiendo NetBIOS.

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

## Actualización 2026-09-17 (cuarta parte) — parser escrito y verificado; corrección del "duplicado"

El usuario confirmó: ya incluyó "Informe del estado de la protección" en la tarea de entrega
diaria de reportes de KSC, y **ya existe una tarea programada en SERV-KSC** que corre
`Monitor-KSC-HardwareInventory.ps1` a diario (coincide con que `pull-ksc-from-monitoring.js`
encontró un reporte `KSC-HARDWARE` capturado el mismo día). Con eso resuelto, la decisión fue:
**editar ese script** (no crear una tarea nueva) y **enviar la IP por el mismo canal sin
proteger** que ya usa Monitoreo IT hoy para el hostname (`BackendUrl`/servicio `KSC-HARDWARE`),
**no** por el canal HMAC hacia el scanner de Ciberseguridad (`Export-CyberHardwareInventory` /
`Send-KSC-CyberExport.ps1`) — ese canal está deliberadamente diseñado para nunca llevar
identificadores en claro (su propio validador rechaza cualquier patrón de MAC sin proteger) y
una IP en claro no encaja ahí sin romper esa garantía.

**Corrección importante antes de escribir el parser**: al revisar de nuevo el caso "duplicado"
de la actualización anterior, `PCOMERCIAL` y `PDIR-COMERCIAL` **son dos equipos reales
distintos** (campo `Dispositivo` diferente) que comparten el mismo `Nombre NetBIOS`
("PDIR-COMERCIAL", probablemente uno se renombró sin actualizar su registro NetBIOS/DNS) —
verificado con un script de una sola vez que dedupica por `Dispositivo` en vez de `Nombre
NetBIOS`: **173 filas → 173 dispositivos distintos, sin ningún duplicado real, los 173 con IP**.
El "172" de la actualización anterior fue un artefacto de haber usado NetBIOS como llave;
confirma por qué la nota anterior ya advertía usar `Dispositivo` completo como llave de
deduplicación, no NetBIOS.

**Cambios en `CRM_Frontend/Monitoreo/KSC/Monitor-KSC-HardwareInventory.ps1`** (rama de trabajo
local — la carpeta `Monitoreo/` local se había borrado, restaurado solo este archivo desde el
historial de git para editarlo, el resto de la carpeta sigue eliminada tal como la dejó el
usuario):

1. `Parse-ProtectionStatus` (nueva): mismo patrón `Get-HtmlTableRows`/`Get-FirstRecordValue` que
   ya usan las demás funciones del script. Busca `Informe del estado de la protección*.html` (con
   y sin tilde) en `$KasperskyReportsPath`, detecta el encabezado de la tabla de detalle por la
   combinación `Dispositivo` + `Dirección IP:` + `Nombre NetBIOS` (única a esa tabla, no choca con
   la tabla de resumen que no trae `Dispositivo`), y extrae Nombre/IP/NetBIOS/Dominio
   Windows/Dominio DNS/Nombre DNS/Estado/Motivo/Sistema operativo por fila. Deduplica por
   `Dispositivo` completo (no NetBIOS), contando duplicados reales aparte en vez de
   sobrescribirlos en silencio. Degrada a `Status: "SIN INFORME"` sin fallar si el archivo no
   está presente todavía en la carpeta.
2. `Merge-ProtectionStatusIntoInventory` (nueva): enriquece cada dispositivo ya armado por
   `Parse-HardwareInventory` (que nunca trajo IP) con `IPAddress`/`NetbiosName`/`ProtectionState`,
   uniendo por el mismo campo `Dispositivo`/`Nombre` (case-insensitive). Un dispositivo del
   inventario de hardware sin match en el reporte de protección queda con esos campos en `$null`
   — no se inventa nada. Un dispositivo del reporte de protección sin match en el inventario de
   hardware se cuenta en `UnmatchedInHardware` pero no se agrega como fila nueva a `Devices` (para
   no cambiar el conteo/semántica de `KSC-HARDWARE` que ya consume `ksc-importer.js`).
3. El flujo principal llama a ambas, agrega `Kaspersky.ProtectionStatus` y
   `Kaspersky.IPMergeSummary` al payload que ya se sube a Monitoreo IT, imprime un resumen por
   consola (total/con IP/sin IP/duplicados/emparejados), y agrega una tabla de cobertura de IP al
   dashboard HTML existente (`New-HardwareInventoryHtml`). El canal HMAC
   (`Export-CyberHardwareInventory`) no se tocó.

**Verificado, no solo escrito**: sintaxis validada con el parser de PowerShell
(`[System.Management.Automation.Language.Parser]::ParseFile`, sin errores). `Parse-ProtectionStatus`
probado de forma aislada contra el export real del usuario en Descargas: 173 dispositivos, 173
con IP, 0 duplicados. `Merge-ProtectionStatusIntoInventory` probado con un inventario sintético de
4 dispositivos (incluyendo un caso con distinto uso de mayúsculas y uno sin match) contra el mismo
export real: empareja correctamente `PCOMERCIAL`→`10.50.3.43` y `PDIR-COMERCIAL`→`10.50.3.29` por
separado (confirma que la corrección de la llave de deduplicación era necesaria), respeta
mayúsculas/minúsculas, y no inventa IP para el dispositivo sin match. También se probó el caso
"no existe el reporte de protección" (carpeta vacía) — degrada a `SIN INFORME` sin excepciones.
**No se pudo probar el flujo completo del script** (extremo a extremo, incluido el POST real a
Monitoreo IT) porque no hay un "Informe de hardware" real disponible en esta sesión para
disparar `Get-LatestHardwareReport`.

### Pendiente

1. ~~Desplegar en `SERV-KSC`~~ **hecho** — ver "Actualización 2026-09-17 (quinta parte)" abajo.
2. `cybersecurity/src/ksc-importer.js`: sigue forzando `MISSING_IP` para todo equipo Kaspersky —
   no tocado en esta ronda (fuera del alcance de "crear/editar el .ps1"; es el lado de lectura,
   trabajo aparte). Cuando se retome: dejar de forzar esa bandera cuando `IPAddress` venga
   presente en el payload `KSC-HARDWARE`, y persistir `ip_value` en `cyber_asset_observations`.
3. Una vez que `ksc-importer.js` lea la IP real, revisar si conviene mantener el cruce por
   hostname (`getKasperskyInheritedSegments`) como señal de corroboración adicional en vez de
   única fuente de ubicación — la IP directa ya no dependería de ese cruce.

## Actualización 2026-09-17 (quinta parte) — desplegado y corrido en producción: 157/157 emparejados

El usuario copió el script editado a `C:\Monitoreo\KSC\Monitor-KSC-HardwareInventory.ps1` en el
servidor real y lo corrió a mano (fuera de la tarea programada, como prueba) contra los datos
reales de producción: `F:\Informes KSC\Informe de hardware (05-30-15 09-17-26).html` (157
dispositivos) y `Informe del estado de la protección (17-9-2026 14-52-35).html` (el mismo export
ya analizado, 173 dispositivos).

**Resultado real, mejor que lo estimado**: **157 de 157 dispositivos del inventario de hardware
emparejaron con IP — 100%**, no solo los que se habían verificado con datos sintéticos. Los 16
dispositivos restantes del reporte de protección (173 − 157) quedan correctamente solo en
`Kaspersky.ProtectionStatus.Devices`, sin fabricar filas nuevas en `Devices` (equipos que KSC ve
en protección pero que el inventario de hardware, por lo que sea, no capturó — no es un error del
merge, es el comportamiento documentado). El POST real a `http://192.168.8.65:3001/api/monitoring/
upload` se completó con éxito: `[OK] Inventario KSC-HARDWARE enviado correctamente`, archivo
`report_2026-09-17T21-14-14-917Z.json` guardado con `hasHtml: true`.

**Este era el último paso de despliegue pendiente** — la tarea programada existente en `SERV-KSC`
recogerá esta misma versión en su próxima corrida diaria, sin que el usuario tenga que hacer nada
más ahí. El siguiente paso que queda es enteramente del lado de lectura: `ksc-importer.js` (ítem 2
arriba), para que la IP que ya llega a Monitoreo IT se persista en `cyber_asset_observations`.

## Enlaces

- `cybersecurity/scripts/pull-ksc-from-monitoring.js`
- `cybersecurity/src/ksc-importer.js`
- `cybersecurity/src/cross-source-matcher.js`
- `cybersecurity/src/cybersecurity-read-model.js` (`getKasperskyInheritedSegments`)
- [Runbook del receptor KSC protegido](./RUNBOOK-RECEPTOR-KSC-PROTEGIDO.md)
