<!--
Modelo de trabajo: docs/WORKING_MODEL.md
Toda casilla marcada debe ser verdad. Si algo no aplica, escribe "N/A" y por qué.
-->

## Spec

- Carpeta: `specs/NNNN-slug/`
- Resumen del cambio (1–3 líneas):

## Módulos afectados

<!-- CRM_Frontend / chatbot-soporte / Bot Comercial / Ciberseguridad / CCTV / Monitoreo IT / Asamblea / Infra-Docs -->

## Definition of Done

- [ ] Existe `specs/NNNN-slug/` y está enlazada arriba.
- [ ] Respeta `CRM_Frontend/docs/design-system.md` y la arquitectura base (`docs/WORKING_MODEL.md` §2).
- [ ] `cd CRM_Frontend && npm run lint` sin errores.
- [ ] `cd CRM_Frontend && npm run build` en verde.
- [ ] Verificado en Docker local `http://127.0.0.1:3003/` (no solo `npm run dev`) — smoke test de `docs/operacion/despliegue-local.md`.
- [ ] `CHANGELOG.md` actualizado (sección "No publicado").
- [ ] Ficha de módulo actualizada (`docs/modulos/…`).
- [ ] ADR creado si hubo decisión de arquitectura (`docs/adr/`). — o N/A
- [ ] Lección aprendida registrada si hubo tropiezo no obvio (`docs/lecciones-aprendidas/`). — o N/A
- [ ] No hay cambios no intencionados en `docker-compose.yml`, `Dockerfile`, `nginx.conf`, `.env*`.
- [ ] Sin commits directos a `main`; sin secretos versionados.

## Impacto en producción y rollback

<!-- Qué cambia para el usuario final y para el deploy. Cómo se revierte si falla. -->

## Evidencia

<!-- Capturas del smoke test local, salida de build/lint, etc. -->
