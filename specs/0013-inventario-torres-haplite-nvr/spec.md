# SPEC 0013 — Inventario de torres: hAP lite + NVR por punto (fase 1)

- **Estado:** Borrador — pendiente de validar con el usuario (ver §9)
- **Autor:** Claude (a partir de la descripción de infraestructura del usuario, 2026-09-18)
- **Fecha:** 2026-09-18
- **Módulos afectados:** `cybersecurity/` (backend + `CRM_Frontend/src/pages/CybersecurityDashboard.jsx`, vista Inventario). Lee, sin modificar, `cctv-automation-final` (`dss_device_registry`).
- **Rama:** `feat/0013-inventario-torres-haplite-nvr`
- **PR:** —

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
por dispositivo**, y las zonas (`RED 14`, `RED 20`, `RED 34`, `RED 36`, `RED 44`,
`AMAIME`, `CANDELARIA`, `FLORIDA`, `OCCIDENTE`, `PRADERA`, `ROZO`, `EDIFICIO PPAL`,
`VPN`) ya se parecen a la agrupación por torre/sector que el usuario describe (a
confirmar — ver §9, primera pregunta abierta).

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
3. **Agrupación por punto (IP compartida).** Un candidato FortiGate ya clasificado
   `NETWORK`/`mikrotik` y una fila `DSS` con la **misma IP** son, por definición del
   negocio, el mismo punto: el hAP lite y su grabador. Se agrupan en el read-model
   (mismo patrón que `detectDeviceGroups` en `inventory-reliability.js`, pero por IP
   igual en vez de "misma placa"), sin fusionar identidades ni inventar datos que no
   estén en ninguna de las dos fuentes.
4. **Vista nueva o sección en Inventario**: "Puntos con hAP lite + CCTV" — lista de
   estos grupos, con zona (de `dss_device_registry.organization`), nombre del punto,
   IP, tipo de grabador/modelo, y estado de conectividad si ya existe en FortiGate
   (`lifecycleStatus`, igual que el resto del inventario).
5. **Modelo de datos mínimo para "Torre"**, sin llenarlo todavía: una tabla/entidad
   nueva `cyber_towers` (o el nombre que el usuario prefiera) con id, nombre, zona —
   **vacía o con las 13 zonas de DSS como fila provisional** (a decidir en §9) — lista
   para recibir los datos reales de IP de torre cuando lleguen, sin requerir otra
   migración de esquema en ese momento.

## 4. No-objetivos (fase 1 — explícitamente fuera)

- **Modelo completo de Torre** con enlaces/celdas/puntos reales, IPs de router
  principal, UPS-con-tarjeta-de-red: bloqueado por falta de datos reales (el usuario
  los entregará más adelante). Esta spec solo prepara el terreno (§3.5).
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

- [ ] El usuario confirma (o corrige) el listado DSS de 111 dispositivos — condición
      previa a los siguientes puntos.
- [ ] Un importador nuevo trae `dss_device_registry` a `cyber_asset_observations`
      como fuente `DSS`, solo lectura sobre `cctv-automation-final`, idempotente por
      hash (mismo patrón que `ksc-importer.js`/`importFortiGateInventory`).
- [ ] Un hAP lite (FortiGate) y su NVR (DSS) con la misma IP aparecen agrupados como
      un solo punto en el read-model — verificado contra datos reales, no solo tests
      sintéticos.
- [ ] Nueva sección/vista en Inventario lista esos puntos agrupados, con zona, nombre,
      IP e info del grabador.
- [ ] Tests del módulo `cybersecurity/` en verde (suite completa, no solo los nuevos).
- [ ] `cd CRM_Frontend && npm run build` en verde.
- [ ] Verificado en Docker local (`http://127.0.0.1:3003/`) — API + navegador esta
      vez, no solo API+bundle (pendiente arrastrado de la ronda anterior, spec del
      módulo Kaspersky).

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
| Compartir IP no es universal (el usuario dijo "para la mayoría", implica excepciones) | Algunos puntos no se agrupan aunque deberían, o se agrupan mal | Mostrar como "sin agrupar" en vez de adivinar; nunca inventar una IP o relación que ninguna fuente reporte |
| `cctv-automation-final` y `cybersecurity` son bases/servicios independientes, sin sincronización hoy | El importador nuevo puede quedar desactualizado si `dss_device_registry` cambia y nadie vuelve a correr el import | Mismo patrón que KSC: import manual/programado, documentado, no automático desde el día 1 |
| Entidad `cyber_towers` vacía o con datos provisionales puede quedar "a medio construir" mucho tiempo si los datos reales tardan | Confusión sobre qué es real vs. placeholder | Marcar explícitamente en la UI cualquier fila de torre que no tenga datos reales todavía (ningún dato inventado se muestra como confirmado) |

## 8. Impacto en producción

Ninguno hasta que se despliegue — cambio aditivo (nueva fuente de datos, nueva vista),
no modifica el comportamiento de nada existente. Plan de rollback: revertir el commit
del importador nuevo y de la vista; no hay migración destructiva de esquema (solo
tablas/columnas nuevas).

## 9. Preguntas abiertas para validar con el usuario antes de `plan.md` final

1. ¿Las 13 zonas de `dss_device_registry` (`RED 14/20/34/36/44`, `AMAIME`,
   `CANDELARIA`, `FLORIDA`, `OCCIDENTE`, `PRADERA`, `ROZO`, `EDIFICIO PPAL`, `VPN`)
   corresponden 1:1 a las 14 torres reales, o son una agrupación distinta (más fina,
   más gruesa, o simplemente el nombre del sector de red sin relación 1:1 con una
   torre física)?
2. Confirmado por el usuario: la IP de cada fila DSS es la del hAP lite — ¿el POST
   original en la exportación DSS jamás trae la IP real del NVR (i.e., es
   estructuralmente imposible obtenerla de esta fuente), o solo no se exportó esta
   vez?
3. Para leer `dss_device_registry`: ¿leer el archivo SQLite de `cctv-automation-final`
   directo (mismo host, ya se hace así en scripts de un solo uso de esta sesión), o
   preferís que `cctv-automation-final` exponga un endpoint de solo lectura (mismo
   patrón que Monitoreo IT → `pull-ksc-from-monitoring.js`) para desacoplar el acceso
   directo a su archivo?
4. La entidad `cyber_towers` del punto 3.5: ¿arrancar vacía (nadie la ve hasta que
   lleguen datos reales) o con las 13 zonas DSS como fila provisional marcada
   "pendiente de confirmar como torre real"?
