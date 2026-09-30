# SPEC 0013 — Inventario de torres: hAP lite + NVR por punto (fase 1)

- **Estado:** **Cerrada — desplegada y verificada en `.65` (2026-09-30, PR #20)**.
  Ver `tasks.md` para el detalle verificado punto por punto y
  `docs/lecciones-aprendidas/LL-0008-deploy-65-seed-antes-de-rebuild.md` para el
  incidente real del deploy.
- **Autor:** Claude (a partir de la descripción de infraestructura del usuario, 2026-09-18)
- **Fecha:** 2026-09-18
- **Módulos afectados:** `cybersecurity/` (backend + `CRM_Frontend/src/pages/CybersecurityDashboard.jsx`, vista Inventario). Lee, sin modificar, `cctv-automation-final` (`dss_device_registry`).
- **Rama:** `feat/0013-inventario-torres-haplite-nvr`
- **PR:** [#20](https://github.com/correocctvy2k-prog/Bot_comercial/pull/20) — mergeado 2026-09-30

## 0. Contexto de infraestructura (para no perder el detalle del usuario)

Descrito por el usuario el 2026-09-18, verbatim resumido:

- La empresa tiene **14 torres de telecomunicaciones**. Cada torre tiene: enlaces
  inalámbricos hacia otras torres (backhaul), **celdas** (AP punto-a-multipunto) que
  conectan los puntos de venta del sector, algunos **enlaces punto a punto** dedicados
  (oficinas/sitios críticos), un **router principal** (gateway de toda la red de la
  torre) y **UPS con tarjeta de red**.
- En cada **punto de venta**: una antena cliente conectada a la celda de su torre,
  alimentada por **PoE**, en el mismo segmento que el equipo del punto. Dos subredes
  aparte cuelgan de un **MikroTik hAP lite**: **CCTV/Alarmas** (siempre en **Eth4**) y
  un equipo de apuestas por **WiFi**.
- El **NVR tiene su propia IP interna**, pero solo se accede por **NAT del hAP lite**
  (puerto **4455 o 4456**) — en la práctica, **la IP que se observa es la del hAP
  lite**, no la del NVR.
- Meta: en el módulo de Inventario, navegar **grupo de torres → (enlaces, celdas,
  puntos conectados a cada una)**, y un **grupo de hAP lite con sus NVR/cámaras con
  grabación integrada**, con monitoreo de caída/latencia/ancho de banda y detección
  temprana de **vulnerabilidades de firmware**.
- Los datos reales de IP de torres y sus equipos **llegarán más adelante**. Mientras
  tanto: **empezar por lo que ya se tiene — hAP lite y NVR**.

### 0.1 Actualización 2026-09-18 (misma jornada) — el usuario entregó la lista real de torres

El usuario compartió `torres_HapLite.pdf`. Transcrita a
`cybersecurity/raw/torres/torres-haplite-real-20260918.json` (104 filas) —
**gitignored a propósito** (`raw/` completo, mismo patrón que el resto de capturas
reales de este módulo: nunca viaja por git, son IPs y nombres reales de la red de
seguridad de la empresa), disponible localmente para cuando se implemente §3.3/§3.6.

**14 torres reales, con nombre propio**
(`Cafetero Palmira`, `Sharon Palmira`, `Zamorano Palmira`, `Oriente Palmira`,
`Florida`, `Pradera`, `Villagorgona`, `Amaime`, `Palmaseca`, `Rozo`, `Candelaria`,
`Juanchito`, `Bolo`, `Quisquina`), cada una con su **gateway** (CIDR real, ej.
`192.168.44.1/23` para Cafetero Palmira) y la lista de **hAP lite por punto** (nombre
del punto + IP). Una fila adicional, **explícitamente marcada "No es una torre"**
(`192.168.36.1/24`): el usuario aclaró que es **una celda ubicada en el Edificio
Principal de Palmira que sirve a algunos puntos cercanos**, no una torre — coincide
con la exclusión de `EDIFICIO PPAL` ya acordada en §9.1, y confirma que una celda
puede estar alojada en un sitio que no es torre.

Dos aclaraciones más del usuario, importantes para no sobre-interpretar esta lista:
- **Incompleta a propósito**: "los puntos aquí relacionados solo son los que tienen
  sistema CCTV de cada zona, obviamente hay muchos más puntos conectados a cada
  torre" — esta lista NO es el censo completo de puntos por torre, solo los que ya
  tienen CCTV.
- **Sistema operativo por rol**: "los puntos de venta solo tienen equipos con Ubuntu,
  los equipos Windows son usados para el personal administrativo y las cajas en las
  diferentes oficinas" — dato útil para una futura heurística de clasificación (un
  Windows detectado en un segmento de punto de venta sería una anomalía, no el
  equipo normal de atención), no se actúa sobre esto en esta fase.

**Verificado cruzando esta lista contra los datos reales que ya se tenían** (104 filas
del PDF, 96 IPs de hAP lite únicas, 15 grupos incl. el "no es una torre"):

- **Contra `dss_device_registry` (111 dispositivos)**: 93 de las 96 IPs de hAP lite
  tienen al menos un dispositivo DSS en esa misma IP — confirma la tesis central del
  usuario (IP observada = hAP lite) con evidencia cruzada, no solo su palabra. **3 IPs
  sin ningún dispositivo DSS todavía** (`192.168.14.69` "La Discordia Palmira",
  `192.168.32.46` "La Victoria Florida", `192.168.24.202` "Parque Pradera") — puntos
  con hAP lite conocido pero sin CCTV reconciliado en DSS aún, o reconciliado con otro
  nombre; no se investigó más en esta ronda.
- **Hallazgo importante — la zona/`organization` de DSS NO es un proxy confiable de
  torre real**, contrario a lo que parecía en la respuesta inicial del usuario a
  §9.1 (que fue una aproximación de memoria, no contra este dato). Verificado por
  cruce de IP: la zona DSS `CANDELARIA` en realidad mezcla **3 torres reales
  distintas** (Candelaria, Juanchito, Villagorgona); la zona DSS `OCCIDENTE` es un
  **cajón de sastre que mezcla 5 torres reales** (Bolo, Oriente Palmira, Palmaseca,
  Quisquina, Zamorano Palmira). El resto de zonas DSS sí corresponden 1:1 a una sola
  torre real (`RED 14`→Zamorano Palmira, `RED 20`→Sharon Palmira, `RED 34`→Oriente
  Palmira, `RED 36`→la celda "no es una torre" del Edificio Ppal, `RED 44`→Cafetero
  Palmira, `AMAIME`→Amaime, `FLORIDA`→Florida, `PRADERA`→Pradera, `ROZO`→Rozo).
  **Consecuencia directa para el diseño (§3, revisado más abajo): la torre de un
  punto ya NO se infiere de `dss_device_registry.organization` — se toma de esta
  lista real del usuario, que pasa a ser la fuente de verdad.**
- **Contra las observaciones de FortiGate**: solo **7 de las 96 IPs de hAP lite**
  aparecen en el inventario de FortiGate (`diagnose user device list`) — consistente
  con el patrón ya visto con Kaspersky (spec de la ronda anterior: 49 de 157 IPs de
  Kaspersky tampoco caían en ningún CIDR conocido por FortiGate). Conclusión: la red
  de las 14 torres es, en su gran mayoría, **invisible para FortiGate** (probablemente
  corre por infraestructura propia/ISP distinta a la red central que audita el
  firewall) — la corroboración cruzada con FortiGate debe tratarse como una señal
  **opcional y rara**, nunca como el mecanismo principal de identificación de un hAP
  lite (revisa el punto 3 de §3, que originalmente la asumía como principal).

### 0.2 Actualización 2026-09-18 (misma jornada, 3ª–4ª ronda) — jerarquía real: Zona → Sitio → Punto, y por qué importan los sitios sin CCTV

El usuario aportó la agrupación **operativa** real, aclarando que difiere de lo que
`torres_HapLite.pdf` (§0.1) sugería como plano: lo que §0.1 llamaba "torre" en varios
casos es en realidad un **sitio dentro de una zona** más amplia, y **no todo sitio
tiene una torre real** ("pueden haber otras veredas cercanas y no todos estos sitios
cuentan con torre" — palabras del usuario). **Explícitamente marcado por el usuario
como información general para uso futuro** ("eventualmente vamos a requerir para
organizar mejor el inventario") — no cambia el alcance de la fase 1 (§3), que sigue
usando la lista plana de §0.1 tal cual. Se registra aquí para no perderla y para que
la fase 2 (jerarquía completa de torre, fuera de alcance por §4) parta de esto en vez
de tener que volver a preguntar.

**Zonas operativas (7), con los sitios que el usuario ya nombró dentro de cada una**:

| Zona | Sitios dentro de la zona (tal como los dio el usuario) |
|------|----------------------------------------------------------|
| Palmira | Sharon, Cafetero, Oriente, Zamorano, Edificio Principal |
| Occidente | Bolo, Tiendanueva/Quisquina, Palmaseca |
| Candelaria | Villagorgona, Juanchito, Carmelo, Ciudad del Campo, Poblado Campestre, Cabuyal (+ posibles veredas cercanas sin nombrar) |
| Florida | Tarragona, San Antonio los Caballeros |
| Pradera | Lomitas |
| Amaime | (zona pequeña, sin sub-sitios adicionales mencionados) |
| Rozo | (zona pequeña, sin sub-sitios adicionales mencionados) |

**Lo que ya se puede cruzar contra §0.1 sin preguntar de nuevo**: `Tiendanueva`/
`Quisquina` (Occidente) es el mismo sitio que la fila "Quisquina" de §0.1 (punto único
"Tienda Nueva", `192.168.22.31`) — coincide el nombre y es coherente que el usuario dé
el nombre completo del punto como alias de la vereda.

**Resuelto por el usuario (misma jornada, 4ª ronda)**: Carmelo, Ciudad del Campo,
Poblado Campestre, Cabuyal (Candelaria), Tarragona, San Antonio los Caballeros
(Florida) y Lomitas (Pradera) **son sitios reales — veredas/sectores pequeños que se
conectan a la torre más cercana de su zona** — no aparecen en `torres_HapLite.pdf`
(§0.1) simplemente porque **no tienen CCTV todavía**, no porque no existan. Confirma
la lectura correcta: la lista de §0.1 es un subconjunto (solo CCTV) de un universo de
sitios más grande que sí opera y se monitorea hoy.

**Por qué importan aunque no tengan CCTV (palabras del usuario, 3 razones)**:
1. El módulo de **seguridad perimetral monitorea apertura y cierre de todos los
   puntos, con o sin CCTV** — coincide con el mecanismo ya construido en
   `cctv-automation-final` (spec 0010: PING como vector primario de apertura/cierre,
   evidencia CCTV como corroboración secundaria, no requisito) — esos sitios sin
   cámara ya están cubiertos por ese lado, aunque este módulo (Ciberseguridad) todavía
   no los vea.
2. **La cobertura CCTV crece constantemente** — la lista de §0.1 quedará desactualizada
   pronto casi por diseño; cualquier import (§3.2) debe ser re-ejecutable, no una carga
   de una sola vez (ya reflejado en `plan.md`).
3. **Deben sincronizarse con "Operación de Puntos"** (Supabase `puntos_venta`) — el
   universo completo de sitios (con y sin CCTV) ya vive ahí, y **ya existe el mecanismo
   de reconciliación**: spec 0012 (`platform/crm-points-sync.js`,
   `matchCrmPoints`/`computeCapabilities` en `cctv-automation-final`) ya empareja
   `cctv-automation-final` contra `puntos_venta` por código SIIS/alias, y ya corrige
   `has_cctv`/`has_alarm` en Supabase con datos reales. **La fuente de verdad de "qué
   sitios existen" para la jerarquía completa de torres (fase 2) no debería ser
   `torres_HapLite.pdf` ni `dss_device_registry` por separado — debería apoyarse en
   `puntos_venta`, igual que ya hace spec 0012 para CCTV.** No se actúa sobre esto en
   fase 1 (sigue usando la lista plana de §0.1 tal cual), mismo motivo que el resto de
   esta sección: alcance explícitamente diferido a cuando se retome la jerarquía
   completa (§4).

**Mencionado de pasada en la 3ª ronda, registrado sin accionar**: el `dss_device_
registry` ya reporta **115 dispositivos hoy** (111 fue la medición del §0.1, misma
jornada) — "discrepancia menor" por instalaciones recientes, palabras del usuario.

## 1. Problema / oportunidad

El módulo Ciberseguridad hoy modela activos como una lista plana de observaciones
(FortiGate/Kaspersky/Greenbone) con clasificación genérica (`NETWORK`, `CCTV`, etc. —
`inventory-analyzer.js:classifyObservation`). No existe ningún concepto de **punto de
venta**, **torre** ni **agrupación hAP lite + su NVR** — un MikroTik y su grabador
Dahua aparecen como dos candidatos sueltos sin relación visible, aunque en la realidad
física comparten IP (la del hAP lite) y ambos "pertenecen" al mismo punto.

Aparte, ya existe un inventario real y curado de 91 NVR/DVR + 20 cámaras/alarmas/ANPR
(`cctv-automation-final`, tabla `dss_device_registry`, 111 filas, reconciliado a 13
zonas) que el módulo Ciberseguridad **nunca ha leído** — es un servicio y una base de
datos completamente aparte. Verificado 2026-09-18: ese registro **sí trae IP y nombre
por dispositivo**, pero su campo `organization` (zona) **no es un proxy confiable de
torre real** — mezcla varias torres bajo una misma zona en al menos 2 de 13 casos (ver
§0.1). La torre real de cada punto se toma de la lista entregada por el usuario
(`torres_HapLite.pdf`, §0.1), no de `dss_device_registry.organization`.

## 2. Objetivo

Que el módulo de Inventario muestre, para los puntos donde ya hay datos, **un activo
compuesto por punto**: hAP lite + su NVR/cámara asociada, en vez de dos candidatos sin
relación — sentando el modelo de datos (torre, punto, dispositivo) que se completará
cuando lleguen los datos reales de IP de torres.

## 3. Alcance (fase 1 — lo que se hace ahora)

1. **Confirmación del listado DSS.** El usuario revisa el listado de 111 dispositivos
   ya extraído (`dss_device_registry`) y marca las excepciones reales — el propio
   usuario adelantó que "son la mayoría [correctas], solo hay algunos casos puntuales
   en los que se maneja de manera diferente". Sin esta confirmación no se avanza al
   punto 2.
2. **Nueva fuente `DSS` en el read-model de Ciberseguridad.** Igual que
   `ksc-importer.js` trajo Kaspersky desde Monitoreo IT, un importador nuevo trae
   `dss_device_registry` (solo lectura, sin tocar `cctv-automation-final`) como fuente
   corroborante (`cyber_source_systems.source_type = 'DSS'`) — nombre, tipo
   (NVR/IPC/DVR-XVR/Alarm/ANPR), modelo e IP (aclarando en metadata que esa IP es la
   del hAP lite, no la del propio NVR, por la razón de negocio del §0).
3. **Torre real como semilla de datos (revisado tras §0.1).** La lista entregada por
   el usuario (`torres_HapLite.pdf`: 14 torres + 1 celda "no es una torre", 104 filas
   torre↔hAP lite) se carga como **datos semilla reales** (no inventados, no
   inferidos) — 15 grupos, cada uno con su nombre, gateway/CIDR, y las IPs de hAP lite
   que ya se conocen en él. Es la fuente de verdad para "¿a qué torre pertenece este
   punto?" — **no** `dss_device_registry.organization` (§0.1: no es confiable para
   esto). Explícitamente parcial (solo puntos con CCTV ya conocido, el usuario avisó
   que hay más puntos por torre sin listar aquí todavía) — no se trata como el censo
   completo de cada torre.
4. **Agrupación por punto (IP compartida).** Una fila semilla (torre + hAP lite IP) y
   una fila `DSS` con la **misma IP** son, por definición del negocio, el mismo punto.
   FortiGate puede corroborar la IP del hAP lite cuando la observa (uso opcional,
   bonus de "en línea/fuera de línea" cuando exista) — verificado que esto ocurre en
   **muy pocos casos** (7 de 96 IPs de hAP lite conocidas, §0.1), así que el diseño no
   depende de FortiGate para identificar ni agrupar un punto.
5. **Vista nueva o sección en Inventario**: "Torres y puntos con hAP lite + CCTV" —
   navegación por torre real (nombre, no zona DSS) → puntos conocidos de esa torre →
   hAP lite + su(s) dispositivo(s) DSS (NVR/cámara/alarma/ANPR), con estado de
   conectividad si FortiGate llegó a observarlo (raro, ver punto 4).
6. **`cyber_towers` con datos reales, no provisionales.** A diferencia del plan
   original (zonas DSS como placeholder — ya descartado, §0.1): se crea con **las 14
   torres reales** (nombre, gateway/CIDR) que el usuario ya entregó, más la celda "no
   es una torre" marcada explícitamente como tal (no como torre 15). Ningún dato
   inventado — lo que no está en la lista del usuario no se muestra como si existiera
   (ej. enlaces, celdas, router principal, UPS: siguen sin datos, ver §4).

## 4. No-objetivos (fase 1 — explícitamente fuera)

- **Modelo completo de Torre**: enlaces inalámbricos entre torres, celdas (salvo la
  única ya identificada como "no es una torre"), IP del router principal, UPS con
  tarjeta de red — la lista real de §0.1 solo da nombre+gateway+hAP lite por punto,
  no estos otros datos; llegarán más adelante. Esta spec solo carga lo que sí llegó
  (§3.6).
- **Censo completo de puntos por torre**: la lista de §0.1 es explícitamente parcial
  (solo puntos con CCTV ya conocido) — no se asume ni se muestra como si fuera el
  listado completo de puntos de cada torre.
- **Monitoreo en vivo** (caída, latencia, ancho de banda): requiere infraestructura de
  sondeo activo que hoy no existe en el módulo (mismo hallazgo que "Fase 2" del índice
  de confiabilidad, 2026-09-15 — necesita un probe con acceso a la LAN, no hecho
  todavía para nada del módulo).
- **Detección de vulnerabilidades de firmware**: Greenbone ya está integrado como
  fuente de hallazgos, pero hoy no escanea hAP lite/NVR — decidir si se amplía su
  alcance de red es una decisión de arquitectura aparte (afecta qué escanea un
  servicio externo sobre equipos de producción — candidato a ADR, no a esta spec).
- **Escribir en `cctv-automation-final`** o cambiar su esquema: se lee `
  dss_device_registry` de solo lectura, igual que `ksc-importer.js` nunca escribe en
  Monitoreo IT.
- **Enlaces punto-a-punto / celdas** como entidades navegables: sin datos de qué celda
  sirve a qué punto todavía (eso vendría con los datos de torre reales).

## 5. Criterios de aceptación

- [x] El usuario decide proceder sin confirmar exhaustivamente el listado DSS de 111
      dispositivos — reconciliación diferida (ver `tasks.md`), no bloqueante.
- [x] Un importador nuevo trae `dss_device_registry` a `cyber_asset_observations`
      como fuente `DSS`, solo lectura sobre `cctv-automation-final`, idempotente por
      hash (mismo patrón que `ksc-importer.js`/`importFortiGateInventory`) —
      `cybersecurity/src/dss-importer.js`.
- [x] `cyber_towers` se crea con las 14 torres reales de `torres_HapLite.pdf` (nombre,
      gateway/CIDR) + la celda "no es una torre" marcada como tal, no como torre 15 —
      verificado contra datos reales.
- [x] Un punto de la lista semilla (torre + hAP lite IP) y su(s) dispositivo(s) DSS
      con la misma IP aparecen agrupados en el read-model — verificado contra datos
      reales: 93 de 96 puntos con dispositivo DSS, 7 con FortiGate.
- [x] Nueva sección/vista en Inventario navega por torre real (no zona DSS) → puntos
      → hAP lite + info del grabador — pestaña "Torres" en `CybersecurityDashboard.jsx`.
- [x] Tests del módulo `cybersecurity/` en verde — **160/160**.
- [x] `cd CRM_Frontend && npm run build` en verde.
- [x] Verificado en Docker local (`http://127.0.0.1:3003/`) — API real a través de
      nginx (15 torres/96 puntos/93 DSS/7 FortiGate) y bundle confirmado con el texto
      nuevo; sin navegador real (misma limitación ya documentada: sin chromium-cli/
      Playwright en este entorno) — riesgo residual bajo, UI aditiva.

## 6. Restricciones de arquitectura y diseño

- Respetar `CRM_Frontend/docs/design-system.md` en cualquier UI nueva.
- `cyber-inventory.db` sigue de solo lectura en producción (`read_only`, `:ro`,
  `--immutable`) — cualquier dato nuevo persistente (ej. confirmaciones del listado
  DSS, o la entidad `cyber_towers` si necesita escritura) va al mismo patrón de
  `inventory-decision-store.js`/`network-policy-store.js` (store aparte en
  `/admin-data`), no a la base principal.
- No tocar sin ADR: stack, config build-time, `nginx.conf`, puertos,
  `docker-compose.yml` base.
- El acceso a `cctv-automation-final` es de solo lectura de su base SQLite (o de un
  endpoint suyo, si se prefiere desacoplar el acceso directo al archivo — a decidir en
  `plan.md`/§9): dos servicios independientes, sin nueva dependencia de red obligatoria
  si se opta por leer el archivo de datos directamente en el mismo host.

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| El listado DSS tiene errores reales de mapeo (el usuario ya advirtió "algunos casos puntuales") | Agrupación hAP lite↔NVR incorrecta para esos puntos | No agrupar automáticamente sin confirmación; permitir marcar una fila como excepción (mismo patrón de decisión manual que `inventory-decision-store.js`) |
| La lista semilla de torres es explícitamente parcial (solo puntos con CCTV ya conocido) | Puntos reales de una torre no aparecen todavía | Mostrar solo lo que la lista trae; no inferir ni completar puntos que el usuario no entregó |
| 3 de 96 IPs de hAP lite conocidas no tienen todavía un dispositivo DSS en esa IP (`192.168.14.69`, `192.168.32.46`, `192.168.24.202`, §0.1) | Esos 3 puntos se ven con hAP lite pero sin info de NVR/cámara | Mostrar el punto igual, con el grabador como "sin dato DSS todavía" — no bloquea el resto |
| `cctv-automation-final` y `cybersecurity` son bases/servicios independientes, sin sincronización hoy | El importador nuevo puede quedar desactualizado si `dss_device_registry` cambia y nadie vuelve a correr el import | Mismo patrón que KSC: import manual/programado, documentado, no automático desde el día 1 |
| FortiGate solo corrobora 7 de 96 IPs de hAP lite conocidas (§0.1) | Si el diseño dependiera de FortiGate para identificar un punto, casi ninguno se mostraría | La lista semilla + DSS son la fuente primaria; FortiGate es corroboración opcional, nunca requisito |

## 8. Impacto en producción

Ninguno hasta que se despliegue — cambio aditivo (nueva fuente de datos, nueva vista),
no modifica el comportamiento de nada existente. Plan de rollback: revertir el commit
del importador nuevo y de la vista; no hay migración destructiva de esquema (solo
tablas/columnas nuevas).

## 9. Preguntas abiertas para validar con el usuario antes de `plan.md` final

1. ~~¿Las 13 zonas de `dss_device_registry` corresponden 1:1 a las 14 torres
   reales?~~ **Cerrado con datos reales (2026-09-18, §0.1): NO en general — se
   confirma con la lista `torres_HapLite.pdf` que la zona DSS `CANDELARIA` mezcla 3
   torres reales (Candelaria, Juanchito, Villagorgona) y `OCCIDENTE` mezcla 5 (Bolo,
   Oriente Palmira, Palmaseca, Quisquina, Zamorano Palmira).** La respuesta inicial del
   usuario ("en general sí") era una aproximación correcta en espíritu pero no exacta
   en los detalles — se reemplaza: **la torre real de un punto se toma de la lista del
   usuario, nunca de `dss_device_registry.organization`** (ver §3.3). `EDIFICIO PPAL`
   sigue confirmado como no-torre (coincide con la celda "no es una torre" de la
   lista). `VPN` (zona DSS sin equivalente en la lista de torres) queda sin resolver,
   no bloqueante — probablemente tampoco es una torre, mismo patrón que `EDIFICIO
   PPAL`.
2. Confirmado por el usuario: la IP de cada fila DSS es la del hAP lite — ¿el POST
   original en la exportación DSS jamás trae la IP real del NVR (i.e., es
   estructuralmente imposible obtenerla de esta fuente), o solo no se exportó esta
   vez? **Sin respuesta formal todavía**, pero consistente con el mecanismo descrito en
   §0 (el NVR solo es alcanzable vía NAT del hAP lite): DSS probablemente nunca ve la
   IP interna real del NVR, porque se administra a través de esa misma NAT. Se trata
   como asunción de trabajo, no como hecho confirmado — el importador (§3.2) debe
   documentar esta IP como "la del hAP lite" sin asumir que algún día vendrá la IP real
   del NVR por este mismo canal.
3. ~~¿Leer el SQLite de `cctv-automation-final` directo, o un endpoint de solo
   lectura?~~ **Respondido por el usuario (2026-09-18): leer el SQLite directo**
   (mismo host, sin nueva dependencia de red) — ver `plan.md`, ya no es una decisión
   pendiente.
4. ~~La entidad `cyber_towers`: ¿arrancar vacía, o con zonas DSS provisionales?~~
   **Superado por §0.1: ya no aplica.** No hace falta arrancar con provisionales — el
   usuario entregó las 14 torres reales con nombre y gateway. `cyber_towers` se crea
   directamente con esos 14 registros reales (+ la celda "no es una torre" marcada
   como tal, no como torre 15), sin ninguna fila inventada o placeholder.
