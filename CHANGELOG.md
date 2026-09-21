# Changelog

Registro de cambios del ecosistema Skylab. Formato basado en
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

Cada PR actualiza la sección **No publicado**, bajo la subsección del módulo que toca
(`CRM_Frontend`, `chatbot-soporte`, `Bot Comercial`, `Ciberseguridad`, `CCTV`,
`Monitoreo IT`, `Asamblea`, `Infra/Docs`). Al desplegar a producción se mueve el bloque
a una versión fechada.

## [No publicado]

### Ciberseguridad — Torres reales: hAP lite + NVR por punto (fase 1)
`specs/0013-inventario-torres-haplite-nvr/`
- **Problema:** el módulo Inventario no tenía ningún concepto de punto de venta ni
  torre — un MikroTik hAP lite y su grabador Dahua aparecían como dos candidatos
  sueltos, aunque comparten IP (la del hAP lite, por NAT) y "pertenecen" al mismo punto.
- **Datos semilla reales** (`cyber_towers`/`cyber_tower_points`, nuevo): 14 torres reales
  con nombre y gateway/CIDR + 1 celda explícitamente marcada "no es una torre" (Edificio
  Ppal), entregadas por el usuario. **Verificado que el campo `organization` de
  `dss_device_registry` no es un proxy confiable de torre** (mezcla varias torres reales
  en 2 de 13 zonas) — la torre real de un punto se toma de esta lista, nunca de DSS.
- **Nueva fuente `DSS`** (`cybersecurity/src/dss-importer.js`): trae `dss_device_registry`
  (`cctv-automation-final`, servicio aparte) de solo lectura, mismo patrón que
  `ksc-importer.js`. `cybersecurity/scripts/pull-dss-devices.js` (auditoría por defecto,
  `--apply` explícito) y `cybersecurity/scripts/seed-towers.js` para la semilla.
- **`getTowerPoints(db)`** agrupa por IP compartida (semilla + DSS), con FortiGate como
  corroboración opcional (solo 7 de 96 IPs de hAP lite conocidas aparecen en FortiGate —
  no es el mecanismo principal). Nueva ruta `GET /api/cybersecurity/towers` y pestaña
  "Torres" en el frontend (`CybersecurityDashboard.jsx`).
- **Migración real encontrada al implementar:** una base ya existente (incl. `.65`) tiene
  `cyber_source_systems.source_type` con un `CHECK` sin `'DSS'` — SQLite no soporta
  `ALTER` de un `CHECK`. `db/open-database.js` automigra al abrir. Un primer intento de
  migración (renombrar la tabla vieja) resultó incorrecto: `ALTER TABLE RENAME` reescribe
  las FK de las tablas hijas al nuevo nombre, dejando `cyber_source_snapshots` con
  referencias huérfanas — detectado con `PRAGMA foreign_key_check` contra la base local
  real, corregido (crear la tabla nueva bajo nombre temporal, nunca renombrar la
  original), con test de regresión que replica el escenario exacto.
- **Verificado contra datos reales, en Docker local** (no solo tests): 15 torres, 96
  puntos con hAP lite conocido, 93 con dispositivo DSS identificado —
  `GET /api/cybersecurity/towers` a través de `http://127.0.0.1:3003/` con el stack real
  reconstruido. 160/160 tests, `npm run build` de `CRM_Frontend` en verde.
- **Fuera de alcance de esta fase** (spec 0013 §4): modelo completo de torre
  (enlaces/celdas/router principal/UPS), monitoreo en vivo, vulnerabilidades de
  firmware, jerarquía Zona → Sitio → Punto (documentada como info para más adelante).

### Ciberseguridad — Vista gráfica de Torres + todos los puntos (con o sin CCTV)
`specs/0013-inventario-torres-haplite-nvr/`
- **Pedido del usuario:** mismo lenguaje visual que los tableros por zona de CCTV
  (tarjetas + cuadrícula de cubos) para Torres, e incluir **todos** los puntos de cada
  zona, no solo los que ya tienen hAP lite conocido.
- **Hallazgo real:** `puntos_venta` (Supabase, Operación de Puntos) ya tiene el campo
  `segment` con las 7 zonas operativas reales (`PALMIRA`, `OCCIDENTE`, `CANDELARIA`,
  `FLORIDA`, `PRADERA`, `ROZO`, `AMAIME Y EL PLACER`) y `has_cctv` ya viene sincronizado
  de verdad (spec 0012) — no hizo falta inventar ni pedir un dato nuevo. Verificado
  contra Supabase real: 375 puntos activos, 40 con CCTV.
- **`TowersCardsView`** (nuevo, `CybersecurityDashboard.jsx`): una tarjeta por torre
  real, agrupadas por zona (`ZONE_TOWER_NAMES`, mapeo confirmado por el usuario),
  cuadrícula de cubos por punto, expandible para ver Enlaces/Celdas/Router principal —
  Enlaces y Celdas quedan como secciones "sin datos todavía" (spec 0013 §4, preparadas
  para cuando lleguen esos datos sin requerir otro rediseño).
- **Selector de vista** ("Tarjetas"/"Lista"): la vista de lista maestro-detalle
  original (`TowersListView`) se conserva para búsqueda puntual rápida.
- **Ubicación por IP/gateway (pedido del usuario)**: `cyber_tower_gateways` (nuevo) —
  una torre puede tener más de un gateway real (Pradera, Candelaria); antes solo se
  guardaba uno como representativo. Un punto de Operación de Puntos sin hAP lite
  conocido, si su `ip` cae dentro de un gateway real de una torre de su propia zona, se
  ubica ahí automáticamente (sin fusionarlo con el punto ya conocido si comparte IP).
  **Verificado contra datos reales en vivo: 326 de 368 puntos activos (89%) se ubican
  así** — el resto, sin match a ningún gateway conocido, sigue en "Sin torre asignada",
  sin inventarles una torre.
- **Leyenda de colores única para toda la vista** (`CubeLegend`): verde = grabador DSS
  confirmado, ámbar = hAP lite conocido sin grabador, azul = ubicado por IP sin hAP
  lite/DSS confirmado, gris = sin torre asignada — un solo significado por color, sin
  excepciones por sección.
