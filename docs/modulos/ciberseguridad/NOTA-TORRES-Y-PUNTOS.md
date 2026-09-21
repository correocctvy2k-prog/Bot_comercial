# Nota técnica — Torres y puntos (spec 0013, fase 1)

Estado: **implementado y verificado en Docker local**, 2026-09-18. Detalle completo,
histórico de hallazgos y preguntas abiertas en
[`specs/0013-inventario-torres-haplite-nvr/`](../../../specs/0013-inventario-torres-haplite-nvr/).

## Qué es

El módulo Ciberseguridad ahora navega por **torres reales de telecomunicaciones**
(14, con nombre y gateway/CIDR reales, entregadas por el usuario) → **puntos
conocidos de cada torre** (los que ya tienen CCTV) → **hAP lite + su(s) dispositivo(s)
DSS** (NVR, cámara, alarma o ANPR).

Fuente de verdad de qué torre existe: una lista real del usuario (`torres_HapLite.pdf`,
transcrita a `cybersecurity/raw/torres/`, gitignored). **No** el campo `organization`
de `dss_device_registry` — se verificó que mezcla varias torres reales bajo una misma
zona en 2 de 13 casos (Candelaria y Occidente).

## Cómo se arma un punto

- Un candidato **hAP lite** viene de la semilla real (`cyber_towers`/`cyber_tower_points`).
- Su(s) grabador(es)/cámara(s) vienen de **`dss_device_registry`** (`cctv-automation-final`,
  servicio aparte, solo lectura) — nueva fuente `DSS` en `cyber_asset_observations`,
  emparejada por **IP compartida** (la IP observada de un NVR es siempre la del hAP lite,
  por el NAT del punto, nunca la IP interna propia del NVR).
- **FortiGate corrobora muy pocas IPs de hAP lite** (7 de 96 medidas) — se muestra como
  señal opcional de "en línea", nunca como requisito para que un punto aparezca.

## Verificado contra datos reales (no solo tests)

- 15 torres cargadas (14 reales + 1 celda "no es una torre", alojada en el Edificio
  Principal), 96 puntos con hAP lite conocido, 93 con dispositivo DSS ya identificado.
- Confirmado a través del stack real en Docker local (`http://127.0.0.1:3003/api/
  cybersecurity/towers`), no solo con scripts directos.

## Hallazgo real durante la implementación: migración de `cyber_source_systems`

Una base ya existente (creada antes de esta spec — **incluida `.65` en producción**)
tiene `cyber_source_systems.source_type` con un `CHECK` que no incluye `'DSS'`.
SQLite no soporta `ALTER` de un `CHECK` existente. `db/open-database.js` ahora
automigra esa tabla al abrir la base (crea la tabla nueva con el `CHECK` correcto bajo
un nombre temporal, copia los datos, borra la vieja, renombra la nueva a su lugar).

**Un primer intento de esa migración (renombrar la tabla vieja en vez de crear la
nueva bajo un nombre temporal) era incorrecto**: `ALTER TABLE ... RENAME TO` en SQLite
reescribe automáticamente las cláusulas `FOREIGN KEY` de las tablas hijas para apuntar
al nuevo nombre — `cyber_source_snapshots` terminaba con su FK apuntando a la tabla de
respaldo, que luego se borraba, dejando toda la base con referencias huérfanas.
Detectado con `PRAGMA foreign_key_check` contra la base local real, no solo con "no
lanzó error". El fix (nunca renombrar la tabla original, crear la nueva bajo un
nombre temporal y renombrar *esa* al final) tiene test de regresión
(`tests/open-database-migration.test.js`) que replica exactamente el escenario real
(tabla hija con una fila real, verificando `PRAGMA foreign_key_check` vacío después).

## Vista gráfica + todos los puntos (con o sin CCTV)

Pedido del usuario: mismo lenguaje visual que los tableros por zona de CCTV (spec
0011) — tarjetas por torre, agrupadas por zona, con cuadrícula de cubos por punto. Y
mostrar **todos** los puntos de cada zona, no solo los que ya tienen hAP lite.

Hallazgo real: `puntos_venta` (Supabase, Operación de Puntos) ya tiene el campo
`segment` con las 7 zonas operativas reales (`PALMIRA`, `OCCIDENTE`, `CANDELARIA`,
`FLORIDA`, `PRADERA`, `ROZO`, `AMAIME Y EL PLACER`) y `has_cctv` ya viene sincronizado
de verdad (spec 0012) — se reutiliza tal cual, sin pedir ni inventar un dato nuevo.
`ZONE_TOWER_NAMES` (`CybersecurityDashboard.jsx`) mapea cada zona a sus torres
conocidas. Un punto de Operación de Puntos sin hAP lite conocido **no se le inventa
una torre específica** (decisión del usuario) — aparece en una tarjeta aparte "Sin
torre asignada" al final de su zona.

