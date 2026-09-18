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

## Pendiente (fuera de esta fase, ver spec 0013 §4)

Modelo completo de torre (enlaces, celdas, router principal, UPS), monitoreo en vivo
(caída/latencia/ancho de banda), detección de vulnerabilidades de firmware, y la
jerarquía Zona → Sitio → Punto (7 zonas operativas reales, documentada en spec 0013
§0.2 como información para cuando se retome).
