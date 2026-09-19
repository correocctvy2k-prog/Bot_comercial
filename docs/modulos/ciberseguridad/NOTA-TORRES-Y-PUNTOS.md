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

## Pendiente (fuera de esta fase, ver spec 0013 §4)

Modelo completo de torre (enlaces, celdas, router principal, UPS — hoy son secciones
"sin datos todavía" en la tarjeta expandida, preparadas para cuando lleguen),
monitoreo en vivo (caída/latencia/ancho de banda), detección de vulnerabilidades de
firmware, y los 2 puntos reales de Bolo (`LUCERNA`, `BOMBA LAURO`) que no caen en su
gateway `/28` — brecha real confirmada por el usuario, no una máscara mal transcrita
como los casos anteriores.
