# SPEC 0006 — Polish: tipografía de encabezados, avatar de bot y ranking Top 5

- **Estado:** Aprobada
- **Autor:** equipo Skylab (@jbeltran)
- **Fecha:** 2026-09-08
- **Módulos afectados:** CRM_Frontend (todos los dashboards — encabezado de módulo);
  Bots Gane Palmira (`Dashboard.jsx`, `ChatbotAnalyticsPanel.jsx`); `docs/design-system.md`.
- **Rama:** `feat/0006-polish-tipografia-ranking`
- **PR:** _pendiente_

## 1. Problema / oportunidad

Tres detalles de "latonería y pintura" sobre lo ya construido (specs 0004-0005):

1. **Tipografía de encabezados dispar.** El encabezado del módulo Contactos
   (`src/pages/Contacts.jsx`: `text-2xl font-bold tracking-tight` + subtítulo `text-sm`
   en frase) se lee mejor que el estándar actual del `design-system.md`
   (`text-lg font-black tracking-tight` + micro-etiqueta `text-[11px] uppercase`). El resto
   de módulos usa el pesado; queremos el de Contactos como estándar.
2. **Los bots no tienen identidad visual.** En `chatbot-analytics/image/` hay 3 PNG
   (`Comercial.png`, `Oskitar.png`, `Betty.png`) que sirven como "foto de perfil" de cada bot
   y hoy no se usan en el CRM.
3. **El Ranking de Bot Comercial es pesado.** Podio Top 3 + tabla completa paginada
   (búsqueda, filtro de canal, CSV). Se quiere un **Top 5 premium** compacto, y el mismo
   componente para Oskitar y Betty (que hoy solo tienen una tabla de personas/clientes plana).

## 2. Objetivo

Encabezado de módulo uniforme y más legible en todo el CRM; cada bot con su avatar en el
tablero; y un board **Top 5** premium por bot, con la tabla completa disponible pero plegada.

## 3. Alcance

### 3.1 Estándar de tipografía de encabezado de módulo
- Nuevo componente `src/components/PageHeader.jsx`: `{ icon, title, subtitle, actions }`.
  - Título: `text-2xl font-bold tracking-tight text-foreground`.
  - Subtítulo: `text-sm text-muted-foreground font-medium mt-1` (frase, **no** mayúsculas).
  - Icono opcional a la izquierda (lucide o `<img>` de avatar), `actions` a la derecha.
- Actualizar `docs/design-system.md` §3 (tabla de tipografía) con la fila
  "Encabezado de módulo (página)".
- Adoptar `<PageHeader>` (o el patrón de clases si el layout no encaja) en el `<h1>/<h2>`
  superior de cada página de `src/pages/` que hoy tiene encabezado propio: Dashboard (Bot
  Comercial), Contacts, Monitoring, MonitoringDashboard, ServicesTIDashboard,
  CybersecurityDashboard, CctvModule, UsersDashboard, Connections, AsambleaDashboard,
  Points, SupportDashboard, GerenciaDashboard — y `ChatbotAnalyticsPanel` (Oskitar/Betty).
  `LoginPage` y `BotConfig` quedan fuera (no son módulos del shell).
- El `currentTitle` de la barra superior de `Layout.jsx` (`text-xl font-bold`) ya está
  alineado; no se toca.

### 3.2 Avatar de bot
- Copiar los 3 PNG a `CRM_Frontend/src/assets/bots/` (optimizados si hay herramienta;
  si no, tal cual — son < 800 KB c/u y cargan solo en el módulo de bots).
- `src/components/botKit.jsx`: exportar `BOT_AVATARS = { comercial, oskitar, betty }` y un
  componente `BotAvatar({ bot, size })` — `<img>` circular `object-cover` con borde
  `ring-1 ring-border` y fallback al icono lucide actual si la imagen no carga.
- Usarlo en: el encabezado de cada vista de bot (junto al título, vía `PageHeader`) y en el
  conmutador de bots de `Dashboard.jsx` (reemplaza el icono lucide de cada pestaña).

### 3.3 Ranking Top 5 premium + tabla plegable
- Nuevo `src/components/TopUsersBoard.jsx`: recibe `rows` normalizadas
  `[{ rank, name, sublabel, value, valueLabel, channel?, extra? }]` y pinta un board premium
  Top 5 (oro/plata/bronce para 1-3 con el mismo lenguaje de `RANK_META`; 4-5 neutros).