- **Tarjeta flotante al hacer click en un cubo** (`PointFloatingCard`): nombre, torre,
  IP, zona, CCTV/FortiGate/grabadores DSS del punto — se cierra con la X, clic afuera
  o Esc.
- Verificado contra datos reales en vivo (no solo el build): la lógica de agrupación y
  de coincidencia por gateway se replicó fuera de React contra la API real
  (`/api/cybersecurity/towers`) y Supabase real. `npm run build`/`lint` en verde,
  bundle reconstruido en Docker local con el texto nuevo confirmado.

### Ciberseguridad — Corrección de máscaras reales, categoría VPN y tarjeta al pasar el cursor
`specs/0013-inventario-torres-haplite-nvr/`
- **Corrección de datos reales (el usuario, con conocimiento directo de la red, corrigió
  la máscara del PDF original):** Rozo, Palmaseca y Zamorano Palmira usan `/23`, no `/24`
  como se había transcrito. Corregido en la semilla real
  (`cybersecurity/raw/torres/torres-haplite-real-20260918.json`, gitignored) y en la base
  local (se borraron los 2 gateways `/24` obsoletos y se recargó `seed-towers.js`).
  **Impacto verificado contra datos reales en vivo:** Rozo pasó de 1/25 puntos ubicados
  por IP (4%) a **24/25 (96%)** — la brecha real que se había documentado como "hallazgo,
  no ajustado" en la nota de módulo era, en realidad, un dato de máscara mal transcrito.
- **Nueva categoría "Conectados por VPN"** (`isVpnConnected`, prefijo `10.100.1.`):
  el usuario aclaró que estos puntos se conectan por VPN desde internet y
  **estructuralmente nunca van a tener una torre** — no es lo mismo que "sin torre
  asignada por falta de dato todavía". Se separan en su propia tarjeta (tono violeta,
  agregado a `CubeLegend`) para no mezclar ambos significados.
- **Tarjeta flotante al pasar el cursor, no al hacer click** (pedido del usuario): 
  `PointCubeGrid`/`PointFloatingCard` cambian de `onClick` a `onMouseEnter`/`onMouseLeave`
  (con `onFocus`/`onBlur` para teclado); ya no hace falta el overlay de "clic afuera" ni
  el listener de Escape para cerrarla.
- **Verificado contra datos reales en vivo** (lógica de agrupación replicada fuera de
  React contra la API real y Supabase real, tras el fix): de 368 puntos activos, **355
  ubicados por IP, 5 en la nueva categoría VPN, y solo 8 genuinamente sin torre asignada**
  (antes: 326 ubicados, 42 sin torre asignada sin distinguir VPN). `cybersecurity/`:
  162/162 tests. `CRM_Frontend`: `npm run lint`/`build` en verde (sin errores nuevos).
  Docker local reconstruido (`crm-frontend` + `restart`), bundle con el texto nuevo
  confirmado, `/api/cybersecurity/towers` devuelve los gateways `/23` corregidos.

### Ciberseguridad — Match de punto por IP ya no se restringe a la zona propia
`specs/0013-inventario-torres-haplite-nvr/`
- **Investigación de los 8 puntos que seguían "sin torre asignada"** tras el fix
  anterior: 2 (`LUCERNA`, `BOMBA LAURO`) caen justo fuera del gateway `/28` de Bolo — el
  usuario confirmó que esa máscara real es correcta, así que siguen genuinamente sin
  torre. Los otros 6 sí tenían match real, pero contra una torre mapeada a **otra** zona
  operativa (p.ej. 2 puntos de Candelaria caen en la red del Edificio Principal, mapeada
  solo a Palmira; puntos de Palmira/Amaime caen en la red de Quisquina, mapeada a
  Occidente) — el código solo buscaba torres de la propia zona del punto.
- **Decisión del usuario:** la red real manda sobre la etiqueta de zona — permitir que
  un punto se ubique en cualquier torre real conocida, sin restringir a las torres de su
  propia zona. `TowersCardsView` ahora calcula el match una sola vez contra **todas**
  las torres (antes, una vez por zona contra solo las torres de esa zona); el punto
  aparece en la tarjeta de la torre real que lo contiene, aunque esa torre esté en la
  sección de otra zona.
- **Verificado contra datos reales en vivo:** de 368 puntos activos, **361 ubicados por
  IP (98%)** — solo quedan los 2 puntos de Bolo, confirmados como brecha real (no
  ajustada). `cybersecurity/`: 162/162 tests (sin cambios de backend). `CRM_Frontend`:
  `npm run lint`/`build` en verde. Docker local reconstruido (`crm-frontend` +
  `restart`), bundle nuevo confirmado servido por nginx.

### Ciberseguridad — Revisión de código: 3 correcciones (sin cambio de comportamiento hoy)
`specs/0013-inventario-torres-haplite-nvr/`
- **`/code-review` sobre el diff acumulado de la spec** encontró 3 defectos reales, sin
  necesidad de datos nuevos:
  1. La tarjeta "Puntos totales (Operación de Puntos)" mostraba "cargando…" para
     siempre si la consulta a Supabase fallaba o traía 0 filas (`crmTotal || undefined`
     no distinguía error/vacío/cargando). Corregido: ahora distingue los 3 estados
     explícitamente (`pointsQuery.isError`/`isLoading`).
  2. El match de un punto por IP/gateway cruzando zonas (incremento anterior) elegía la
     primera torre que coincidiera, no la más específica (prefijo más largo) — el mismo
     tipo de problema de contención de CIDR que el backend ya resuelve así
     (`resolveTrueSegmentId`). No cambiaba el resultado hoy (ningún gateway real se
     solapa todavía), pero era un riesgo latente justo después de ampliar Rozo/
     Palmaseca/Zamorano a `/23`. Corregido: `findTowerByIp` replica el mismo criterio
     de desempate que el backend.
  3. `dss-importer.js` (`readDssDeviceRegistry`) no tenía `ORDER BY`, pero
     `importDssDeviceRegistry` hashea `JSON.stringify(devices)` sobre ese resultado
     para decidir si un re-import es un no-op — sin orden garantizado, un re-import de
     los mismos datos podía producir un hash distinto y duplicar el import en vez de
     reconocerlo como `ALREADY_IMPORTED`. Corregido: `ORDER BY dss_identifier` (clave
     primaria real de esa tabla).
