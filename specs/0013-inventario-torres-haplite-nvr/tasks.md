# TASKS 0013 — Inventario de torres: hAP lite + NVR por punto (fase 1)

Referencia: `spec.md` y `plan.md` en esta misma carpeta.
Marcar `[x]` al completar. Mantener actualizado durante toda la tarea.

## Bloqueante — validar con el usuario

- [ ] Confirmar/corregir el listado DSS de 111 dispositivos (enviado 2026-09-18,
      `dss-listado-revision.html`) — cuáles son los "casos puntuales" que no siguen el
      patrón IP-de-hAP-lite.
- [ ] Responder `spec.md` §9.1–§9.4 (zonas↔torres, IP del NVR estructuralmente
      inobtenible o no exportada esta vez, acceso directo a SQLite vs. endpoint,
      `cyber_towers` vacía vs. provisional).

## Implementación

- [ ] `cybersecurity/src/dss-importer.js` — importador de solo lectura, idempotente
      por hash, fuente `DSS`.
- [ ] `cybersecurity/scripts/pull-dss-devices.js` — CLI en modo auditoría por defecto.
- [ ] `cybersecurity/src/cybersecurity-read-model.js` — `getHapliteDeviceGroups(db)`.
- [ ] `cybersecurity/src/cybersecurity-api.js` — ruta nueva para los grupos.
- [ ] `CRM_Frontend/src/pages/CybersecurityDashboard.jsx` — sección "Puntos hAP lite +
      CCTV" en Inventario.
- [ ] `cybersecurity/db/schema.sql` — tabla `cyber_towers` (si se confirma en §9.4).

## Verificación

- [ ] `cybersecurity/`: `npm test` (suite completa)
- [ ] Import real en modo auditoría contra datos reales (no solo fixture)
- [ ] Import real con `--apply` contra base local, con respaldo previo
- [ ] Conteo de grupos hAP lite+NVR formados vs. puntos sin par, verificado a mano
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
