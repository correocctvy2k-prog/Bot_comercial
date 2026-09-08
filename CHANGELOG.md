# Changelog

Registro de cambios del ecosistema Skylab. Formato basado en
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

Cada PR actualiza la sección **No publicado**, bajo la subsección del módulo que toca
(`CRM_Frontend`, `chatbot-soporte`, `Bot Comercial`, `Ciberseguridad`, `CCTV`,
`Monitoreo IT`, `Asamblea`, `Infra/Docs`). Al desplegar a producción se mueve el bloque
a una versión fechada.

## [No publicado]

### CRM_Frontend — Analítica de Agentes · Integración Oskitar / Betty
- **Analítica de chatbots nativa** (`specs/0004-integracion-analitica-chatbots/`, `ADR-0002`):
  el conmutador del módulo pasa a 3 pestañas — **Bot Comercial · Oskitar · Betty**. Oskitar y
  Betty son nativas (Recharts + tokens, no iframe), consumen la API JSON + SSE del nuevo
  servicio `chatbot-analytics`. KPIs, series por día/hora, embudo (Oskitar), categorías,
  flujos (Betty), tablas de personas/clientes, filtro de rango y categoría, export CSV y
  refresco en vivo por SSE.
- Se **retira "Bot Soporte Técnico"** del módulo (embebía `chatbot-soporte`).
- Se **retira el módulo "Centro de Soporte"** (`/support` + nav): la analítica de soporte vive
  ahora en la pestaña Oskitar. Página conservada en el árbol, sin ruta.

### Infra / Docs
- **Servicio `chatbot-analytics`** (`specs/0004`, `ADR-0002`): panel gerencial Express
  (Oskitar + Betty) incorporado al repo; `Dockerfile` propio; servicio en `docker-compose*`
  (host 3008 → contenedor 3000), lee los logs de los bots por SSH; CORS abierto para el CRM.
  Nueva build-arg `VITE_CHATBOT_ANALYTICS_URL`. `.env` con credenciales SSH **no versionado**.
- **Modelo de trabajo SDD y gobernanza** (`specs/0001-modelo-de-trabajo-sdd/`, `ADR-0001`):
  documento canónico `docs/WORKING_MODEL.md` + punteros por herramienta de IA
  (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`); estructura
  `specs/`; `docs/adr/` y `docs/lecciones-aprendidas/` a nivel raíz; `docker-compose.local.yml`
  (override, no toca el base) + `docs/operacion/despliegue-local.md`; CI
  `.github/workflows/crm-frontend.yml` (build bloqueante; lint informativo hasta que el
  frente de estandarización — `specs/0003` — lo lleve a 0); `.github/pull_request_template.md`;
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
