# PLAN 0013 — Inventario de torres: hAP lite + NVR por punto (fase 1)

Referencia: `spec.md` en esta misma carpeta. **Provisional** — algunas decisiones de
este plan dependen de las preguntas abiertas en `spec.md` §9 (marcadas abajo con ⚠️).

## Enfoque técnico

Tratar `dss_device_registry` (`cctv-automation-final`) como una fuente corroborante
más del módulo Ciberseguridad, con el mismo patrón ya probado para Kaspersky
(`ksc-importer.js`): un importador de solo lectura que inserta filas nuevas en
`cyber_asset_observations` bajo `cyber_source_systems.source_type = 'DSS'`, idempotente
por hash del contenido leído. No se toca el esquema ni los datos de
`cctv-automation-final` — es la fuente de verdad de ese servicio, este módulo solo la
lee.

La agrupación "hAP lite + su NVR" no es una tabla nueva de relaciones: se calcula en el
read-model, igual que `getKasperskyInheritedSegments`/`resolveTrueSegmentId` ya
calculan relaciones al leer en vez de guardarlas — un candidato `FORTIGATE` clasificado
`NETWORK` y un candidato `DSS` con la misma `ip_value` se muestran como un solo grupo.
Alternativa descartada: fusionar ambas filas en una sola observación al importar — se
prefiere mantenerlas separadas (mismo principio de "observaciones append-only, nunca se
reescriben" que ya rige el resto del módulo) y calcular la relación al leer, para poder
corregirla sin reimportar si el usuario marca una excepción.

⚠️ **Pendiente de §9.3**: este plan asume lectura directa del archivo SQLite de
`cctv-automation-final` (mismo host, sin nueva dependencia de red) — si el usuario
prefiere un endpoint HTTP de solo lectura, cambia el import de un `require('node:sqlite')`
directo a un `fetch()` (mismo patrón que `pull-ksc-from-monitoring.js`), sin afectar el
resto del diseño.

## Archivos a tocar

| Archivo | Cambio | Riesgo |
|---------|--------|--------|
| `cybersecurity/src/dss-importer.js` (nuevo) | Lee `dss_device_registry` (SQLite directo o HTTP, ⚠️ §9.3), inserta en `cyber_asset_observations` como fuente `DSS`, idempotente por hash | medio — primer importador que lee otro servicio directo por archivo, no por HTTP como Monitoreo IT |
| `cybersecurity/scripts/pull-dss-devices.js` (nuevo) | CLI, mismo patrón que `pull-ksc-from-monitoring.js` (modo auditoría por defecto, `--apply` explícito) | bajo |
| `cybersecurity/src/cybersecurity-read-model.js` | Nueva función `getHapliteDeviceGroups(db)` — agrupa por `ip_value` compartida entre `FORTIGATE`/`NETWORK` y `DSS` | medio — nueva lógica de agrupación, necesita tests con datos reales |
| `cybersecurity/src/cybersecurity-api.js` | Nueva ruta `GET /api/cybersecurity/points` (o el nombre que se acuerde) | bajo |
| `CRM_Frontend/src/pages/CybersecurityDashboard.jsx` | Nueva sección/pestaña "Puntos hAP lite + CCTV" en Inventario | medio — UI nueva, debe seguir `design-system.md` |
| `cybersecurity/db/schema.sql` | Tabla `cyber_towers` (vacía o con zonas DSS provisionales, ⚠️ §9.4) — solo si el usuario confirma que se crea ya | bajo (tabla nueva, sin migración destructiva) |
| `docs/modulos/ciberseguridad/README.md` o nota aparte | Documentar la fuente `DSS` y el modelo de agrupación | — |

## Contratos de datos / API

- **`cyber_source_systems`**: nueva fila `source_type = 'DSS'`, `authority_level`
  probablemente `CORROBORATING` (mismo nivel que Kaspersky — confirma identidad/modelo
  del grabador, no observa red por sí sola).
- **`cyber_asset_observations`** (fuente DSS): `ip_value` = IP del hAP lite (aclarado
  en `sanitized_attributes_json` que es NAT, no la IP propia del NVR — ver §0 de
  `spec.md`), `hostname_raw` = `device_name` de DSS, `device_class_raw` = `device_type`
  (`NVR`/`IPC`/`DVR/XVR`/`Alarm Controller`/`Access ANPR Camera`), `manufacturer` fijo
  `'Dahua'`. Sin `mac_value` (DSS no lo expone en los campos ya revisados).
- **Endpoint nuevo**: `GET /api/cybersecurity/points` (borrador) — devuelve grupos
  `{ ip, zone, hapliteObservationId, dssDevices: [...] }`. Forma exacta a definir junto
  con la UI.
- Compatibilidad hacia atrás: ningún contrato existente cambia: es aditivo.

## Diseño / UI

Nueva sección dentro de la pestaña Inventario (no una pestaña nueva de nivel superior,
para no fragmentar más la navegación — a confirmar con el usuario si prefiere lo
contrario). Sigue el patrón ya establecido en `InventoryView`/`SubnetsView`: lista
maestro-detalle, tarjetas de resumen arriba (total de puntos agrupados, puntos sin
agrupar por falta de coincidencia de IP), badges por tipo de dispositivo (mismo patrón
de color que ya se usó en el listado de revisión DSS entregado al usuario el
2026-09-18, `SourceTag`/`ReliabilityMeter` existentes para consistencia visual).

## Plan de rollout

1. Confirmar con el usuario las preguntas de `spec.md` §9 (bloqueante).
2. Local dockerizado: importador `DSS` corrido en modo auditoría primero (sin
   `--apply`), contra datos reales, mismo rigor que las rondas anteriores de esta
   sesión.
3. `--apply` contra la base local (con respaldo previo, mismo patrón ya usado).
4. Verificar agrupación real: cuántos hAP lite de FortiGate encuentran su par DSS por
   IP, cuántos quedan sin par (y por qué — sin IP en uno de los dos lados, o IP no
   coincide).
5. UI en Docker local — esta vez con verificación visual real en navegador (pendiente
   arrastrado de la ronda anterior).
6. PR + CI (si aplica) + merge + deploy a `.65` (el usuario corre push/deploy, como el
   resto del módulo).

## Plan de rollback

Revertir el commit del importador y la vista nueva. Sin migración destructiva: las
tablas/columnas son nuevas, no se modifica el esquema existente. Si `cyber_towers` ya
tiene filas provisionales y se decide descartarlas, es un `DROP TABLE`/`DELETE`
reversible desde un respaldo (mismo hábito de respaldo previo ya establecido en esta
sesión).

## Verificación

- `cybersecurity/`: `npm test` suite completa en verde, incluidos los tests nuevos de
  `dss-importer.js` y `getHapliteDeviceGroups`.
- Import real en modo auditoría contra `cctv-automation-final` (o su endpoint, según
  §9.3) — confirmar conteo (111 dispositivos esperados, o el número vigente al momento
  de implementar).
- Verificar a mano cuántos grupos hAP lite+NVR se forman contra los datos reales, y
  que ningún grupo se forme sin evidencia real de IP compartida.
- `cd CRM_Frontend && npm run lint` + `npm run build`.
- Docker local, `http://127.0.0.1:3003/`, verificación visual real en navegador (no
  solo API+bundle).