Verificado replicando la lógica de agrupación fuera de React, contra la API real y
Supabase real: las 7 zonas cruzan correctamente, sin ninguna torre faltante.

## Ubicación por IP/gateway: 89% de los puntos reales ya tienen torre

Pedido del usuario: "en base a la IP del punto, podemos deducir su gateway y agregarlo
a su torre". `puntos_venta.ip` ya existe (poblado por un monitor de ping externo,
`monitor_puntos_wpp.py`) para el 100% de los puntos activos (368/368, verificado
contra Supabase real).

`cyber_tower_gateways` (nuevo): antes solo se guardaba un gateway representativo por
torre (`cyber_towers.gateway_cidr`); varias torres reales tienen más de uno (Pradera:
red principal + subred de oficina; Candelaria: igual) — ahora se guardan todos. Un
punto sin hAP lite conocido, si su `ip` cae dentro de cualquier gateway real de una
torre de su misma zona, se ubica ahí automáticamente (sin fusionarlo con el punto ya
conocido si por coincidencia comparte esa misma IP).

**Verificado contra datos reales en vivo: 326 de 368 puntos activos (89%) se ubican
así**, sin inventar ni forzar nada — el resto (42) no cae en ningún gateway conocido y
sigue en "Sin torre asignada". Cobertura real por zona (varía bastante, dato honesto,
no ajustado): Pradera 33/33 (100%), Florida 45/46, Amaime 19/20, Candelaria 67/71,
Palmira 152/154, Occidente 9/19, **Rozo solo 1/25** — la mayoría de los puntos reales
de Rozo no caen en el único gateway de esa torre que ya conocemos, señal de que puede
haber más infraestructura ahí sin capturar todavía.

**Corrección posterior (2026-09-19):** la brecha de Rozo de arriba **no era un hallazgo
de infraestructura — era un dato de máscara mal transcrito.** El usuario, con
conocimiento directo de la red, confirmó que Rozo, Palmaseca y Zamorano Palmira usan
`/23`, no `/24` como se había transcrito del PDF original. Corregido en la semilla real
y recargado: Rozo pasó de 1/25 (4%) a **24/25 (96%)**. Lección: un dato transcrito de un
documento entregado por el usuario sigue siendo una hipótesis hasta que el usuario lo
confirma contra la config real — no una fuente de verdad definitiva por sí sola.