- **Verificado**: `cybersecurity/`: 162/162 tests; re-corrido `pull-dss-devices.js
  --apply` contra la base local, confirma `ALREADY_IMPORTED` (idempotencia intacta).
  `CRM_Frontend`: `npm run lint`/`build` en verde. Ubicación por IP re-verificada en
  vivo: sigue en 361/368 (98%), sin regresión. Docker local reconstruido
  (`cybersecurity-api` + `crm-frontend` + `restart`), bundle nuevo confirmado.

### Ciberseguridad — Estado vivo del hAP lite y del puerto NAT del NVR en la tarjeta del punto
`specs/0013-inventario-torres-haplite-nvr/`
- **Pedido del usuario:** mostrar el estado del hAP lite, si el puerto NAT del NVR
  (4455/4456) responde, la latencia, y sentar la base para detectar vulnerabilidades
  de firmware — todo en la tarjeta de cada punto.
- **Investigación antes de construir**: `cybersecurity-api` es un contenedor
  deliberadamente bloqueado (`read_only`, `cap_drop: ALL`) sin ruta de red probada
  hacia las redes de torre — nunca ha hecho una conexión activa a nada. El único
  camino con alcance real y probado a `192.168.x.x` es `monitor_puntos_wpp.py` (corre
  en `comercial-bot`, ya hace ping + latencia a los ~368 puntos activos, sin ningún
  chequeo TCP). Decisión del usuario: extender ese script en vez de construir
  infraestructura de red nueva.
- **`monitor_puntos_wpp.py`**: nuevo `check_nvr_port(ip)` — intenta TCP al puerto 4455
  y luego 4456 (timeout 1.5s cada uno), solo si el ping al hAP lite ya fue exitoso (si
  el host no responde, el puerto NAT tampoco va a estar abierto — evita gastar el
  timeout completo en puntos ya caídos). Corre dentro del mismo `ThreadPoolExecutor`
  que ya paraleliza el ping (35 workers), sin nueva infraestructura de concurrencia.
  Escribe `nvr_port`/`nvr_checked_at` en `puntos_venta` junto a `active`/`latency`
  (mismo upsert, mismo criterio: se sobreescribe en cada corrida).
- **`cybersecurity/sql/0013-add-nvr-port-columns.sql`** (nuevo, para correr a mano en
  el editor SQL de Supabase — mismo patrón ya usado en `Asamblea/sql/`): agrega
  `nvr_port`/`nvr_checked_at` a `puntos_venta`. **Pendiente: el usuario debe correrlo
  antes de que el dato aparezca real** — el código ya maneja su ausencia mostrando
  "Sin datos todavía" en vez de un falso "Sin conexión".
- **`CybersecurityDashboard.jsx`**: `LiveStatusRow` (nuevo) en `PointFloatingCard` —
  dos filas (hAP lite, NVR/NAT) con punto de color (verde/rojo/gris), latencia o
  puerto, y hace cuánto se revisó (`date-fns`, ya usado en otras páginas de
  `CRM_Frontend`) — nunca dice "en vivo": `monitor_puntos_wpp.py` corre bajo demanda
  (comando de WhatsApp), no en un intervalo fijo, así que la antigüedad del dato
  importa y se muestra siempre. Cruce por IP (`crmPointByIp`) para que los puntos con
  hAP lite ya conocido (no solo los ubicados por IP) también muestren su estado —
  `tower.points` (backend propio) no trae este dato, solo `puntos_venta`.
- **Verificado**: `check_nvr_port` probado contra un puerto TCP real abierto y uno
  cerrado en `localhost` (puerto abierto detectado correctamente, cerrado devuelve
  `None`, no una excepción sin manejar). `cd CRM_Frontend && npm run lint`/`build` en
  verde. Docker local reconstruido (`crm-frontend` + `restart`), bundle confirmado con
  el texto nuevo ("NAT 4455/4456", "Sin datos todavía").

### Ciberseguridad — Firmware inicial (sin verificar) en la tarjeta del punto
`specs/0013-inventario-torres-haplite-nvr/`
- **Pedido del usuario**: sentar la base para detectar vulnerabilidades de firmware.
  Ningún servicio de este ecosistema hace hoy un escaneo activo de firmware contra las
  redes de torre (Greenbone es un relevo de archivos aislado, sin conector en vivo ni
  alcance documentado sobre esas redes) — construir eso es una decisión de arquitectura
  aparte. Mientras tanto: se encontraron **versiones de firmware reales** ya guardadas
  en otra base del ecosistema (`cctv-automation-final`, tabla de staging de un import
  manual de Excel, 100 de 103 filas de la corrida más reciente con IP de hAP lite, 94
  con firmware). Decisión del usuario: importar esto como dato inicial, **marcado
  explícitamente como no verificado**, sin depender de él a largo plazo (se desactualiza
  rápido — la corrida más reciente vista tiene semanas).
- **`cctv-firmware-staging-importer.js`** (nuevo, mismo patrón que `dss-importer.js`):
  lee `stg_inventory_locations` de solo la corrida de import más reciente (la tabla
  acumula corridas viejas del mismo Excel sin limpiarlas — se descartan, no se cuentan
  3 veces las mismas 103 ubicaciones). Nueva fuente `CCTV_STAGING`
  (`authority_level = 'OBSERVATIONAL'`, la más baja del enum — nunca se confunde con
  DSS/FortiGate corroborados). Cada observación se marca `CCTV_STAGING_UNVERIFIED`.
- **`cybersecurity/db/schema.sql`/`open-database.js`**: `'CCTV_STAGING'` agregado al
  `CHECK` de `source_type` — misma migración de LL-0007, generalizada para revisar
  cualquier valor requerido (no solo `'DSS'`), con test de regresión nuevo para el
  caso real de upgrade parcial (una base que ya tiene `'DSS'` pero no
  `'CCTV_STAGING'`, como estará `.65` en producción).
