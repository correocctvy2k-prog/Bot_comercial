# TASKS 0009 — Bots Gane Palmira: tiempo real y rediseño premium

Referencia: `spec.md` y `plan.md`. 4 tandas independientes; un commit por pieza.

## Tanda A — Rediseño visual base · HECHA (`c24217c`)

- [x] (6) Quitado el "Monitor de Actividad" de Bot Comercial (`feed`, `FeedItem`, invalidación).
- [x] (3) `src/components/Panel.jsx` + `MiniBars.jsx` extraídos y rediseñados (índice de
      posición, valor/%, top-1 con `ring`, cabecera `bg-muted/20`, tipografía §3).
- [x] (3) `ChatbotAnalyticsPanel.jsx` usa `Panel`/`MiniBars` nuevos.
- [x] (4) `TopUsersBoard` prop `compact`; aplicado en los 3 rankings.
- [x] Build + lint verdes.

## Tanda B — Tablas legibles (#5) · HECHA (`bd23cf2`)

- [x] `src/components/entityBits.jsx`: `StatusPill` (icono+color), `CategoryChips` (color
      estable por nombre, +N), `LastActivity` (relativa + fecha absoluta en `title`),
      helpers `oskitarStatus`/`bettyStatus`.
- [x] Aplicado en Personas (Oskitar) y Clientes (Betty). "No disp." resaltado en ámbar.
- [x] La tabla completa del Ranking (Comercial) ya tenía canal/avatar/zonas; se deja como está
      (queda plegada tras "Ver tabla completa" desde 0006).
- [x] Build + lint verdes.

## Tanda C — Tiempo real con feedback (#2) · HECHA (`0ff0cd7`)

- [x] `src/hooks/usePrevious.js`: `usePrevious`, `useFreshKeys` (diff en render, sin estado),
      `prefersReducedMotion`.
- [x] KPIs: pulso sutil (~800 ms, CSS `sk-kpi-pulse`, patrón "ajustar estado en render").
- [x] Tablas Personas/Clientes: orden por última actividad desc; al `update`, la fila reciente
      sube a la 1 y se resalta ~2 s (`sk-row-flash`). `expanded` de Oskitar indexado por teléfono.
- [x] Punto "en vivo" (`LiveDot`) en la cabecera de Oskitar y Betty.
- [x] `@media (prefers-reduced-motion)` anula ambas animaciones.
- [x] Build + lint verdes.

## Tanda D — Paridad de Betty (#7, #8) · HECHA (`ad6681f`)

- [x] **#8** `BettyView`: conmutador Resumen / Detalle. Detalle = recorrido "Consultar
      resultados", tipos de mensaje, clientes más activos, día de la semana, **pasos más
      transitados** (`stepBreakdown`) y **desglose de "No disponible"** (count/%/clientes/
      correcciones). Top 5 + tabla de clientes visibles en ambas vistas.
- [x] **#7** — **doble serie descartada.** Solo `setState`/`extendTimeout` traen timestamp en
      el `state-manager.log`; `updateStep`/`clearState`/`updateData` **no** → una serie
      "entrantes vs salientes" sería dato fabricado. Se deja una serie honesta ("Eventos del
      bot") con subtítulo que explica la limitación. Sin cambio funcional en `analyticsBetty.js`
      (solo comentario). **Pendiente: ok del usuario a esta decisión.**
- [x] Build + lint verdes.

## Documentación (DoD)

- [ ] `CHANGELOG.md` (CRM_Frontend — Bots Gane Palmira).
- [ ] Ficha `CRM_Frontend/docs/analitica-agentes/README.md` (Panel/MiniBars, entityBits,
      TopUsersBoard compact, tiempo real, Betty Resumen/Detalle).
- [ ] `chatbot-analytics`: sin cambio de contrato en el modelo → no se toca DOCUMENTATION.
- [ ] ADR: no aplica. Lección aprendida: la limitación temporal del `state-manager.log` de
      Betty ya está en la spec/tasks; se registra `LL` sólo si vuelve a morder.

## Cierre

- [ ] PR enlazando la spec. CI (build) verde. Merge. Deploy `crm-frontend` a `192.168.8.65`
      y verificación. (`chatbot-analytics` sin cambios funcionales.)
