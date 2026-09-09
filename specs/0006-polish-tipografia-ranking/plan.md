# PLAN 0006 — Polish: tipografía, avatar de bot, ranking Top 5

Referencia: `spec.md`.

## Enfoque técnico

Tres bloques independientes, sin backend ni Supabase. Todo en `CRM_Frontend/src` + un doc.

- **A. Tipografía.** El "tipo de letra de Contactos" es el mismo `font-sans` del sistema; lo
  que se lee mejor es `text-2xl font-bold` (no `font-black`) + subtítulo `text-sm` en frase.
  Se encapsula en `<PageHeader>` para no repetir clases y poder evolucionarlo en un sitio.
  Alternativa descartada: añadir Inter vía `@fontsource` — dependencia + build de fuentes,
  fuera de "latonería y pintura" y del no-objetivo de la spec.
- **B. Avatar.** Imágenes como assets del front (import → hash de Vite), no servidas por
  `chatbot-analytics` (evita acoplar un asset del CRM a que el servicio esté arriba y el CORS
  de imágenes). `BotAvatar` con `onError` → icono lucide.
- **C. Ranking.** Componente `TopUsersBoard` agnóstico de fuente: cada vista normaliza sus
  filas. En Bot Comercial la tabla actual se conserva íntegra dentro de un `<details>`.

## Archivos a tocar

| Archivo | Cambio | Riesgo |
|---------|--------|--------|
| `src/components/PageHeader.jsx` | nuevo | bajo |
| `src/components/botKit.jsx` | `BOT_AVATARS`, `BotAvatar` | bajo |
| `src/components/TopUsersBoard.jsx` | nuevo | bajo |
| `src/assets/bots/*.png` | nuevos (copiados de `chatbot-analytics/image/`) | bajo |
| `src/pages/*.jsx` (≈13) | encabezado → `PageHeader` | medio (visual) |
| `src/pages/Dashboard.jsx` | avatar en conmutador + `RankingSection` (Top 5 + `<details>`) | medio |
| `src/components/ChatbotAnalyticsPanel.jsx` | `PageHeader` + avatar + `TopUsersBoard` (Oskitar/Betty) | medio |
| `docs/design-system.md` | §3 fila nueva | bajo |
| `CHANGELOG.md`, ficha del módulo | DoD | bajo |

## Diseño / UI

- `PageHeader`: `flex flex-col sm:flex-row sm:items-center justify-between gap-4`; izquierda
  `flex items-center gap-3` (icon/avatar + `div` título/subtítulo), derecha `actions`.
- `TopUsersBoard`: lista/grid compacta de 5; 1-3 con acento `RANK_META`; fila = `<button>`
  (abre drawer). Superficie estándar del design-system.
- `BotAvatar`: `rounded-full object-cover ring-1 ring-border`; `size` en px (32 conmutador,
  40-44 encabezado).

## Plan de rollout / rollback

1. Local dockerizado (`crm-frontend`) + smoke claro/oscuro.
2. PR + CI (build).
3. Merge + deploy a prod. Rollback: `git revert` + rebuild.

## Verificación

- `npm run lint` sobre los archivos tocados (sin errores nuevos), `npm run build` verde.
- Recorrer cada módulo del shell: encabezado nuevo, sin layout roto.
- `/bots/comercial|oskitar|betty`: avatar visible; Top 5 con datos; fila → `ContactDrawer`;
  en Comercial, "Ver tabla completa" despliega la tabla con búsqueda/filtro/CSV.
- Forzar `onError` (renombrar un asset en dev) → cae al icono lucide.
