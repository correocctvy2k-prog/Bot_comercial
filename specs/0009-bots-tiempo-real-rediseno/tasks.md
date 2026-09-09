# TASKS 0009 — Bots Gane Palmira: tiempo real y rediseño premium

Referencia: `spec.md` y `plan.md`. 4 tandas independientes; un commit por pieza.

## Tanda A — Rediseño visual base

- [ ] (6) Quitar "Monitor de Actividad" de Bot Comercial: `feed` query, `FeedItem`,
      `invalidateQueries(['feed'])` y el bloque en `Dashboard.jsx`.
- [ ] (3) `src/components/Panel.jsx` extraído de `ChatbotAnalyticsPanel` + tipografía §3.
- [ ] (3) `src/components/MiniBars.jsx` extraído + rediseño (valor/%, degradado, top-1 con acento).
- [ ] (3) `ChatbotAnalyticsPanel.jsx` usa `Panel`/`MiniBars` nuevos en Oskitar y Betty.
- [ ] (4) `TopUsersBoard` prop `compact` (fila ~44 px, medalla-índice, sin icon-badge grande).
- [ ] Build + lint + smoke claro/oscuro. Commit.

## Tanda B — Tablas legibles (#5)

- [ ] `src/components/EntityTable.jsx` (o `StatusPill` + `CategoryChips` + helpers compartidos).
- [ ] Estado con icono+color; chips de categoría con color estable; canal; última actividad
      relativa + `title` absoluto; acción "Ficha"; fila → `ContactDrawer`.
- [ ] Aplicar en Personas (Oskitar), Clientes (Betty) y tabla completa del Ranking (Comercial).
- [ ] Build + lint + smoke. Commit.

## Tanda C — Tiempo real con feedback (#2)

- [ ] `src/hooks/usePrevious.js`.
- [ ] KPIs: pulso sutil (~600 ms) + count-up corto al cambiar el valor (`framer-motion`).
- [ ] Tabla Personas/Clientes: orden por última interacción desc; al `update`, diff vs lista
      previa → fila reciente sube a la 1 con `motion.tr layout` + flash de fondo.
- [ ] Ranking de Bot Comercial: mismo feedback al cambiar el conteo.
- [ ] Punto "en vivo" en la cabecera del bot (pulso al recibir `update`).
- [ ] Respetar `prefers-reduced-motion` (sin `layout` ni flash).
- [ ] Build + lint + smoke (interacción real contra el bot). Commit.

## Tanda D — Paridad de Betty (#7, #8)

- [ ] `chatbot-analytics/lib/analyticsBetty.js`: `byDay` suma `conversation` (`setState`) y
      `progress` (`updateStep`) por día. `count` intacto.
- [ ] `chatbot-analytics` docs: campos nuevos de `byDay` en `DOCUMENTATION.md` + `README.md`.
- [ ] Betty "Actividad por día" → dos áreas (Actividad de conversación / Progreso del bot),
      con fallback a serie única si el campo falta.
- [ ] `BettyView`: conmutador Resumen / Detalle (patrón de `OskitarView`).
- [ ] Betty Detalle: `topByFlow`, `resultadosFunnel`, `stepBreakdown`, desglose "No
      disponible", `byWeekday`, `messageTypes`.
- [ ] Rebuild `chatbot-analytics` + build + lint + smoke. Commit.

## Documentación (DoD)

- [ ] `CHANGELOG.md` (CRM_Frontend — Bots Gane Palmira; Infra/Docs para `byDay`).
- [ ] Ficha `CRM_Frontend/docs/analitica-agentes/README.md` (piezas nuevas, tiempo real, Betty Detalle).
- [ ] `chatbot-analytics/docs/DOCUMENTATION.md` + `README.md` (campos de `byDay`).
- [ ] ADR: no aplica (cambio aditivo al modelo). Lección aprendida sólo si hay tropiezo no obvio.

## Cierre

- [ ] PR enlazando la spec. CI (build) verde. Merge. Deploy `crm-frontend` + `chatbot-analytics`
      a `192.168.8.65` y verificación.
