# TASKS 0013 — Inventario de torres: hAP lite + NVR por punto (fase 1)

Referencia: `spec.md` y `plan.md` en esta misma carpeta.
Marcar `[x]` al completar. Mantener actualizado durante toda la tarea.

## Bloqueante — validar con el usuario

- [ ] Confirmar/corregir el listado DSS de 111 dispositivos (enviado 2026-09-18,
      `dss-listado-revision.html`) — cuáles son los "casos puntuales" que no siguen el
      patrón IP-de-hAP-lite.
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

- [ ] `cybersecurity/db/seed/torres-haplite-20260918.json` — datos semilla reales
      (14 torres + 1 celda, con sus puntos/hAP lite) transcritos de `torres_HapLite.pdf`.
- [ ] `cybersecurity/scripts/seed-towers.js` — carga el JSON a `cyber_towers`/
      `cyber_tower_points`, idempotente.
- [ ] `cybersecurity/src/dss-importer.js` — importador de solo lectura, idempotente
      por hash, fuente `DSS`.
- [ ] `cybersecurity/scripts/pull-dss-devices.js` — CLI en modo auditoría por defecto.
- [ ] `cybersecurity/src/cybersecurity-read-model.js` — `getTowerPoints(db)`.
- [ ] `cybersecurity/src/cybersecurity-api.js` — ruta nueva `GET /api/cybersecurity/towers`.
- [ ] `CRM_Frontend/src/pages/CybersecurityDashboard.jsx` — sección "Torres" en
      Inventario (torre real → puntos → hAP lite + grabador).
- [ ] `cybersecurity/db/schema.sql` — tablas `cyber_towers` y `cyber_tower_points`.

## Verificación

- [ ] `cybersecurity/`: `npm test` (suite completa)
- [ ] Los 14 registros de `cyber_towers` corresponden exactamente a los nombres
      reales del PDF; la celda queda marcada `is_tower = false`
- [ ] Import real en modo auditoría contra datos reales (no solo fixture)
- [ ] Import real con `--apply` contra base local, con respaldo previo
- [ ] Conteo de puntos con dispositivo DSS encontrado por IP (base ya medida: 93/96)
      y con corroboración FortiGate (base ya medida: 7/96), verificado a mano sin
      sorpresas grandes respecto a `spec.md` §0.1
- [ ] `cd CRM_Frontend && npm run lint`
- [ ] `cd CRM_Frontend && npm run build`
- [ ] `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build cybersecurity-api crm-frontend` + `restart crm-frontend`
- [ ] Verificación visual real en navegador en `http://127.0.0.1:3003/` (no solo
      API+bundle — pendiente arrastrado de la ronda anterior)

## Documentación (Definition of Done)

- [ ] `CHANGELOG.md` — sección "No publicado"
- [ ] Ficha de módulo en `docs/modulos/ciberseguridad/`
- [ ] ADR en `docs/adr/` si se decide algo de arquitectura no trivial (ej. acceso
      directo entre servicios vs. endpoint — ver `spec.md` §9.3)
- [ ] Lección aprendida en `docs/lecciones-aprendidas/` si hubo un tropiezo no obvio

## Cierre

- [ ] PR abierto y enlazado en `spec.md`
- [ ] Merge a `main`
- [ ] Desplegado y verificado en `http://192.168.8.65:3003/`
