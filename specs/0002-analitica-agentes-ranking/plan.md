# PLAN 0002 — Analítica de Agentes: Ranking (rango real, paginación, filtro, orden, CSV)

Referencia: `spec.md` en esta misma carpeta.

## Enfoque técnico

Cambio **solo cliente**, en dos archivos ya existentes. No se introducen dependencias,
endpoints ni cambios de esquema.

1. **`crmService.getUserRanking(range)`** — reemplazar el cálculo de `startDate`:
   - antes: `formatISO(startOfDay(subDays(now, Math.max(days, 30))))` (siempre ≥ 30 días).
   - después: ramificar por `range`:
     - `'24h'` → `formatISO(new Date(now.getTime() - 24*60*60*1000))`.
     - resto → `days = 7 | 30 | 365`; `formatISO(startOfDay(subDays(now, days - 1)))`.
   - mismo criterio que `getDashboardStats`, para que los totales sean coherentes entre widgets.

2. **`RankingSection` (`Dashboard.jsx`)** — estado local nuevo y derivaciones puras:
   - `page`, `channelFilter` (`all|whatsapp|telegram`), `sort` (`{key: 'rank'|'totalCount', dir}`).
   - Cadena de transformación: `ranking → filtered (canal + búsqueda) → sorted → paginated`.
   - `RANKING_PAGE_SIZE = 15`. `totalPages`, `currentPage` (clamp), `paginated = slice`.
   - `exportCSV()` construye el CSV desde `sorted` (no `paginated`), con `Blob` + enlace temporal.
   - Todos los mutadores de filtro/búsqueda/orden hacen `setPage(1)`.
   - Sustituir clases: `bg-card/50 backdrop-blur-md` → `bg-card/60 backdrop-blur-xl`;
     `bg-white/5` / `border-white/10` → `bg-muted/40|50` / `border-border`; `text-base` de título
     → `text-lg`. Añadir glow decorativo (`blur-2xl`, `pointer-events-none`) en TOP 2 / TOP 3.
   - Iconos nuevos de `lucide-react`: `ChevronLeft`, `ChevronRight`, `Download`.

Alternativa descartada: **paginación server-side** en Supabase. Rechazada porque el volumen
actual (decenas de usuarios) cabe de sobra en cliente, y el ranking ya se calcula agregando
todos los `logs` del rango en memoria; paginar en servidor obligaría a rehacer la agregación.

## Archivos a tocar

| Archivo | Cambio | Riesgo |
|---------|--------|--------|
| `CRM_Frontend/src/services/crm.service.js` | `getUserRanking`: `startDate` según rango real | bajo |
| `CRM_Frontend/src/pages/Dashboard.jsx` | `RankingSection`: paginación, filtro canal, orden, export CSV, pase de diseño; imports de iconos | medio |

Fuera de esta rama: `CRM_Frontend/src/pages/CybersecurityDashboard.jsx` (vuelve al stash).

## Contratos de datos / API

- Tabla `interactions_log` (Supabase): sin cambios. Se sigue leyendo
  `provider_id, created_at, content, channel_id`, `direction = 'INCOMING'`.
- `getUserRanking` ya devuelve por usuario: `rank`, `user`, `phone`, `channel`
  (`'telegram'|'whatsapp'`), `totalCount`, `topDay`, `dayBreakdown`, `scannedZones`, `lastSeen`.
  El filtro de canal y el CSV consumen estos campos; no se añaden.
- Compatibilidad hacia atrás: total. La firma `getUserRanking(range = '7d')` no cambia.

## Diseño / UI

- Superficie de panel y tabla: `bg-card/60 backdrop-blur-xl border border-border/80 rounded-2xl
  shadow-sm` (design-system §5).
- Cabeceras de tabla y barras de filtro/paginación: `bg-muted/40`.
- Título del panel: `text-lg font-black tracking-tight`.
- Chips de canal: segmented control con `bg-primary text-primary-foreground` para el activo.
- Botón "Exportar CSV" y controles de paginación: `rounded-lg border border-border bg-card`,
  `disabled:opacity-40`.
- Sin `bg-white/5` ni `border-white/10`. Verificar tema claro y oscuro.

## Plan de rollout

1. Recuperar WIP del stash en `feat/0002-analitica-agentes-ranking`; re-stashear
   `CybersecurityDashboard.jsx`.
2. `cd CRM_Frontend && npm run lint && npm run build`.
3. `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build crm-frontend`
   y smoke test en `http://127.0.0.1:3003/` (checklist de `despliegue-local.md`).
4. `CHANGELOG.md` (ya tiene el bloque; quitar la nota de "pendiente spec"), ficha de módulo.
5. Commit con rutas explícitas, PR enlazando esta spec, CI verde.
6. Merge a `main` y deploy a `192.168.8.65`; verificar allí.

## Plan de rollback

Cambio solo cliente: `git revert` del commit de la feature + rebuild del contenedor
`crm-frontend`. Sin migraciones ni estado persistente que deshacer.

## Verificación

| Criterio | Cómo se comprueba |
|----------|-------------------|
| Rango real | En `/`, cambiar el selector a `24h` y `7d`; el total de mensajes del Ranking debe cuadrar con el KPI de mensajes del mismo rango |
| Paginación | Con > 15 usuarios: 15 filas/página, Anterior/Siguiente e indicadores; con ≤ 15, sin controles |
| Filtro canal | `WhatsApp` / `Telegram` acotan filas y contador; vuelve a página 1 |
| Orden | Click en `# Pos.` y `Total Mensajes` alterna asc/desc; vuelve a página 1 |
| CSV | "Exportar CSV" descarga `ranking-agentes-<fecha>.csv`; abrir en Excel: acentos OK, columnas OK; botón deshabilitado sin filas |
| Búsqueda | Escribir en el buscador vuelve a página 1 |
| Diseño | `grep -n "bg-white/5\|border-white/10" src/pages/Dashboard.jsx` sin resultados en `RankingSection`; revisar tema claro/oscuro |
| Lint/build | `npm run lint` + `npm run build` verdes |
