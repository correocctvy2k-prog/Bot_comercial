# TASKS 0002 — Analítica de Agentes: Ranking

Referencia: `spec.md` y `plan.md` en esta misma carpeta.
Marcar `[x]` al completar. Mantener actualizado durante toda la tarea.

## Implementación

- [x] Crear rama `feat/0002-analitica-agentes-ranking`.
- [x] Escribir spec retroactiva (`spec.md`, `plan.md`, `tasks.md`).
- [x] `git stash pop` del WIP en esta rama.
- [x] Re-stashear `CRM_Frontend/src/pages/CybersecurityDashboard.jsx` (ajeno a esta spec).
- [x] `crm.service.js` → `getUserRanking`: `startDate` según rango real (`24h`/`7d`/`1m`/`1y`).
- [x] `Dashboard.jsx` / `RankingSection`: paginación (`RANKING_PAGE_SIZE = 15`).
- [x] `RankingSection`: filtro por canal (`Todos`/`WhatsApp`/`Telegram`), reset a página 1.
- [x] `RankingSection`: orden por `# Pos.` y `Total Mensajes` (asc/desc), reset a página 1.
- [x] `RankingSection`: exportar CSV del ranking filtrado + ordenado (BOM UTF-8, escape).
- [x] `RankingSection`: buscador resetea a página 1.
- [x] `RankingSection`: pase de diseño (tokens de tema, sin `bg-white/5` / `border-white/10`).

## Verificación

- [x] `cd CRM_Frontend && npx eslint src/pages/Dashboard.jsx src/services/crm.service.js` — 0 errores
      en los archivos tocados (el `npm run lint` global tiene 407 errores preexistentes en otros
      archivos, fuera del alcance de 0002).
- [x] `cd CRM_Frontend && npm run build` — verde (`✓ built in ~21s`).
- [ ] `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build crm-frontend`
- [ ] Smoke test en `http://127.0.0.1:3003/` (ver `docs/operacion/despliegue-local.md`):
  - [ ] Selector de rango: `24h`/`7d`/`1m`/`1y` cambia los totales del Ranking.
  - [ ] Paginación 15/pág, Anterior/Siguiente, indicadores.
  - [ ] Filtro de canal acota y vuelve a página 1.
  - [ ] Orden de columnas alterna asc/desc y vuelve a página 1.
  - [ ] "Exportar CSV" descarga y abre bien en Excel (acentos, columnas).
  - [ ] Tema claro y oscuro sin superficies rotas.
  - [ ] Consola del navegador sin errores nuevos respecto a `main`.

## Documentación (Definition of Done)

- [ ] `CHANGELOG.md` — el bloque ya existe; quitar la nota "_Pendiente spec retroactiva_" y
      dejar el enlace a `specs/0002-analitica-agentes-ranking/`.
- [ ] Ficha de módulo `CRM_Frontend/docs/analitica-agentes/README.md` — documentar el Ranking
      con rango real, paginación, filtro, orden y export.
- [ ] ADR: no aplica (sin decisión de arquitectura; cambio solo cliente).
- [ ] Lección aprendida: no aplica a 0002. (El tropiezo de entorno local / `comercial-bot`
      se registra aparte, ver [[comercial-bot-build-roto-bullseye]].)

## Cierre

- [ ] PR abierto y enlazado en `spec.md`.
- [ ] CI verde (`.github/workflows/crm-frontend.yml`).
- [ ] Merge a `main` (nota: depende de que `chore/working-model` — infra SDD — llegue a `main`).
- [ ] Desplegado y verificado en `http://192.168.8.65:3003/`.
