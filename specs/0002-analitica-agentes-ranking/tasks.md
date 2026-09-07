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
- [x] `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build crm-frontend`
- [x] Smoke test en `http://127.0.0.1:3003/` (Playwright + login de prueba, 2026-09-07):
  - [x] Selector de rango: 4 opciones (`Hoy (Últimas 24h)` / `Últimos 7 días` / `Último mes` /
        `Último año`), todas seleccionables y refrescan los datos.
  - [~] Paginación: barra oculta correctamente con ≤ 15 usuarios; **no verificable visualmente**
        con los datos de prueba (solo 3 usuarios). Lógica revisada en código.
  - [x] Filtro de canal: `Todos`/`WhatsApp`/`Telegram` acotan la tabla, el contador
        (`… (N usuarios)`) se actualiza, estado vacío controlado, "Exportar CSV" se deshabilita
        sin filas.
  - [x] Orden de columnas: `# Pos.` y `Total Mensajes` clicables, alternan asc/desc.
  - [x] "Exportar CSV": descarga `ranking-agentes-2026-09-07.csv`, BOM UTF-8, cabeceras OK,
        acentos correctos, respeta el orden actual.
  - [x] Buscador resetea a página 1 (código; no visible con 3 usuarios).
  - [x] Tema oscuro y claro: la Tabla Completa se ve bien en ambos.
  - [x] Consola del navegador: sin errores; solo el warning benigno preexistente
        "Auth initialization timeout".
  - [ ] **Nota (fuera de 0002):** los chips de zona del **podio TOP 1-3** tienen bajo contraste
        en tema claro (`text-amber-300` sobre `bg-amber-500/10`). Es preexistente (commit
        `8b10183`, ya en producción) → se aborda en el frente de estandarización de interfaz.

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
