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

- [ ] `chatbot-analytics`: endpoint `GET /api/:bot/contact?id=<phone>` con la transcripción
      (desde `state.events` / logs cargados), respetando `MASK_PHONES`. Límite / paginación.
- [ ] `chatbotAnalytics.service.js`: `getContact(bot, id)`.
- [ ] Front: ficha de contacto (drawer o sub-vista) — datos, estado, categorías, transcripción.
      Se abre desde la tabla de personas/clientes. Para Bot Comercial, equivalente contra Supabase.
- [ ] Build + lint + smoke claro/oscuro. Commit. ADR si el endpoint cambia el contrato del servicio.

## Documentación (DoD)

- [ ] `CHANGELOG.md` (Analítica de Agentes / Bots Gane Palmira).
- [ ] Ficha de módulo `CRM_Frontend/docs/analitica-agentes/README.md` (renombrar/actualizar).
- [ ] ADR si aplica (rutas nuevas / endpoint del servicio).

## Cierre

- [ ] PR enlazando la spec. CI (build) verde. Merge. Deploy y verificación en `192.168.8.65`.
