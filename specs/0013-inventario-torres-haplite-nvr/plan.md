# PLAN 0013 — Inventario de torres: hAP lite + NVR por punto (fase 1)

Referencia: `spec.md` en esta misma carpeta. **Provisional** — 3 de las 4 preguntas de
§9 ya están cerradas (§9.1, §9.3, §9.4); solo queda §9.2 (asunción de trabajo, no
bloqueante). Revisado 2026-09-18 tras `torres_HapLite.pdf` (§0.1 de `spec.md`): la
torre real de un punto ya no se calcula de `dss_device_registry.organization`, se
carga como dato semilla real desde esa lista.

## Enfoque técnico

Dos fuentes de datos reales, combinadas por IP, ninguna calculada/inferida:

1. **Lista de torres del usuario** (`torres_HapLite.pdf`, §0.1 de `spec.md`) — se
   carga como **seed real** (no inventado): 14 torres (nombre + gateway/CIDR) + 1
   celda "no es una torre" (Edificio Ppal), cada una con las IPs de hAP lite que ya se
   conocen en ella. Es la fuente de verdad para "¿qué torre?" — nunca
   `dss_device_registry.organization` (confirmado no confiable, §0.1: 2 de 13 zonas
   DSS mezclan varias torres reales).
2. **`dss_device_registry`** (`cctv-automation-final`) — tratada como fuente
   corroborante más del módulo Ciberseguridad, mismo patrón ya probado para Kaspersky
   (`ksc-importer.js`): importador de solo lectura que inserta filas nuevas en
   `cyber_asset_observations` bajo `cyber_source_systems.source_type = 'DSS'`,
   idempotente por hash. No se toca el esquema ni los datos de `cctv-automation-final`
   — es la fuente de verdad de ese servicio, este módulo solo la lee.

La relación "punto de la torre X ↔ dispositivo(s) DSS" se calcula en el read-model por
`ip_value` igual (mismo principio que `getKasperskyInheritedSegments`/
`resolveTrueSegmentId`: relaciones calculadas al leer, no guardadas) — nunca al
importar, para poder corregir sin reimportar si el usuario marca una excepción.
**FortiGate NO es parte del mecanismo principal**: verificado que solo 7 de 96 IPs de
hAP lite conocidas aparecen en las observaciones de FortiGate (§0.1) — se usa, cuando
existe, como corroboración opcional de "en línea", nunca como requisito para mostrar
un punto.

**Confirmado por el usuario (§9.3): lectura directa del archivo SQLite** de
`cctv-automation-final` (mismo host, sin nueva dependencia de red) — mismo mecanismo
ya usado para consultarlo en esta sesión (`node:sqlite`, `DatabaseSync` en modo
`readOnly`).

## Archivos a tocar

| Archivo | Cambio | Riesgo |
|---------|--------|--------|
| `cybersecurity/db/seed/torres-haplite-20260918.json` (nuevo) | Datos semilla reales: 14 torres + 1 celda "no es una torre", cada una con nombre, gateway/CIDR, y sus puntos (nombre + IP de hAP lite) tal como los entregó el usuario en `torres_HapLite.pdf` | bajo — datos estáticos, sin lógica |
| `cybersecurity/src/dss-importer.js` (nuevo) | Lee `dss_device_registry` vía `node:sqlite` (`DatabaseSync`, `readOnly: true`) sobre el archivo de `cctv-automation-final`, inserta en `cyber_asset_observations` como fuente `DSS`, idempotente por hash | medio — primer importador que lee otro servicio directo por archivo, no por HTTP como Monitoreo IT |
| `cybersecurity/scripts/pull-dss-devices.js` (nuevo) | CLI, mismo patrón que `pull-ksc-from-monitoring.js` (modo auditoría por defecto, `--apply` explícito) | bajo |
| `cybersecurity/scripts/seed-towers.js` (nuevo) | Carga el JSON semilla a `cyber_towers`/`cyber_tower_points`, idempotente (upsert por nombre de torre / IP de hAP lite) | bajo |
| `cybersecurity/src/cybersecurity-read-model.js` | Nueva función `getTowerPoints(db)` — combina la semilla de torres con `dss_device_registry` (fuente `DSS`) y, cuando exista, la observación FortiGate de esa misma IP | medio — nueva lógica de agrupación, necesita tests con datos reales |
| `cybersecurity/src/cybersecurity-api.js` | Nueva ruta `GET /api/cybersecurity/towers` (o el nombre que se acuerde) | bajo |
| `CRM_Frontend/src/pages/CybersecurityDashboard.jsx` | Nueva sección en Inventario: navegación por torre real → puntos → hAP lite + grabador | medio — UI nueva, debe seguir `design-system.md` |
| `cybersecurity/db/schema.sql` | Tablas `cyber_towers` (id, nombre, gateway_cidr, is_tower boolean — para la celda "no es una torre") y `cyber_tower_points` (torre_id, nombre del punto, hAP lite IP) | bajo (tablas nuevas, sin migración destructiva) |
| `docs/modulos/ciberseguridad/README.md` o nota aparte | Documentar la fuente `DSS`, la semilla de torres, y por qué `dss_device_registry.organization` no se usa para esto | — |

