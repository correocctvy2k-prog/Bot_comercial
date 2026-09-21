# TASKS 0013 — Inventario de torres: hAP lite + NVR por punto (fase 1)

Referencia: `spec.md` y `plan.md` en esta misma carpeta.
Marcar `[x]` al completar. Mantener actualizado durante toda la tarea.

## Bloqueante — validar con el usuario

- [x] Listado DSS de 111 dispositivos — el usuario decidió **proceder sin confirmación
      exhaustiva** ("eventualmente vamos a descubrir los puntos de diferencia, que de
      hecho pueden estar en los últimos reportes de soporte Trello, pero no nos impide
      continuar", 2026-09-18). No es una confirmación de exactitud — es una decisión
      explícita de avanzar y reconciliar diferencias después, no bloqueante.
- [x] §9.1 zonas↔torres — **cerrado con datos reales**: `dss_device_registry.organization`
      NO es confiable (2 de 13 zonas mezclan varias torres); la torre real se toma de
      `torres_HapLite.pdf` (14 torres + 1 celda "no es una torre"), entregado y
      cruzado contra DSS/FortiGate el 2026-09-18 (§0.1 de `spec.md`).
- [ ] §9.2 IP del NVR estructuralmente inobtenible o no exportada esta vez — sin
      respuesta formal, se trabaja con la asunción de §0/§9.2.
- [x] §9.3 acceso a datos DSS — respondido: SQLite directo.
- [x] §9.4 `cyber_towers` vacía vs. provisional — **superado**: se crea directo con
      las 14 torres reales del PDF, sin placeholders.

## Implementación

- [x] Datos semilla reales — `cybersecurity/raw/torres/torres-haplite-real-20260918.json`
      (104 filas, gitignored a propósito, ver `spec.md` §0.1) en vez del path original
      `db/seed/...json` — el archivo real nunca viaja por git, mismo patrón que el
      resto de capturas reales del módulo.
- [x] `cybersecurity/src/tower-seed.js` + `cybersecurity/scripts/seed-towers.js` —
      carga la semilla a `cyber_towers`/`cyber_tower_points`, idempotente.
- [x] `cybersecurity/src/dss-importer.js` — importador de solo lectura, idempotente
      por hash, fuente `DSS`.
- [x] `cybersecurity/scripts/pull-dss-devices.js` — CLI en modo auditoría por defecto.
- [x] `cybersecurity/src/cybersecurity-read-model.js` — `getTowerPoints(db)`.
- [x] `cybersecurity/src/cybersecurity-api.js` — ruta nueva `GET /api/cybersecurity/towers`.
- [x] `CRM_Frontend/src/pages/CybersecurityDashboard.jsx` — pestaña "Torres" en
      Inventario (torre real → puntos → hAP lite + grabador), `cybersecurity.service.js`
      (`getTowers`).
- [x] `cybersecurity/db/schema.sql` — tablas `cyber_towers` y `cyber_tower_points`,
      `'DSS'` agregado al `CHECK` de `cyber_source_systems.source_type`.
- [x] `cybersecurity/db/open-database.js` — migración real necesaria (no prevista en
      el plan original): automigra cualquier base ya existente (local o `.65`) que no
      tenga `'DSS'` en el `CHECK` viejo. Ver `docs/lecciones-aprendidas/LL-0007-...md`.

## Verificación

- [x] `cybersecurity/`: `npm test` — **160/160 en verde**.
- [x] Los 14 registros reales de `cyber_towers` corresponden a los nombres del PDF;
      la celda "No es una torre" queda marcada `is_tower = 0`.
- [x] Import real en modo auditoría contra datos reales (no solo fixture) — 111
      dispositivos DSS confirmados.
- [x] Import real con `--apply` contra base local, con respaldo previo
      (`data/cyber-inventory.pre-torres-verify-20260918.db`).
- [x] Conteo verificado contra datos reales: **15 torres, 96 puntos, 93 con
      dispositivo DSS (93/96), 7 con corroboración FortiGate (7/96)** — coincide
      exactamente con lo ya medido en `spec.md` §0.1.
- [x] `cd CRM_Frontend && npm run lint` — sin errores nuevos (los 2 preexistentes en
      líneas 629/888 no están relacionados, deuda de lint ya conocida de spec 0003).
- [x] `cd CRM_Frontend && npm run build` — verde.
- [x] `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build cybersecurity-api crm-frontend` + `restart crm-frontend`.
- [x] Verificación real contra el stack en Docker local: `GET http://127.0.0.1:3003/api/
      cybersecurity/towers` devuelve los mismos 15/96/93/7 reales; el bundle de
      `crm-frontend` contiene el texto "Torres reales"; logs limpios en ambos
      contenedores; otros endpoints existentes (`/overview`, `/network-segments`,
      `/inventory/overview`) siguen respondiendo 200 sin regresión.

## Documentación (Definition of Done)

- [x] `CHANGELOG.md` — sección "No publicado"
- [x] Ficha de módulo — `docs/modulos/ciberseguridad/NOTA-TORRES-Y-PUNTOS.md`
      (enlazada desde `README.md`)
- [ ] ADR en `docs/adr/` — no se decidió nada de arquitectura no trivial (el acceso a
      DSS por SQLite directo ya estaba confirmado en §9.3 antes de implementar)
- [x] Lección aprendida — `docs/lecciones-aprendidas/LL-0007-alter-table-rename-reescribe-fk.md`

## Incremento — vista gráfica + todos los puntos (con o sin CCTV)

Pedido del usuario 2026-09-18, misma jornada: mismo lenguaje visual que los tableros
por zona de CCTV (spec 0011), e incluir todos los puntos de Operación de Puntos, no
solo los que ya tienen hAP lite.

- [x] Confirmado: `puntos_venta.segment` = las 7 zonas reales (`PALMIRA`, `OCCIDENTE`,
      `CANDELARIA`, `FLORIDA`, `PRADERA`, `ROZO`, `AMAIME Y EL PLACER`), `has_cctv` ya
      sincronizado — verificado con 375 puntos reales, 40 con CCTV.
- [x] Decisión del usuario: puntos sin hAP lite conocido → tarjeta aparte "Sin torre
      asignada" por zona, sin inventar torre específica.
- [x] `TowersCardsView` (nuevo) + `PointCubeGrid` + `PendingSection` (Enlaces/Celdas/
      Router principal, "sin datos todavía") + selector Tarjetas/Lista —
      `CRM_Frontend/src/pages/CybersecurityDashboard.jsx`.
- [x] `pointsService.getPoints()` reusado (ya existente, sin servicio nuevo).
- [x] `cd CRM_Frontend && npm run lint` — sin errores nuevos.
- [x] `cd CRM_Frontend && npm run build` — verde.
- [x] Verificado contra datos reales: lógica de agrupación replicada fuera de React
      contra la API real y Supabase real — 7 zonas, sin ninguna torre faltante.
- [x] Docker local: `crm-frontend` reconstruido + `restart`, bundle confirmado con el
      texto nuevo, `/api/cybersecurity/towers` sigue respondiendo 200.
- [x] `CHANGELOG.md` + ficha de módulo actualizados.

## Incremento — ubicación por IP/gateway, leyenda y tarjeta flotante

Pedido del usuario 2026-09-18, misma jornada: deducir la torre de un punto por su IP,
tarjeta flotante al hacer click en un cubo, y una leyenda de colores.

- [x] Confirmado (subagente Explore + query real): `puntos_venta.ip` existe y está
      poblado al 100% (368/368 puntos activos), poblado por `monitor_puntos_wpp.py`
      (monitor de ping externo, no parte de este módulo).
- [x] `cyber_tower_gateways` (nuevo, `schema.sql`) — una torre puede tener más de un
      gateway real (Pradera, Candelaria); `tower-seed.js` los carga todos, no solo el
      representativo. `getTowerPoints` expone `gatewayCidrs: string[]` por torre.
- [x] `TowersCardsView`: un punto sin hAP lite conocido, si su IP cae en un gateway
      real de una torre de su zona, se ubica ahí (tono `sky`, distinto de los puntos
      con grabador DSS confirmado) — verificado contra datos reales: **326 de 368
      puntos activos (89%)** se ubican así, sin inventar nada.
- [x] `CubeLegend` (nuevo) — un solo significado por color en toda la vista
      (verde/ámbar/azul/gris), sin excepciones por sección.
- [x] `PointFloatingCard` (nuevo) — detalle del punto al hacer click en un cubo, cierre
      por X/clic afuera/Esc.
- [x] `cybersecurity/`: `npm test` — **162/162 en verde** (5 tests nuevos: gateways
      múltiples por torre, no duplicados al recargar, `gatewayCidrs` expuesto).
- [x] `cd CRM_Frontend && npm run lint`/`build` — sin errores nuevos, verde.
- [x] Verificado contra datos reales en vivo: la lógica de coincidencia por gateway se
      replicó fuera de React contra la API real y Supabase real — 326/368 puntos
      ubicados, desglose por zona confirmado (Pradera 100%, Rozo solo 4% — hallazgo
      real, no ajustado).
- [x] Docker local: `cybersecurity-api` + `crm-frontend` reconstruidos + `restart`,
      `gatewayCidrs` confirmado en `/api/cybersecurity/towers`, bundle con el texto
      nuevo.
- [x] `CHANGELOG.md` + ficha de módulo actualizados.

## Incremento — corrección de máscaras reales, categoría VPN, hover en vez de click

Pedido del usuario 2026-09-19, tras revisar la vista gráfica en vivo con datos reales.

- [x] Corregida la máscara real de Rozo, Palmaseca y Zamorano Palmira (`/23`, no `/24`
      como se había transcrito del PDF) en la semilla real (gitignored) y en la base
      local (gateways `/24` obsoletos borrados, `seed-towers.js` recargado).
- [x] `isVpnConnected` (prefijo `10.100.1.`) — nueva categoría "Conectados por VPN"
      (tono violeta, agregado a `CUBE_TONE`/`CubeLegend`), separada de "Sin torre
      asignada" porque estructuralmente nunca va a tener torre.
- [x] `PointCubeGrid`/`PointFloatingCard`: cambiado de `onClick` a
      `onMouseEnter`/`onMouseLeave` (+ `onFocus`/`onBlur`) — la tarjeta aparece solo con
      pasar el cursor, ya no hace falta overlay de "clic afuera" ni listener de Esc.
- [x] `cybersecurity/`: `npm test` — 162/162 en verde (sin cambios de backend en este
      incremento, solo re-verificado).
- [x] `cd CRM_Frontend && npm run lint`/`build` — sin errores nuevos, verde.
- [x] Verificado contra datos reales en vivo (lógica de agrupación replicada fuera de
      React contra la API real y Supabase real, tras el fix): Rozo pasó de 1/25 (4%) a
      24/25 (96%) puntos ubicados por IP; de 368 puntos activos, 355 ubicados por IP, 5
      en la categoría VPN, 8 genuinamente sin torre asignada (antes: 326/42 sin
      distinguir VPN).
- [x] Docker local: `crm-frontend` reconstruido + `restart`, bundle confirmado con el
      texto "Conectados por VPN", `/api/cybersecurity/towers` confirma gateways `/23`.
- [x] `CHANGELOG.md` + ficha de módulo actualizados.

## Incremento — match por IP ya no se restringe a la zona propia

Investigación de los 8 puntos que seguían "sin torre asignada" tras el incremento
anterior; el usuario respondió 2 preguntas (`AskUserQuestion`) sobre la máscara de Bolo
y sobre permitir match cruzando zonas.

- [x] Investigados uno por uno los 8 puntos: 2 (Bolo, `/28`) confirmados por el usuario
      como brecha real; 6 sí tenían match real contra una torre de OTRA zona operativa.
- [x] `TowersCardsView`: el cálculo de match por IP/gateway ya no se limita a las
      torres de la zona propia del punto — se calcula una sola vez contra todas las
      torres conocidas (decisión del usuario: "la red real manda sobre la etiqueta de
      zona").
- [x] `cd CRM_Frontend && npm run lint`/`build` — sin errores nuevos, verde.
- [x] `cybersecurity/`: `npm test` — 162/162 en verde (sin cambios de backend).
- [x] Verificado contra datos reales en vivo: 361 de 368 puntos activos (98%) ubicados
      por IP (antes 355/368) — solo quedan los 2 puntos de Bolo.
- [x] Docker local: `crm-frontend` reconstruido + `restart`, bundle nuevo confirmado
      servido por nginx (hash de archivo distinto, timestamp del rebuild).
- [x] `CHANGELOG.md` + ficha de módulo actualizados.

## Incremento — revisión de código (`/code-review`), 3 correcciones

Pedido del usuario: seguir madurando en local sin subir todavía. Sin datos nuevos que
esperar, se corrió `/code-review medium` sobre el diff acumulado de la spec.

- [x] "Puntos totales" ya no muestra "cargando…" para siempre en error/vacío —
      distingue `pointsQuery.isError`/`isLoading`/éxito.
- [x] `findTowerByIp` (nuevo, `CybersecurityDashboard.jsx`): el match cruzando zonas
      usa la red más específica (prefijo más largo) en vez de la primera coincidencia,
      mismo criterio que `resolveTrueSegmentId` del backend. Sin cambio de resultado
      hoy (no hay gateways reales solapados todavía) — corrige un riesgo latente.
- [x] `dss-importer.js`: `ORDER BY dss_identifier` en `readDssDeviceRegistry` — sin
      esto, el hash de idempotencia (`sourceHash`) podía variar entre re-imports de los
      mismos datos y duplicar el import.
- [x] `cybersecurity/`: `npm test` — 162/162. Re-corrido `pull-dss-devices.js --apply`
      contra la base local: confirma `ALREADY_IMPORTED` (idempotencia intacta).
- [x] `cd CRM_Frontend && npm run lint`/`build` — sin errores nuevos, verde.
- [x] Verificado contra datos reales en vivo: 361/368 (98%) sin cambio, mismos 2 puntos
      de Bolo sin torre — confirma que el fix de longest-prefix no altera nada hoy.
- [x] Docker local: `cybersecurity-api` + `crm-frontend` reconstruidos + `restart`,
      bundle nuevo confirmado, `/api/cybersecurity/towers` sigue en 15/96/93.
- [x] `CHANGELOG.md` actualizado.

## Incremento — estado vivo del hAP lite y puerto NAT del NVR

Pedido del usuario 2026-09-21: mostrar estado del hAP lite, Eth4/NVR (propone TCP a
4455-4456), latencia, y sentar base para firmware. Investigado primero con un
subagente Explore: `cybersecurity-api` no tiene ruta de red probada a las torres;
`monitor_puntos_wpp.py` sí (ping+latencia ya activos). Usuario eligió extender ese
script en vez de construir infraestructura nueva.

- [x] `monitor_puntos_wpp.py`: `check_nvr_port(ip)` (TCP 4455→4456, 1.5s c/u, solo si
      el ping ya fue exitoso), corre dentro del `ThreadPoolExecutor` ya existente.
- [x] `cybersecurity/sql/0013-add-nvr-port-columns.sql` (nuevo) — migración manual de
      Supabase, mismo patrón que `Asamblea/sql/`. **Pendiente que el usuario la corra.**
- [x] `CybersecurityDashboard.jsx`: `LiveStatusRow` en `PointFloatingCard` (hAP
      lite + NVR/NAT), con "hace cuánto se revisó" siempre visible (el script corre
      bajo demanda, no en intervalo fijo). `crmPointByIp` para cruzar también los
      puntos con hAP lite ya conocido, no solo los ubicados por IP.
- [x] Probado `check_nvr_port` contra un puerto TCP real abierto/cerrado en localhost.
- [x] `cd CRM_Frontend && npm run lint`/`build` — sin errores nuevos, verde.
- [x] Docker local: `crm-frontend` reconstruido + `restart`, bundle confirmado con el
      texto nuevo.
- [x] `CHANGELOG.md` actualizado.
- [ ] **Bloqueante para ver dato real**: el usuario debe correr
      `cybersecurity/sql/0013-add-nvr-port-columns.sql` en el editor SQL de Supabase.

## Incremento — firmware inicial (sin verificar), base para vulnerabilidades

Pedido del usuario 2026-09-21 (mismo pedido que el incremento anterior): sentar la
base para detectar vulnerabilidades de firmware. Sin escaneo activo real disponible
todavía (decisión de arquitectura aparte), el usuario eligió importar datos de
firmware ya existentes en otra base como semilla inicial, marcados explícitamente
como no verificados.

- [x] `cctv-firmware-staging-importer.js` (nuevo) — lee `stg_inventory_locations` de
      `cctv-automation-final` (solo lectura), solo la corrida de import más reciente
      (la tabla acumula corridas viejas sin limpiarlas). Nueva fuente `CCTV_STAGING`
      (`authority_level = 'OBSERVATIONAL'`).
- [x] `pull-cctv-firmware-staging.js` (nuevo) — CLI en modo auditoría por defecto,
      mismo patrón que `pull-dss-devices.js`.
- [x] `schema.sql`/`open-database.js`: `'CCTV_STAGING'` agregado al `CHECK` de
      `source_type` — migración de LL-0007 generalizada (revisa cualquier valor
      requerido, no solo `'DSS'`), con test de regresión para el caso real de upgrade
      parcial (`.65` ya tiene `'DSS'`, no tendrá `'CCTV_STAGING'` todavía).
- [x] `getTowerPoints` expone `point.firmware` (cruce por IP), solo para los puntos
      con hAP lite ya conocido.
- [x] `CybersecurityDashboard.jsx`: sección de firmware en la tarjeta flotante,
      siempre rotulada "sin verificar" + hace cuánto (import Excel, no un escaneo).
- [x] `cybersecurity/`: `npm test` — 168/168 (7 tests nuevos).
- [x] Import real corrido con `--apply` (respaldo previo): **79 de 96 puntos conocidos
      (82%) con firmware**, confirmado vía `/api/cybersecurity/towers`. Idempotencia
      confirmada (`ALREADY_IMPORTED` en la segunda corrida).
- [x] `cd CRM_Frontend && npm run lint`/`build` — sin errores nuevos, verde.
- [x] Docker local: `cybersecurity-api` + `crm-frontend` reconstruidos + `restart`,
      bundle confirmado con el texto nuevo.
- [x] `CHANGELOG.md` actualizado.
- [ ] Fuera de alcance: escaneo activo real de firmware (decisión de arquitectura
      aparte).

## Cierre

- [ ] PR abierto y enlazado en `spec.md`
- [ ] Merge a `main`
- [ ] Desplegado y verificado en `http://192.168.8.65:3003/` — **importante:** al
      desplegar, correr `seed-towers.js` + `pull-dss-devices.js --apply` contra el
      archivo real de `.65` (con respaldo previo) antes o junto con el rebuild del
      contenedor `cybersecurity-api` (que corre de solo lectura, `--immutable`) —
      mismo patrón ya usado para KSC/FortiGate en ese servidor.
