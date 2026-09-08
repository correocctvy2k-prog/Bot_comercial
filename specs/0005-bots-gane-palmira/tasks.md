# TASKS 0005 — Bots Gane Palmira

Referencia: `spec.md`. Ejecución en 4 tandas (1-3 seguidas, 4 aparte).

## Tanda 1 — Nombre, espacio, narrativa

- [x] (1) Renombrar a "Bots Gane Palmira": `Layout.jsx` (nav), cabecera de página, `<h2>` interno.
- [x] (3) Quitar título duplicado; subir conmutador de bot + toolbar/periodo a la zona superior.
- [x] (4) Quitar KPI "Cobertura SIISS" de la vista Bot Comercial (`Dashboard.jsx`).
- [x] (8) `buildSummary(bot, model)` → párrafo narrativo al inicio de cada vista (Comercial, Oskitar, Betty).
- [x] Build + lint + smoke claro/oscuro. Commit `dbef37c`.

## Tanda 2 — Consistencia

- [x] (5) Exportar `KpiCard` de `Dashboard.jsx`; usarlo en `ChatbotAnalyticsPanel` (Oskitar/Betty).
- [x] (6) Extraer el `<select>` de periodo de Bot Comercial a componente reutilizable; usarlo en
      Oskitar/Betty (mapa a `from/to`: 24h/7d/1m/1y).
- [x] Build + lint + smoke. Commit `dbef37c`.

## Tanda 3 — Submenú

- [x] (2) `App.jsx`: rutas `/bots/comercial|oskitar|betty`; `/` → redirect `/bots/comercial`.
- [x] `Dashboard.jsx`: leer el bot de `useParams`/`useLocation`; conmutador de pestañas
      sincroniza la URL (`navigate`).
- [x] `Layout.jsx`: "Bots Gane Palmira" como grupo desplegable con 3 sub-ítems.
- [x] Build + lint + smoke (deep-link + cambio de pestaña). Commit `dbef37c`.

## Tanda 4 — CRM por bot (ficha + historial)

- [x] `chatbot-analytics`: endpoint `GET /api/:bot/contact?id=<phone>&limit=&offset=` con la
      transcripción (`lib/contact.js`, desde `state.events` / `state.betty`, sin releer logs),
      respetando `MASK_PHONES` (resuelve el id por `maskPhone(peer) === id`). Paginación hacia
      atrás por `offset` (mensajes recientes a saltar), `limit` máx. 1000.
- [x] `chatbotAnalytics.service.js`: `getContact(bot, id, {limit, offset})`.
- [x] `crm.service.js`: `getContactByProvider(providerId, {limit, offset})` — Bot Comercial vs
      Supabase, misma forma de respuesta que el endpoint del servicio.
- [x] Front: `src/components/ContactDrawer.jsx` — drawer lateral (datos, estado, categorías/flujos,
      transcripción tipo chat con separadores de fecha y "cargar mensajes anteriores"). Se abre
      desde la fila de Personas (Oskitar), Clientes (Betty) y Ranking (Bot Comercial).
- [x] `npm run lint` (archivos tocados, sin errores nuevos) + `npm run build` verdes.
- [x] Rebuild `chatbot-analytics` + `crm-frontend` en Docker local; smoke del endpoint contra
      datos reales (SSH): id enmascarado, Betty (recorrido + nota), paginación, 400/404.
- [ ] Smoke visual del drawer en `http://127.0.0.1:3003/` tema claro y oscuro (pendiente: requiere login).
- [ ] Commit.
- Sin ADR: el endpoint es **aditivo**, no cambia el contrato de las rutas existentes.

## Documentación (DoD)

- [x] `CHANGELOG.md` (Bots Gane Palmira T4 + Infra/Docs · endpoint de ficha).
- [x] Ficha de módulo `CRM_Frontend/docs/analitica-agentes/README.md` (ContactDrawer, servicios).
- [x] `chatbot-analytics`: `docs/DOCUMENTATION.md` §9 + tabla de rutas en `README.md`.
- [x] Lección aprendida `docs/lecciones-aprendidas/LL-0003` (resolución del id enmascarado).
- [ ] ADR: no aplica (endpoint aditivo).

## Cierre

- [ ] PR enlazando la spec. CI (build) verde. Merge. Deploy y verificación en `192.168.8.65`.