- **`getTowerPoints`**: cruza por IP con la nueva fuente y expone `point.firmware`
  (`firmwareRaw`, `recorderModel`, `observedAt`, `unverified: true`) — solo para los
  96 puntos con hAP lite ya conocido, no se fuerza sobre puntos ubicados solo por
  gateway (esa reconciliación no aplica ahí).
- **Tarjeta flotante**: nueva sección con el firmware, siempre rotulada "Sin
  verificar (import Excel, hace X) — no reemplaza un escaneo activo".
- **Verificado contra datos reales**: import real corrido con `--apply` (respaldo
  previo del `.db` local) — **79 de los 96 puntos conocidos (82%) ya muestran
  firmware**, confirmado vía `/api/cybersecurity/towers` en Docker local. Idempotencia
  confirmada (`ALREADY_IMPORTED` en la segunda corrida). `cybersecurity/`: 168/168
  tests (7 nuevos). `CRM_Frontend`: `npm run lint`/`build` en verde. Docker local
  reconstruido (`cybersecurity-api` + `crm-frontend` + `restart`), bundle confirmado
  con el texto nuevo.
- **Fuera de alcance de este incremento**: escaneo activo real de firmware (decisión
  de arquitectura aparte, requiere definir qué servicio escanea, con qué alcance de
  red y credenciales sobre equipos de producción).

### Ciberseguridad — Corrige etiqueta falsa "hAP lite: En línea" en la tarjeta del punto
`specs/0013-inventario-torres-haplite-nvr/`
- **Reporte del usuario tras correr la migración SQL:** las tarjetas de puntos con hAP
  lite + CCTV confirmado no mostraban ningún estado, y las tarjetas azules ("ubicado
  por IP", sin hAP lite confirmado) mostraban "hAP lite: En línea" — tecnología que
  esos puntos todavía no tienen confirmada.
- **Investigado antes de corregir (no solo cosmético):** `puntos_venta.ip` (lo que
  `monitor_puntos_wpp.py` pinguea) **nunca es la IP del hAP lite**, ni siquiera para
  los 96 puntos con hAP lite ya confirmado por la lista real de torres — son dos
  dispositivos distintos en el mismo punto. Verificado con un caso real: el punto
  "AMAIME I" tiene hAP lite en `192.168.12.58` (lista real de torres/DSS) pero
  `puntos_venta.ip` = `192.168.12.41` — misma subred, otro host, casi seguro el
  equipo de apuestas (WiFi) y no el hAP lite (Eth4/CCTV). **0 de 96 IPs de hAP lite
  conocidas coinciden con algún `puntos_venta.ip`.**
- **Corregido:** la fila de ping ya no dice "hAP lite" en ningún caso — dice "Punto
  (ping)", porque eso es lo que de verdad mide (la conectividad del equipo de
  apuestas, ya monitoreado por Operación de Puntos). Cuando la IP mostrada arriba de
  la tarjeta (la real del hAP lite, para puntos confirmados) difiere de la IP que se
  está midiendo, se muestra esa segunda IP explícitamente con la aclaración "(equipo
  de apuestas, IP distinta al hAP lite)". Para puntos confirmados sin ninguna fila
  coincidente en `puntos_venta` (el caso típico, 0/96), se muestra "Sin dato de
  conectividad" con la explicación, en vez de un "Sin datos todavía" que insinuaba
  que el dato llegaría solo con el tiempo.
- **Pendiente real, no resuelto en este fix:** monitorear la IP real del hAP lite
  (no la del equipo de apuestas) requeriría que `monitor_puntos_wpp.py` conozca esa
  lista — hoy vive solo en el SQLite local de `cybersecurity` (`cyber_tower_points`),
  no en Supabase, que es lo único que ese script puede leer. Es una decisión de
  arquitectura nueva (cómo sincronizar esa lista, o si conviene), no un ajuste de UI.
- **Verificado:** `npm run lint`/`build` en verde. Docker local reconstruido
  (`crm-frontend` + `restart`), bundle confirmado con el texto nuevo ("Punto (ping)",
  "equipo de apuestas", "Sin dato de conectividad") y sin el texto viejo ("hAP lite"
  como etiqueta de fila).

### Ciberseguridad — Estado vivo REAL del hAP lite (nueva tabla, ya no `puntos_venta`)
`specs/0013-inventario-torres-haplite-nvr/`
- **Pedido del usuario, tras confirmar el hallazgo del incremento anterior**: sincronizar
  la lista real de hAP lite a Supabase para que `monitor_puntos_wpp.py` pueda probarla
  directamente, en vez de conformarse con el dato del equipo de apuestas.
- **`cybersecurity/sql/0013-create-known-haplites-table.sql`** (nuevo, para correr a
  mano en el editor SQL de Supabase): tabla `cyber_known_haplites` (`ip` PK, `tower_name`,
  `point_names`, `active`, `latency`, `nvr_port`, `updated_at`, `nvr_checked_at`,
  `synced_at`).
- **`cybersecurity/scripts/sync-known-haplites-to-supabase.js`** (nuevo): lee la
  semilla real local (`cyber_towers`/`cyber_tower_points`, única fuente de verdad de
  la IP del hAP lite) y sincroniza identidad (`ip`/`tower_name`/`point_names`) a
  Supabase — nunca toca las columnas de estado vivo, que son responsabilidad exclusiva
  de `monitor_puntos_wpp.py` (mismo principio de separación que `dss-importer.js` vs.
  `ksc-importer.js`). Modo auditoría por defecto, `--apply` para escribir.
- **`monitor_puntos_wpp.py`**: nuevas funciones `scan_haplite_target`/
  `scan_and_update_known_haplites` — escaneo aparte y más simple que el de
  `puntos_venta` (sin lógica de unificación de grupos ni transiciones, que no aplican
  a infraestructura de red), reusando `ping_host`/`check_nvr_port` ya existentes.
  Corre después del escaneo principal, con su propio manejo de errores — nunca puede
  romper el monitoreo de `puntos_venta` si la tabla nueva no existe todavía.