- **Bot Comercial** (`Dashboard.jsx` → `RankingSection`): el board Top 5 arriba; la tabla
  completa actual (podio Top 3 incluido) se mueve detrás de un `<details>`/toggle
  "Ver tabla completa" plegado por defecto. Búsqueda, filtro de canal y CSV se conservan
  dentro del plegable.
- **Oskitar** (`ChatbotAnalyticsPanel.jsx` → `OskitarView`): board Top 5 desde `m.topUsers`
  (`{ phone, label, count }`), encima de la tabla "Personas" (que se mantiene).
- **Betty** (`BettyView`): board Top 5 desde `m.topCustomers` (`{ phone, label, count }`),
  encima de la tabla "Clientes".
- Cada fila del board abre el `ContactDrawer` (spec 0005) igual que las tablas.

## 4. No-objetivos

- **No** se cambia la fuente tipográfica (familia): sigue el stack de sistema
  (`font-sans` de Tailwind). Solo tamaño/peso/uso de los encabezados de módulo.
- **No** se tocan los `font-black` de valores KPI, números de tabla, icon-badges ni
  micro-etiquetas de columna — solo el **encabezado de módulo** (título + subtítulo).
- **No** se añade una dependencia de fuente web (Inter, etc.) ni build de fuentes.
- **No** se elimina la tabla completa del Ranking ni sus funciones (búsqueda/filtro/CSV):
  se pliega, no se borra.
- **No** se cambia el cálculo de `getUserRanking` ni del modelo de `chatbot-analytics`.
- **No** se toca `Layout.jsx` salvo, si acaso, el `currentTitle` (que ya está alineado).

## 5. Criterios de aceptación

- [ ] `docs/design-system.md` §3 documenta el encabezado de módulo nuevo.
- [ ] Existe `PageHeader` y lo usan todas las páginas de módulo del shell (§3.1); el título
      es `text-2xl font-bold` y el subtítulo `text-sm` en frase, en claro y oscuro.
- [ ] Cada vista de bot (Comercial, Oskitar, Betty) muestra el avatar del bot en el
      encabezado y en el conmutador; si la imagen falla, cae al icono lucide.
- [ ] Los 3 bots muestran un board **Top 5** premium; cada fila abre el `ContactDrawer`.
- [ ] En Bot Comercial la tabla completa (con búsqueda, filtro de canal y CSV) sigue
      disponible detrás de un toggle "Ver tabla completa", plegada por defecto.
- [ ] `npm run lint` (sin errores nuevos) + `npm run build` verdes; verificado en Docker
      local `http://127.0.0.1:3003/`, tema claro y oscuro.

## 6. Restricciones de arquitectura y diseño

- `CRM_Frontend/docs/design-system.md` obligatorio; este cambio **actualiza** su §3.
- Tokens de tema para todo el chasis; imágenes con `object-cover` y `ring` de token.
- Sin dependencias nuevas de runtime. Si se optimizan las imágenes, con herramienta de dev
  puntual, no como dependencia del proyecto.

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| Barrido de encabezados en ~13 archivos rompe algún layout puntual | Medio | `PageHeader` reproduce el patrón existente (flex title/subtitle + actions); revisión visual página por página; el cambio es solo de clases del `<h1>/<h2>` |
| PNG sin optimizar engordan el bundle (~1.4 MB los 3) | Bajo | Cargan solo en `/bots/*`; se optimizan a ~256 px si hay `sharp`/`cwebp`; si no, se acepta para herramienta interna |
| Imagen de bot no disponible (ruta rota tras build) | Bajo | `BotAvatar` con `onError` → icono lucide de siempre |
| Perder de vista la tabla completa del Ranking al plegarla | Bajo | Toggle visible "Ver tabla completa (N)"; el Top 5 cubre el 90% del uso gerencial |

## 8. Impacto en producción

- **Usuario:** encabezados más legibles y homogéneos; cada bot con su cara; ranking más
  directo (Top 5) sin perder la tabla completa.
- **Despliegue:** solo rebuild de `crm-frontend`. Sin cambios de servicio, API ni Supabase.
- **Rollback:** `git revert` del merge + rebuild. Sin migraciones.
