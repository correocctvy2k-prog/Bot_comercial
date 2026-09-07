# Changelog

Registro de cambios del ecosistema Skylab. Formato basado en
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

Cada PR actualiza la sección **No publicado**, bajo la subsección del módulo que toca
(`CRM_Frontend`, `chatbot-soporte`, `Bot Comercial`, `Ciberseguridad`, `CCTV`,
`Monitoreo IT`, `Asamblea`, `Infra/Docs`). Al desplegar a producción se mueve el bloque
a una versión fechada.

## [No publicado]

### Infra / Docs
- **Modelo de trabajo SDD y gobernanza** (`specs/0001-modelo-de-trabajo-sdd/`, `ADR-0001`):
  documento canónico `docs/WORKING_MODEL.md` + punteros por herramienta de IA
  (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`); estructura
  `specs/`; `docs/adr/` y `docs/lecciones-aprendidas/` a nivel raíz; `docker-compose.local.yml`
  (override, no toca el base) + `docs/operacion/despliegue-local.md`; CI
  `.github/workflows/crm-frontend.yml` (lint + build); `.github/pull_request_template.md`;
  `CRM_Frontend/docs/design-system.md`. Sin impacto en producción.

### CRM_Frontend — Analítica de Agentes
- **Ranking de Usuarios & Zonas** (`specs/0002-analitica-agentes-ranking/`, spec retroactiva):
  - `getUserRanking` respeta el rango de tiempo real (`24h`/`7d`/`1m`/`1y`) en vez de forzar
    mínimo 30 días; mismo criterio que `getDashboardStats`.
  - Paginación de la tabla completa (15 por página) con controles e indicadores; se oculta
    con ≤ 15 usuarios.
  - Filtro por canal (Todos / WhatsApp / Telegram), orden por columnas (`# Pos.`,
    `Total Mensajes`) y exportación a CSV del ranking filtrado y ordenado (BOM UTF-8).
  - Buscador y todos los filtros resetean la paginación a la página 1.
  - Pase de diseño: superficies y tipografía alineadas con el ADN premium de la cabecera;
    tokens de tema en vez de `bg-white/5` / `border-white/10`.

---

## Historial previo

Antes de este changelog, el registro de cambios vivía en el historial de Git y en
`PROYECTO_CONTEXTO.md`. Ver `git log` para lo anterior a 2026-09-07.
