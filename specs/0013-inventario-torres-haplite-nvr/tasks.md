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

## Cierre

- [ ] PR abierto y enlazado en `spec.md`
- [ ] Merge a `main`
- [ ] Desplegado y verificado en `http://192.168.8.65:3003/` — **importante:** al
      desplegar, correr `seed-towers.js` + `pull-dss-devices.js --apply` contra el
      archivo real de `.65` (con respaldo previo) antes o junto con el rebuild del
      contenedor `cybersecurity-api` (que corre de solo lectura, `--immutable`) —
      mismo patrón ya usado para KSC/FortiGate en ese servidor.