Además, se identificó que 5 de los puntos "sin torre asignada" en realidad son
**puntos conectados por VPN desde internet** (prefijo de IP `10.100.1.`) — no tienen
cobertura de red de torre por diseño, nunca la van a tener, y no deben mezclarse con los
genuinamente pendientes de ubicar. Se muestran en una tarjeta aparte ("Conectados por
VPN", tono violeta en `CubeLegend`). Con ambas correcciones, el total real de puntos sin
torre asignada bajó de 42 a **8**.

**Segunda corrección (mismo día): el match por IP ya no se restringe a la zona propia
del punto.** De esos 8, se investigaron uno por uno: 2 (`LUCERNA`, `BOMBA LAURO`) caen
justo fuera del gateway `/28` de Bolo — el usuario confirmó que esa máscara real es
correcta, así que siguen genuinamente sin torre. Los otros 6 sí tenían un match real,
pero contra una torre mapeada a **otra** zona operativa (2 puntos de Candelaria caen en
la red del Edificio Principal, mapeada solo a Palmira; puntos de Palmira/Amaime caen en
la red de Quisquina, mapeada a Occidente; un punto de Occidente cae en la red de Oriente
Palmira, mapeada a Palmira) — el código antes solo buscaba coincidencias contra las
torres de la propia zona del punto. El usuario decidió: **la red real manda sobre la
etiqueta de zona** — ahora el match se calcula contra todas las torres conocidas, sin
restringir a la zona. El punto aparece en la tarjeta de la torre real que lo contiene,
aunque esa torre esté en la sección de otra zona. **Resultado verificado: 361 de 368
puntos activos (98%) ubicados por IP** — solo quedan los 2 de Bolo, brecha real
confirmada, no ajustada.

## Leyenda de colores y detalle al pasar el cursor

Pedido del usuario ("necesito entender los colores"): un solo significado por color en
toda la vista de Torres, mostrado en una leyenda (`CubeLegend`) — verde = grabador DSS
confirmado, ámbar = hAP lite conocido sin grabador, azul = ubicado por IP sin hAP
lite/DSS confirmado, gris = sin torre asignada, violeta = conectado por VPN.
Pasar el cursor sobre cualquier cubo abre una tarjeta flotante (`PointFloatingCard`) con
el detalle del punto (nombre, torre, IP, zona, CCTV/FortiGate/grabadores) — cambiado de
click a hover el 2026-09-19 (pedido del usuario), sin overlay de "clic afuera" ni Esc
porque ya no hace falta.

## Estado vivo del hAP lite y del NVR (2026-09-21)

Pedido del usuario: mostrar en la tarjeta del punto el estado del hAP lite, si el
puerto NAT del NVR (4455/4456) responde, y la latencia. Antes de construir se
investigó qué servicio del ecosistema ya tiene ruta de red real a las redes de torre
(`192.168.x.x`): **`cybersecurity-api` no tiene ninguna** (contenedor
deliberadamente bloqueado, `read_only`/`cap_drop: ALL`, nunca ha hecho una conexión
activa a nada). El único camino probado es `monitor_puntos_wpp.py` (corre en
`comercial-bot`, ya hace ping+latencia a los ~368 puntos activos de Operación de
Puntos). Se extendió ese script en vez de construir infraestructura de red nueva
(decisión del usuario): `check_nvr_port(ip)` intenta TCP a 4455 y luego 4456, solo si
el ping al hAP lite ya fue exitoso, dentro del mismo `ThreadPoolExecutor` que ya
paraleliza el ping. Escribe `nvr_port`/`nvr_checked_at` en `puntos_venta` junto a
`active`/`latency` que ya escribía.

**Pendiente de aplicar**: `cybersecurity/sql/0013-add-nvr-port-columns.sql` — el
usuario debe correrlo en el editor SQL de Supabase antes de que el dato real
aparezca (mismo patrón que `Asamblea/sql/`, nunca DDL automático contra una base de
producción compartida). Mientras tanto, la tarjeta muestra "Sin datos todavía" en vez
de un falso "Sin conexión". El dato nunca se presenta como "en vivo": el script corre
bajo demanda (comando de WhatsApp), no en un intervalo fijo, así que la tarjeta
siempre muestra hace cuánto se revisó.

**Corrección real tras aplicar la migración (2026-09-21)**: el usuario corrió la
migración y reportó que los puntos confirmados (hAP lite + CCTV) no mostraban ningún
estado, y los puntos azules ("ubicado por IP") mostraban "hAP lite: En línea" sin
tener esa tecnología confirmada. Investigado con datos reales: **`puntos_venta.ip`
nunca es la IP del hAP lite, ni siquiera para los puntos confirmados** — son dos
dispositivos distintos en el mismo punto físico. Caso real: "AMAIME I" tiene hAP lite
en `192.168.12.58` (lista real de torres/DSS) pero `puntos_venta.ip` =
`192.168.12.41` (misma subred, otro host — casi seguro el equipo de apuestas por
WiFi, no el hAP lite en Eth4). **0 de 96 IPs de hAP lite conocidas coinciden con
`puntos_venta.ip`.** Corregido: la fila de ping ya nunca dice "hAP lite" — dice
"Punto (ping)" (lo que de verdad mide: la conectividad del equipo de apuestas, ya
monitoreado por Operación de Puntos), mostrando la IP realmente medida cuando difiere
de la del hAP lite. Los puntos confirmados sin match muestran "Sin dato de
conectividad" con la explicación, en vez de un "Sin datos todavía" engañoso.
**Sigue pendiente, sin resolver**: monitorear la IP real del hAP lite requeriría que
`monitor_puntos_wpp.py` conozca esa lista, que hoy vive solo en el SQLite local de
`cybersecurity` (`cyber_tower_points`), no en Supabase — decisión de arquitectura
nueva, no un ajuste de UI.

## Firmware inicial, sin verificar (2026-09-21)

Mismo pedido del usuario, para sentar la base de detección de vulnerabilidades:
ningún servicio del ecosistema escanea firmware activamente contra las redes de
torre hoy (Greenbone es un relevo de archivos aislado, sin conector en vivo). Se
encontraron versiones de firmware reales ya guardadas en `cctv-automation-final`
(`stg_inventory_locations`, staging de un import manual de Excel) — importadas como
dato inicial, marcado explícitamente `CCTV_STAGING_UNVERIFIED`, nunca mezclado con
fuentes corroboradas como DSS o FortiGate. **79 de los 96 puntos conocidos (82%)** ya
muestran firmware en la tarjeta, siempre rotulado "sin verificar" + hace cuánto se
importó (la corrida más reciente vista tiene semanas — se desactualiza rápido, tal
como advirtió el usuario). El escaneo activo real de firmware queda como decisión de
arquitectura aparte.

## Pendiente (fuera de esta fase, ver spec 0013 §4)

Modelo completo de torre (enlaces, celdas, router principal, UPS — hoy son secciones
"sin datos todavía" en la tarjeta expandida, preparadas para cuando lleguen),
escaneo activo real de firmware/vulnerabilidades (hoy solo hay un dato inicial sin
verificar, ver arriba), aplicar la migración SQL pendiente de Supabase, y los 2
puntos reales de Bolo (`LUCERNA`, `BOMBA LAURO`) que no caen en su gateway `/28` —
brecha real confirmada por el usuario, no una máscara mal transcrita como los casos
anteriores.
