# TASKS NNNN — <título>

Referencia: `spec.md` y `plan.md` en esta misma carpeta.
Marcar `[x]` al completar. Mantener actualizado durante toda la tarea.

## Implementación

- [ ] Tarea atómica 1
- [ ] Tarea atómica 2

## Verificación

- [ ] `cd CRM_Frontend && npm run lint`
- [ ] `cd CRM_Frontend && npm run build`
- [ ] `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build crm-frontend`
- [ ] Smoke test en `http://127.0.0.1:3003/` (ver `docs/operacion/despliegue-local.md`)

## Documentación (Definition of Done)

- [ ] `CHANGELOG.md` — sección "No publicado"
- [ ] Ficha de módulo en `docs/modulos/…`
- [ ] ADR en `docs/adr/` (si hubo decisión de arquitectura)
- [ ] Lección aprendida en `docs/lecciones-aprendidas/` (si hubo tropiezo no obvio)

## Cierre

- [ ] PR abierto y enlazado en `spec.md`
- [ ] CI verde
- [ ] Merge a `main`
- [ ] Desplegado y verificado en `http://192.168.8.65:3003/`