## Contratos de datos / API

- **`cyber_towers`**: `id`, `name` (`Cafetero Palmira`, `Sharon Palmira`, ...
  14 reales), `gateway_cidr` (ej. `192.168.44.1/23`), `is_tower` (boolean — `false`
  solo para la fila "no es una torre" / celda del Edificio Ppal). Ningún placeholder:
  las 15 filas son datos reales entregados por el usuario.
- **`cyber_tower_points`**: `tower_id`, `point_name` (del PDF), `haplite_ip`. Tabla de
  hechos, no de relaciones inferidas — un punto que el usuario no listó no existe aquí
  todavía (la lista es explícitamente parcial, §0.1).
- **`cyber_source_systems`**: nueva fila `source_type = 'DSS'`, `authority_level`
  probablemente `CORROBORATING` (mismo nivel que Kaspersky — confirma identidad/modelo
  del grabador, no observa red por sí sola).
- **`cyber_asset_observations`** (fuente DSS): `ip_value` = IP del hAP lite (aclarado
  en `sanitized_attributes_json` que es NAT, no la IP propia del NVR — ver §0 de
  `spec.md`), `hostname_raw` = `device_name` de DSS, `device_class_raw` = `device_type`
  (`NVR`/`IPC`/`DVR/XVR`/`Alarm Controller`/`Access ANPR Camera`), `manufacturer` fijo
  `'Dahua'`. Sin `mac_value` (DSS no lo expone en los campos ya revisados).
- **Endpoint nuevo**: `GET /api/cybersecurity/towers` (borrador) — devuelve
  `{ towers: [{ id, name, isTower, gatewayCidr, points: [{ name, haplite: { ip, fortigateObservationId|null }, dssDevices: [...] }] }] }`.
  Forma exacta a definir junto con la UI.
- Compatibilidad hacia atrás: ningún contrato existente cambia: es aditivo.

## Diseño / UI

Nueva sección dentro de la pestaña Inventario (no una pestaña nueva de nivel superior,
para no fragmentar más la navegación — a confirmar con el usuario si prefiere lo
contrario). Navegación de dos niveles: lista de torres reales (14, + la celda aparte,
etiquetada distinto) → al entrar, sus puntos conocidos con hAP lite + grabador(es).
Sigue el patrón ya establecido en `InventoryView`/`SubnetsView`: tarjetas de resumen
arriba (torres, puntos conocidos, puntos sin dato DSS todavía — 3 casos conocidos,
§0.1), badges por tipo de dispositivo (mismo patrón de color que ya se usó en el
listado de revisión DSS entregado al usuario el 2026-09-18, `SourceTag`/
`ReliabilityMeter` existentes para consistencia visual).

## Plan de rollout

1. Confirmar con el usuario la pregunta que queda de `spec.md` §9 (§9.2, no
   bloqueante) y revisar el listado DSS pendiente de confirmación (bloqueante real,
   ver `tasks.md`).
2. Cargar la semilla de torres (`seed-towers.js`) contra la base local — datos
   estáticos, no requiere modo auditoría.
3. Local dockerizado: importador `DSS` corrido en modo auditoría primero (sin
   `--apply`), contra datos reales, mismo rigor que las rondas anteriores de esta
   sesión.
4. `--apply` contra la base local (con respaldo previo, mismo patrón ya usado).
5. Verificar agrupación real: de los puntos de la semilla, cuántos encuentran su
   dispositivo DSS por IP (base ya confirmada: 93 de 96, §0.1), cuántos además
   corroboran con FortiGate (base ya confirmada: 7 de 96, esperado bajo).
6. UI en Docker local — esta vez con verificación visual real en navegador (pendiente
   arrastrado de la ronda anterior).
7. PR + CI (si aplica) + merge + deploy a `.65` (el usuario corre push/deploy, como el
   resto del módulo).

## Plan de rollback

Revertir el commit del importador, la semilla y la vista nueva. Sin migración
destructiva: las tablas son nuevas, no se modifica el esquema existente. Reversible
desde un respaldo (mismo hábito de respaldo previo ya establecido en esta sesión).

## Verificación

- `cybersecurity/`: `npm test` suite completa en verde, incluidos los tests nuevos de
  `dss-importer.js`, `seed-towers.js` y `getTowerPoints`.
- Import real en modo auditoría contra `cctv-automation-final` — confirmar conteo
  (111 dispositivos esperados, o el número vigente al momento de implementar).
- Verificar a mano que los 14 registros de `cyber_towers` corresponden exactamente a
  los nombres reales del PDF, y que la celda queda marcada `is_tower = false`.
- Verificar a mano cuántos puntos de la semilla encuentran su dispositivo DSS (base:
  93/96) y cuántos corroboran con FortiGate (base: 7/96) — sin sorpresas grandes
  respecto a lo ya medido en `spec.md` §0.1.
- `cd CRM_Frontend && npm run lint` + `npm run build`.
- Docker local, `http://127.0.0.1:3003/`, verificación visual real en navegador (no
  solo API+bundle).
