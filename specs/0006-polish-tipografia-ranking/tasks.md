# TASKS 0006 — Polish: tipografía de encabezados, avatar de bot y ranking Top 5

Referencia: `spec.md` en esta misma carpeta. 3 bloques independientes.

## Bloque A — Estándar de tipografía de encabezado de módulo

- [x] `docs/design-system.md` §3: fila "Encabezado de módulo (página)" →
      `text-2xl font-bold tracking-tight` + subtítulo `text-sm text-muted-foreground font-medium`.
- [x] `src/components/PageHeader.jsx`: `{ icon, title, subtitle, actions }`.
- [x] `PageHeader` adoptado en: `Contacts`, `Dashboard` (Bot Comercial) y `ChatbotAnalyticsPanel`
      (Oskitar/Betty).
- [x] Normalizados en el sitio (solo clases del `<h1>`/subtítulo): `UsersDashboard`,
      `MonitoringDashboard`.
- [x] **Ajuste de alcance:** `Monitoring` y `ServicesTIDashboard` inyectan su título en la barra
      superior del layout (`setPageHeader`, `h-[80px]`) — ya `font-bold`, no se tocan para no
      desbordar. `CybersecurityDashboard` y `CctvModule` conservan su encabezado premium-dark
      propio (identidad deliberada, specs 0003/0004). `AsambleaDashboard` y `SupportDashboard`
      tienen la ruta deshabilitada. `Points`/`Connections` no tienen `<h1>` de módulo propio
      (usan el `currentTitle` del layout).
- [ ] Revisión visual (claro/oscuro) de Contactos, bots y los 2 dashboards normalizados.

## Bloque B — Avatar de bot

- [x] Copiado `chatbot-analytics/image/{Comercial,Oskitar,Betty}.png` → `CRM_Frontend/src/assets/bots/`,
      optimizados a 256 px con `npx sharp-cli` (1.4 MB → 430 KB, cargan solo en `/bots/*`).
- [x] `src/components/botKit.jsx`: `BOT_AVATARS` + `BotAvatar({ bot, size })` con `onError`
      → fallback al icono lucide (`Zap`/`ShieldCheck`/`Bot`).
- [x] `Dashboard.jsx`: avatar en el conmutador de bots y en el encabezado de Bot Comercial.
- [x] `ChatbotAnalyticsPanel.jsx`: avatar en el encabezado de Oskitar y Betty.

## Bloque C — Ranking Top 5 premium + tabla plegable

- [x] `src/components/TopUsersBoard.jsx`: board premium Top 5 (`RANK_META` oro/plata/bronce
      1-3, neutro 4-5); `rows` normalizadas; fila → callback (abre `ContactDrawer`).
- [x] `Dashboard.jsx` `RankingSection`: board Top 5 arriba; podio+tabla actuales dentro de un
      `<details>` "Ver tabla completa (N)" plegado por defecto (búsqueda/filtro/CSV dentro).
- [x] `ChatbotAnalyticsPanel.jsx` `OskitarView`: board Top 5 desde `m.topUsers`, sobre la
      tabla "Personas"; fila abre `ContactDrawer`.
- [x] `BettyView`: board Top 5 desde `m.topCustomers`, sobre la tabla "Clientes".

## Verificación

- [x] `cd CRM_Frontend && npx eslint <archivos tocados>` sin errores nuevos
      (`motion` sin usar en `UsersDashboard` es deuda previa).
- [x] `cd CRM_Frontend && npm run build` verde (assets de bot ~430 KB, chunk propio).
- [x] `docker compose ... up -d --build crm-frontend`.
- [ ] Smoke visual en `http://127.0.0.1:3003/` claro y oscuro (pendiente: requiere login).

## Documentación (Definition of Done)

- [x] `CHANGELOG.md` — "No publicado" (bloque 0006).
- [x] `docs/design-system.md` §3 (bloque A).
- [x] Ficha `CRM_Frontend/docs/analitica-agentes/README.md` (PageHeader, BotAvatar, TopUsersBoard).
- [ ] ADR: no aplica (evolución del design-system documentada en el propio doc).
- [ ] Lección aprendida: solo si aparece un tropiezo no obvio.

## Cierre

- [ ] PR enlazando la spec. CI (build) verde. Merge. Deploy y verificación en `192.168.8.65`.