- **`CybersecurityDashboard.jsx`**: nueva consulta a `cyber_known_haplites`
  (`cybersecurityService.getKnownHapliteStatuses`, lectura directa a Supabase). Los
  puntos con hAP lite confirmado ahora muestran su estado **real** (etiqueta "hAP lite
  (ping)"), cruzado por la IP correcta — ya no por `puntos_venta.ip`.
- **Verificado**: `scan_haplite_target`/`scan_haplite_targets_parallel` probados contra
  un host real (`8.8.8.8`, activo, sin puerto NAT abierto, como se esperaba) y contra un
  servidor TCP local real (puerto detectado correctamente). `readKnownHaplites`
  (identidad) con 2 tests nuevos — 170/170 en `cybersecurity/`. Sync real corrido en
  modo auditoría contra datos locales: 96 IPs de hAP lite listas para sincronizar. La
  consulta a la tabla (todavía inexistente hasta que el usuario corra la migración)
  falla de forma controlada y se degrada a lista vacía, sin romper la vista. `npm run
  lint`/`build` en verde. Docker local reconstruido, bundle confirmado con el texto
  nuevo.
- **Actualización (mismo día, tras que el usuario corrió la migración)**: se ejecutó
  `sync-known-haplites-to-supabase.js --apply` — **96 IPs reales sincronizadas**,
  confirmado consultando con la clave `service_role` (ej. "Amaime I" →
  `192.168.12.58`, coincide con la semilla). **Hallazgo real**: la tabla nueva tenía
  RLS activado por defecto (comportamiento estándar de tablas nuevas en Supabase) sin
  ninguna policy — la escritura con `service_role` funcionaba, pero el frontend (clave
  `anon`) veía 0 filas. Nuevo `cybersecurity/sql/0013-allow-public-read-known-
  haplites.sql` (policy de `SELECT` público) — corregido y confirmado (96/96 filas
  visibles con la clave `anon`).
- **Segunda actualización (mismo día): el primer monitoreo real disparado por
  WhatsApp no pobló nada** — el bot de producción corre con `main`, que no tiene el
  escaneo nuevo (la rama no se ha desplegado). Con autorización del usuario, se corrió
  `python monitor_puntos_wpp.py --json` directamente desde la máquina de desarrollo
  (con el código de la rama) contra el Supabase real: el monitoreo principal de
  `puntos_venta` funcionó normal, pero el escaneo nuevo de hAP lite **encontró un bug
  real**: `update_haplite_results_in_supabase` hace upsert de solo las columnas de
  estado vivo (nunca `tower_name`/`point_names`, responsabilidad exclusiva del script
  de sincronización de identidad) — Postgres exige que la fila candidata del `INSERT`
  satisfaga los `NOT NULL` de la tabla antes de evaluar el `ON CONFLICT DO UPDATE`,
  aunque el conflicto sí resuelva con `UPDATE`. La transacción se revirtió completa,
  sin dañar ninguna de las 96 filas (confirmado: 0 con `tower_name` nulo). Nuevo
  `cybersecurity/sql/0013-fix-known-haplites-not-null.sql` (quita el `NOT NULL` de
  esas 2 columnas) + corregido el `CREATE TABLE` original para instalaciones futuras.
  **Tercera actualización (mismo día): el fix inicial estaba incompleto** — el
  reintento seguía fallando, ahora con `synced_at` (otra columna `NOT NULL` que el
  escritor de estado vivo tampoco toca, se había pasado en el primer fix). Corregido
  el archivo y el `CREATE TABLE` original; el usuario corrió la migración completa.
  **Escaneo real de hAP lite corrido con éxito** (confirmado con una prueba directa
  antes de reintentar): **96/96 IPs revisadas, 95/96 activas, 83/96 con puerto NAT
  4455/4456 abierto** — confirma NVR real detrás de la mayoría. Ejemplo verificado:
  "Amaime I" (`192.168.12.58`) → en línea, 0ms, puerto 4455 abierto, visible con la
  clave `anon` (la del navegador). **Ciclo completo validado end-to-end contra datos
  reales**: torre real → hAP lite real → ping/NAT real → tarjeta.
- **Pendiente real que queda**: la rama sigue sin push/PR/merge/deploy — el bot de
  WhatsApp de producción todavía no dispara este escaneo por su cuenta (corrió porque
  Claude lo ejecutó manualmente desde la máquina de desarrollo, con autorización del
  usuario). Al desplegar, el flujo normal ya lo hace solo.

### CCTV — Sincronización Operación de Puntos ↔ Seguridad Electrónica
`specs/0012-sync-puntos-cctv/`
- **Problema:** "Operación de Puntos" (Supabase `puntos_venta`) y "Seguridad Electrónica"
  (`cctv-automation-final`) no se hablaban: `has_cctv`/`has_alarm` no tenían formulario que
  los editara (quedaban desactualizados a mano) y el horario real por punto
  (`custom_open_time`/`custom_close_time`) no llegaba a la interpretación operativa de
  spec 0010.
- **`platform/crm-points-sync.js`** (con tests): `matchCrmPoints` (SIIS exacto → alias →
  sin match, misma lógica que `reconcile-crm-points.mjs`), `computeCapabilities` (real:
  `has_cctv`=`WITH_CCTV` de spec 0010, `has_alarm`=`alarmLocationIds` de
  `platform/alarm-coverage.js`), `diffCapabilities` (solo matches `AUTO_LINKABLE`, solo
  cuando cambia — el dato real siempre gana), `buildScheduleCache`.
- **`scripts/sync-crm-points.js`** (`--dry-run` disponible): corrige `has_cctv`/`has_alarm`
  en Supabase por lote (`PATCH`, service role key) y cachea el horario real por punto en
  `crm_point_schedules` (idempotente, `schema.sql`). Corrido contra datos reales
  (2026-09-11): **75 correcciones** (62 `has_cctv` true→false por no notificar en 30 días,
  7 false→true, 6 solo `has_alarm`, 13 ambos), **7 puntos** con horario real cacheado. Segundo
  run confirma 0 cambios (idempotente).
- **`interpretPointDay`** (spec 0010) acepta `point.customSchedule`: cuando existe, "abrió
  tarde"/"cerró temprano" (`lateBy`) de `APERTURA_MANANA`/`CIERRE_NOCHE` se mide contra el
  horario real del punto, no solo la ventana global.
- **`run-operational-cycle.js`**: paso `crmPointsSync` (no crítico), cadencia
  `CRM_POINTS_SYNC_INTERVAL_MINUTES` (default 1440 = una vez al día).
- Credencial: `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` en `.env` (reutiliza la de
  `ChatBotSoporte`, mismo proyecto Supabase — decisión del usuario, no versionada).
- `cctv-automation-final`: `npm test` **89/89** (sin CI).

### CCTV / Mantenimiento — "Ejecución del programa" en vivo desde la API de Trello
`specs/0008-cctv-mantenimiento-refresco/`
- **Bug:** la vista "Ejecución del programa" mostraba datos de hace días mientras el dashboard
  de soporte sí se actualizaba. Causa: `import-trello-support.js` llama a la API de Trello, pero
  `import-trello-maintenance.js` leía `skylab-tareas.db` (caché del backend de "Table Trello",
  que no corre en el `.65` y no se puede calentar desde el contenedor `cctv-operational-worker`).
- **Fix:** `platform/import-trello-maintenance.js` reescrito para leer la lista
  `MANTENIMIENTO CCTV 2026` **directo de la API de Trello** (board `TRELLO_MAINTENANCE_BOARD_ID`,
  por defecto el board "Mantenimientos"), con el mismo patrón que soporte. Se elimina
  `scripts/refresh-trello-maintenance-cache.js` y su paso en `run-operational-cycle.js`.
  Esquema de BD y contrato de `GET /api/cctv/maintenance` sin cambios; frontend sin cambios.
  Nuevas vars: `TRELLO_MAINTENANCE_BOARD_ID`, `TRELLO_MAINTENANCE_LIST_NAME` (opcional).

### Ciberseguridad — Investigación: dirección IP en los reportes de Kaspersky Security Center
`docs/modulos/ciberseguridad/NOTA-KSC-DIRECCION-IP.md`
- **Contexto:** los 157 equipos que llegan por Kaspersky nunca traen IP (`ip_value` queda
  `NULL`, bandera `MISSING_IP`) — solo se ubican en una subred cuando se corroboran por
  hostname exacto contra un equipo de FortiGate (`getKasperskyInheritedSegments`).
- **Investigado antes de asumir nada:** se recuperó del historial de git el código de
  `Monitor-KSC-HardwareInventory.ps1` y `Monitor-SERV-KSC.ps1` (la carpeta local
  `CRM_Frontend/Monitoreo/` ya no existe). Ambos parsean sus tablas HTML de forma genérica
  (capturan todas las columnas) pero ninguno extrae ni referencia una columna de IP en ningún
  punto — a diferencia de MAC, que sí manejan con variantes con/sin tilde.
  **Conclusión con la evidencia disponible por código:** los reportes de KSC usados hoy
  (Informe de hardware, Amenazas, Vulnerabilidades) no parecen incluir IP.
- **Pendiente:** el usuario va a confirmar directamente en la consola de KSC si existe algún
  otro tipo de reporte con columna de IP disponible para exportar. La nota documenta qué
  cambiaría en `Monitor-KSC-HardwareInventory.ps1`/`ksc-importer.js` si la respuesta es sí.

## [2026-09-11] — specs 0010 y 0011 a producción

Merge de los PR #4 (`857f83f`) y #5 (`4004cce`, `main` actual) y rebuild de `cctv-api` +
`crm-frontend` en `192.168.8.65`. `npm test` 76/76.

### CCTV — "Eventos diarios" como consola operativa (zona, conciliación, resolución)
`specs/0011-eventos-diarios-operacion/`
- **Tarjeta de evidencia ampliada:** muestra el detalle del correo Dahua — **Evento de alarma**
  (`payload.rawEventType`), **Canal de entrada** (`channelRaw`), **Alarma** (`alarm`), fase
  interpretada + retraso, asunto, remitente, IP. Filas vacías se omiten.
- **Legibilidad:** sube un escalón la tipografía y los iconos de las tarjetas de la vista.
- **Conciliar identidades desde la vista:** el panel "Identidades por conciliar" trae un
  buscador de punto canónico + Vincular (`POST /api/cctv/events/identity/link`); al vincular
  refresca la vista y el cuadro se oculta al llegar a 0. Limpieza puntual de los 8 pendientes
  con `scripts/reconcile-eventos-diarios-pendientes-20260910.mjs`.
- **Fuera "Movimiento consolidado":** panel eliminado; `dailyEventsData` deja de devolver el
  array `motionBursts` (se conservan `summary.motionBursts`/`noisyBursts` y la serie
  `hourly[].motion` del gráfico).
- **Resolver inconsistencias de notificación CCTV:** tabla nueva `cctv_notification_resolutions`
  (`platform/schema.sql`, idempotente) + `platform/notification-resolutions.js`. Tres opciones
  por punto: **Solo ping** (`PING_ONLY`, persistente → fuerza `coverage=PING_ONLY`), **Cámara
  sin notificar** (`MISCONFIGURED_NO_NOTIFY`, persistente → sub-lista "En seguimiento"),
  **Falso positivo hoy** (`FALSE_POSITIVE`, solo esa fecha). Rutas
  `POST /api/cctv/notifications/:locationId/resolve` y `.../reopen` (`x-actor`, `audit_log`).
  Respuesta gana `notificationsInFollowUp[]` y `summary.{notificationsInFollowUp,notificationsResolved}`.
- **Tableros por zona:** `dailyEventsData` gana `zoneBoards[]` (`platform/zone-boards.js`, sobre
  los `operationalDays` de spec 0010, sin consultas nuevas). Una tarjeta por zona con cubos de
  5 estados — 🟢 a tiempo · 🟡 abrió tarde · 🔵 cerró · ⚪ sin actividad · 🔴 anomalía —
  (prioridad `ANOMALY > LATE > CLOSED > ON_TIME > IDLE`); "Sin zona" es un tablero propio.
  Click en un cubo resalta el punto en "Señales CCTV de jornada".
- `cctv-automation-final`: `npm test` **76/76** (sin CI). Migración de esquema: la tabla se
  crea en el arranque; hacer backup del `.db` antes del deploy a `.65`.

### CCTV — "Eventos diarios" interpreta la jornada por ventanas operativas + ping
`specs/0010-eventos-diarios-interpretacion/`
- **Problema:** el `event_type` salía solo del nombre de la alarma, sin lógica horaria →
  detecciones matinales como "DESCONOCIDO" siendo la apertura, y "cierres" a las 7 am.
- **Interpretación (`platform/operational-event-policy.js`, `window-config.js`):** por punto y
  día se resuelve la fase de la jornada con el **ping SIIS como vector primario** (transición
  offline↔online), luego evidencia CCTV, luego presencia de ping. Ventanas configurables por env
  (`CCTV_WIN_*`); el **cierre a mediodía viene desactivado** (se solapaba con la mañana y
  marcaba un cierre falso a cientos de puntos que solo seguían online). `interpretPointDay`
  devuelve `phases`, `eventPhases` (clasifica **cada** detección, no una representativa),
  `anomalies`, `notificationConfigInconsistency` (solo `WITH_CCTV` = envió correo Dahua en 30 d)
  e `interpretation`.
- **`GET /api/cctv/events/daily`:** `hourly.openings/closures`, la lista `pointOperations` y sus
  KPIs se calculan por fase interpretada, no por `event_type` crudo. El gráfico por hora solo
  cuenta fases con evidencia real (transición de ping o correo CCTV); la *presencia* de ping no
  es un cierre. Nuevos campos: `operationalWindows`, `notificationInconsistencies[]`,
  `summary.{notificationInconsistencies,outOfWindowDetections,cierreSinApertura,pointsWithOpening}`.
- **`CRM_Frontend/src/pages/CctvModule.jsx`:** badge por fase operativa en el grid de evidencias
  (todas las detecciones de una apertura muestran "Apertura mañana", ya no "DESCONOCIDO"; máx.
  3 tiles por punto), "· tarde Nm", panel "Inconsistencias de notificación CCTV", estado "Sin
  señal en ventana" para puntos cuyas alarmas cayeron fuera de toda ventana.
- Nuevas vars: `CCTV_WIN_OPEN_AM`, `CCTV_WIN_OPEN_PM`, `CCTV_WIN_CLOSE_PM`,
  `CCTV_WIN_CLOSE_MIDDAY` (vacía = desactivada), `CCTV_WIN_GRACE_MIN`,
  `CCTV_PING_EVENT_TOLERANCE_MIN`. `cctv-automation-final`: `npm test` 64/64 (sin CI).
- **Deuda conocida:** `GET /api/cctv/events/daily` tarda ~6 s (previo a 0010; 0010 suma ~0,6 s).

## [2026-09-09] — spec 0009 a producción

Merge del PR #2 (`main` = `f3bad12`) y rebuild de `crm-frontend` en `192.168.8.65`.

### CRM_Frontend — Bots Gane Palmira: tiempo real y rediseño premium
`specs/0009-bots-tiempo-real-rediseno/`
- **Rediseño visual base (Tanda A):** se quita el "Monitor de Actividad" de Bot Comercial
  (las 3 vistas quedan con la misma estructura). `src/components/Panel.jsx` y `MiniBars.jsx`
  extraídos y rediseñados (índice de posición, valor/porcentaje alineados, top-1 con acento,
  tipografía del design-system). `TopUsersBoard` gana modo `compact` (fila ~44 px) → los 3
  rankings ocupan bastante menos.
- **Tablas Personas/Clientes más legibles (Tanda B):** `src/components/entityBits.jsx` —
  `StatusPill` (icono + color por estado), `CategoryChips` (color estable por nombre, +N),
  `LastActivity` (relativa + fecha absoluta en `title`). "No disponible" resaltado en ámbar.
- **Feedback en vivo (Tanda C):** al cambiar un KPI, pulso sutil del borde. Las tablas se
  ordenan por última actividad y, al llegar un `update` por SSE, la fila reciente sube a la
  primera posición y se resalta ~2 s. Punto "en vivo" en la cabecera. Todo se anula con
  `prefers-reduced-motion`. Nuevo `src/hooks/usePrevious.js`.
- **Paridad de Betty (Tanda D):** conmutador **Resumen / Detalle** (como Oskitar); el Detalle
  añade "pasos más transitados" y el desglose de "No disponible". La "Actividad por día" de
  Betty se deja en una serie honesta ("Eventos del bot"): el `messages.log` no trae fecha ni
  dirección, así que una serie "entrantes vs salientes" sería un dato fabricado.

## [2026-09-09] — specs 0002–0006 a producción (`192.168.8.65`)

Merge del PR #1 (`main` = `eeca883`, fast-forward de 26 commits) y despliegue: rebuild de
`crm-frontend` + **estreno de `chatbot-analytics`** (:3008) en prod. Contenido:

### CRM_Frontend — Polish: tipografía de encabezados, avatar de bot, ranking Top 5
`specs/0006-polish-tipografia-ranking/`

- **Estándar de encabezado de módulo.** `design-system.md` §3: el `<h1>` superior de cada
  página usa `text-2xl font-bold tracking-tight` + subtítulo `text-sm font-medium` en frase
  (antes `text-lg font-black` + micro-etiqueta en mayúsculas). Nuevo
  `src/components/PageHeader.jsx` (`{ icon, title, subtitle, actions }`), adoptado en las 3
  vistas de bots y en Contactos; normalizados en el sitio los `<h1>` de `UsersDashboard` y
  `MonitoringDashboard`. CCTV y Ciberseguridad conservan su encabezado premium-dark propio;
  `Monitoring`/`ServicesTI` inyectan su título en la barra superior del layout (sin cambio).
- **Avatar de bot.** `chatbot-analytics/image/{Comercial,Oskitar,Betty}.png` optimizados a
  256 px → `src/assets/bots/`. `botKit.jsx`: `BOT_AVATARS` + `<BotAvatar bot size>` (imagen
  circular con `ring` de token y `onError` → icono lucide). En el encabezado de cada vista de
  bot y en el conmutador de bots.
- **Ranking Top 5 premium.** Nuevo `src/components/TopUsersBoard.jsx` (board compacto Top 5,
  oro/plata/bronce 1-3; fila → `ContactDrawer`). En Bot Comercial va arriba y la tabla
  completa (podio Top 3 + búsqueda + filtro de canal + CSV) se pliega tras "Ver tabla
  completa". Oskitar (`topUsers`) y Betty (`topCustomers`) muestran el mismo board sobre su
  tabla de personas/clientes.

### CRM_Frontend — Módulo "Bots Gane Palmira" (ex Analítica de Agentes)
- **Detalle y consistencia del módulo** (`specs/0005-bots-gane-palmira/`, tandas 1-3):
  - Módulo renombrado a **"Bots Gane Palmira"**; cabecera compacta (sin título duplicado);
    conmutador de bot arriba.
  - **Submenú por bot** en el sidebar; rutas `/bots/comercial|oskitar|betty` (`/` redirige);
    el conmutador de pestañas sincroniza la URL.
  - `src/components/botKit.jsx`: `KpiCard`, `PeriodSelect` y `BotSummary` **compartidos** por
    las 3 vistas. Oskitar y Betty ahora usan el mismo `KpiCard` y el mismo selector de periodo
    (`Hoy 24h / 7 días / mes / año`) que Bot Comercial.
  - **Resumen en lenguaje natural** al inicio de cada vista (generado de los KPIs del periodo).
  - Quitado el KPI "Cobertura SIISS" de Bot Comercial.
- **Ficha de contacto + historial por bot** (`specs/0005-bots-gane-palmira/`, tanda 4):
  - Nuevo `src/components/ContactDrawer.jsx`: drawer lateral **solo lectura** con datos del
    contacto (teléfono, documento, primera/última interacción, nº de conversaciones), estado
    (`escalado` / `resuelto` / `no disponible` / `atendido`), categorías/flujos y la
    **transcripción de la conversación** tipo chat, con separadores de fecha y "cargar
    mensajes anteriores" (`useInfiniteQuery`, páginas de 200).
  - Se abre desde la fila de la tabla de **Personas** (Oskitar), **Clientes** (Betty) y del
    **Ranking** (Bot Comercial) — botón "Ficha".
  - `chatbotAnalytics.service.js`: `getContact(bot, id, {limit, offset})`.
  - `crm.service.js`: `getContactByProvider(providerId, {limit, offset})` — historial del Bot
    Comercial desde Supabase (`interactions_log` por `provider_id` + identidades hermanas),
    devuelto con la misma forma que el endpoint del servicio para reutilizar el drawer.

### CRM_Frontend — Analítica de Agentes · Integración Oskitar / Betty
- **Analítica de chatbots nativa** (`specs/0004-integracion-analitica-chatbots/`, `ADR-0002`):
  el conmutador del módulo pasa a 3 pestañas — **Bot Comercial · Oskitar · Betty**. Oskitar y
  Betty son nativas (Recharts + tokens, no iframe), consumen la API JSON + SSE del nuevo
  servicio `chatbot-analytics`. KPIs, series por día/hora, embudo (Oskitar), categorías,
  flujos (Betty), tablas de personas/clientes, filtro de rango y categoría, export CSV y
  refresco en vivo por SSE.
- Se **retira "Bot Soporte Técnico"** del módulo (embebía `chatbot-soporte`).
- Se **retira el módulo "Centro de Soporte"** (`/support` + nav): la analítica de soporte vive
  ahora en la pestaña Oskitar. Página conservada en el árbol, sin ruta.

### Infra / Docs
- **Servicio `chatbot-analytics`** (`specs/0004`, `ADR-0002`): panel gerencial Express
  (Oskitar + Betty) incorporado al repo; `Dockerfile` propio; servicio en `docker-compose*`
  (host 3008 → contenedor 3000), lee los logs de los bots por SSH; CORS abierto para el CRM.
  Nueva build-arg `VITE_CHATBOT_ANALYTICS_URL`. `.env` con credenciales SSH **no versionado**.
- **Servicio `chatbot-analytics` · endpoint de ficha de contacto** (`specs/0005`, tanda 4):
  nuevo `GET /api/<bot>/contact?id=<tel>&limit=&offset=` (`lib/contact.js`) — reconstruye
  datos + transcripción de un teléfono desde lo ya cargado en memoria (`state.events` /
  `state.betty`), **sin releer logs ni recalcular el modelo**. Respeta `MASK_PHONES` (resuelve
  el `id` enmascarado por `maskPhone(peer) === id`). Aditivo: no cambia el contrato de las
  rutas existentes → sin ADR. Betty: solo mensajes del cliente (el log no trae hora ni
  respuestas del bot) + recorrido de la máquina de estados.
- **Modelo de trabajo SDD y gobernanza** (`specs/0001-modelo-de-trabajo-sdd/`, `ADR-0001`):
  documento canónico `docs/WORKING_MODEL.md` + punteros por herramienta de IA
  (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`); estructura
  `specs/`; `docs/adr/` y `docs/lecciones-aprendidas/` a nivel raíz; `docker-compose.local.yml`
  (override, no toca el base) + `docs/operacion/despliegue-local.md`; CI
  `.github/workflows/crm-frontend.yml` (build bloqueante; lint informativo hasta que el
  frente de estandarización — `specs/0003` — lo lleve a 0); `.github/pull_request_template.md`;
  `CRM_Frontend/docs/design-system.md`. Sin impacto en producción.

### CRM_Frontend — Analítica de Agentes
- **Ranking de Usuarios & Zonas** (`specs/0002-analitica-agentes-ranking/`, spec retroactiva):
  - `getUserRanking` respeta el rango de tiempo real (`24h`/`7d`/`1m`/`1y`) en vez de forzar
    mínimo 30 días; mismo criterio que `getDashboardStats`.
  - Paginación de la tabla completa (15 por página) con controles e indicadores; se oculta
    con ≤ 15 usuarios.
  - Filtro por canal (Todos / WhatsApp / Telegram), orden por columnas (`# Pos.`,
    `Total Mensajes`) y exportación a CSV del ranking filtrado y ordenado (BOM UTF-8).
  - Buscador y todos los filtros resetean la paginación a la página 1.
  - Pase de diseño: superficies y tipografía alineadas con el ADN premium de la cabecera;
    tokens de tema en vez de `bg-white/5` / `border-white/10`.

---

## Historial previo

Antes de este changelog, el registro de cambios vivía en el historial de Git y en
`PROYECTO_CONTEXTO.md`. Ver `git log` para lo anterior a 2026-09-07.
