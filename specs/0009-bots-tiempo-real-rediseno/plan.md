# PLAN 0009 — Bots Gane Palmira: tiempo real y rediseño premium

Referencia: `spec.md`. Ejecución en 4 tandas independientes (A→D), un commit por pieza.

## Enfoque

Casi todo es `CRM_Frontend`. Único toque de backend: `chatbot-analytics/lib/analyticsBetty.js`
para la Tanda D (#7), aditivo. Se reutilizan los disparadores de tiempo real que ya existen
(SSE del servicio + Supabase realtime); lo nuevo es sólo el **feedback visual**.

## Archivos a tocar

| Archivo | Tanda | Cambio |
|---------|-------|--------|
| `src/pages/Dashboard.jsx` | A, C | Quitar `feed`/`FeedItem`/monitor (#6); ranking con feedback en vivo |
| `src/components/Panel.jsx` (nuevo) | A | Extraído de `ChatbotAnalyticsPanel` + tipografía design-system |
| `src/components/MiniBars.jsx` (nuevo) | A | Extraído + rediseño premium |
| `src/components/TopUsersBoard.jsx` | A | Prop `compact`, fila ~44 px |
| `src/components/EntityTable.jsx` (nuevo) | B | Tabla compartida Personas/Clientes/Ranking |
| `src/components/ChatbotAnalyticsPanel.jsx` | A-D | Usa las piezas nuevas; feedback en vivo; Betty Resumen/Detalle |
| `src/hooks/usePrevious.js` (nuevo) | C | Diff de valores para el pulso de KPIs |
| `src/components/botKit.jsx` | C | `KpiCard` acepta `pulseOnChange` / wrapper que lo aplica |
| `chatbot-analytics/lib/analyticsBetty.js` | D | `byDay.conversation` y `byDay.progress` (desde `state`) |
| `chatbot-analytics/docs/DOCUMENTATION.md` · `README.md` | D | Documentar campos nuevos de `byDay` |

## Contratos de datos

- **Betty `byDay`** pasa de `{ date, count }` a `{ date, count, conversation, progress }`
  (`conversation` = nº de `setState` ese día; `progress` = nº de `updateStep`). `count` se
  mantiene por compatibilidad. Sin cambios en KPIs ni en otras series.
- El resto del modelo, sin cambios.

## Diseño / UI

- **Panel**: `bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl`; cabecera
  `border-b`, título `text-sm font-black tracking-tight`, subtítulo `text-[11px]
  text-muted-foreground`; icon-badge `w-9 h-9 rounded-xl` con degradado por sección.
- **MiniBars**: cada fila = etiqueta (`text-xs font-bold`) + valor/porcentaje a la derecha;
  pista `h-2.5 rounded-full bg-muted`; relleno degradado; top-1 con `ring-1` de acento.
- **TopUsersBoard compact**: sin icon-badge grande; medalla = `h-6 w-6 rounded-md` con color
  oro/plata/bronce; nombre + sublabel en una línea; valor `text-base font-black`.
- **EntityTable**: cabecera `bg-muted/40 text-[10px] uppercase`; filas `divide-y
  divide-border/40 hover:bg-muted/40`; celda de estado con `<StatusPill>`; chips de categoría
  con `categoryColor(name)` (hash → paleta fija de tokens); acción "Ficha".
- **Tiempo real**: `motion.tr layout` para reordenar; `animate={{ backgroundColor }}` flash
  ~600 ms; `@media (prefers-reduced-motion)` desactiva `layout` y flash. Punto "en vivo" en la
  cabecera: `motion.span` que hace un `scale`/`opacity` pulse al recibir `update`.

## Rollout / rollback

Una rama, PR único, pero commits por tanda para revisión. Rebuild de `crm-frontend` +
`chatbot-analytics`. Rollback = `git revert` del merge + rebuild.

## Verificación

- #6: Bot Comercial sin monitor; comparar las 3 vistas lado a lado.
- #3/#4: recorrer cada tarjeta y el ranking en claro/oscuro; medir alto del ranking.
- #5: tabla con estados/chips/canal; `title` con fecha absoluta; fila abre ficha.
- #2: generar una interacción real (mensaje al bot) → ver pulso de KPI + fila subiendo;
  repetir con `prefers-reduced-motion` activo → sin animación.
- #7: `curl /api/betty/analytics` trae `byDay[].conversation` y `byDay[].progress`; el
  gráfico pinta dos áreas.
- #8: Betty muestra el conmutador Resumen/Detalle y el Detalle con sus paneles.
- `npm run lint` + `npm run build` verdes; smoke en Docker local.
