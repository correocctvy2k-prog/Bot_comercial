# TASKS 0003 — Estandarización de la interfaz

Referencia: `spec.md` y `plan.md` en esta misma carpeta.
Spec paraguas: cada lote tiene su propia rama y PR. Marcar aquí el avance global.

## Preparación

- [x] Auditoría de patrones prohibidos sobre `CRM_Frontend/src` (2026-09-07).
- [x] Spec paraguas (`spec.md`, `plan.md`, `tasks.md`) + tabla de mapeo crudo→token.
- [ ] Confirmar con quien pidió el cambio el orden de lotes (A→E) y el criterio de
      "identidad semántica" que se conserva.

## Lote A — Shell y compartidos  ·  rama `feat/0003a-shell-compartidos`

- [x] `layout/Layout.jsx` — 10 `*-white/N` + `bg-black/10` + `border-white/[.06]` → tokens
      (`hover:bg-muted/50`, `bg-muted/30`, `border-border/80`, chip de usuario `bg-muted/50
      border-border hover:border-primary/30`). Queda un `shadow-[inset…rgba(255,255,255,.1)]`
      decorativo en el item activo (no es superficie/borde) — se deja.
- [x] `components/GerenciaDashboard.jsx` — `KpiCard`: `bg-[#0f111a]/80` → `bg-card/60
      backdrop-blur-xl border-border/80`, `text-white` → `text-foreground`, `text-slate-500`
      → `text-muted-foreground`. Colores de series Recharts (`#10b981`, `#8b5cf6`, `#38bdf8`)
      se dejan (identidad de gráfica, §7).
- [x] `components/SystemHealthPanel.jsx` — pase completo `zinc-*` → tokens (`text/border/bg
      -muted*`, `divide-border/60`), `bg-red-950/10` → `bg-rose-500/10`. Se dejan los glows
      semánticos `shadow-[…#hex]` de los puntos de estado (emerald/yellow/red) y `text-red-*`.
- [x] `components/support/SupportWidget.jsx` — **sin cambios**: sus `bg-white/15`,
      `border-white/20`, `text-white/80` están sobre el degradado fijo del header/FAB
      (blanco sobre gradiente = permitido por §1, no rompe con el tema).
- [x] Build verde. Lint: 5 errores **preexistentes** en estos archivos (`motion` sin usar,
      `Date.now` en render, `react-refresh`, `error` sin usar), ninguno introducido por el pase.
- [x] Smoke Playwright en claro y oscuro: shell (`/`), `/command-center` (SystemHealthPanel),
      `/points` → pestaña Analítica (GerenciaDashboard). Sin regresiones en oscuro; las
      `KpiCard` de GerenciaDashboard ahora se ven bien en claro (antes negras sobre blanco).
      `/command-center` sigue siendo dark-only por diseño (se aborda en Lote B).
- [ ] PR lote A

## Lote B — Analítica y Monitoreo

- [ ] `pages/Dashboard.jsx` (las 6 ocurrencias fuera de `RankingSection`)
- [ ] `pages/Monitoring.jsx` — 5
- [ ] `pages/MonitoringDashboard.jsx`
- [ ] `pages/ServicesTIDashboard.jsx` — 3
- [ ] `pages/CommandCenter.jsx` — 5 + 49 hex crudos
- [ ] `components/AlertsTab.jsx`
- [ ] Smoke `/`, `/monitoring`, `/monitoring/services-ti`, `/monitoring/dashboard`, `/command-center`
- [ ] PR lote B

## Lote C — Puntos / CCTV / Ciberseguridad

- [ ] `pages/Points.jsx` — 2
- [ ] `pages/CctvModule.jsx` — 1 + 13 hex crudos
- [ ] `pages/CybersecurityDashboard.jsx` — coordinar con `git stash@{0}` (WIP historial de segmentos)
- [ ] Smoke `/points`, `/points/cctv`, `/points/cybersecurity`
- [ ] PR lote C

## Lote D — Contactos y Conexiones

- [ ] `pages/Contacts.jsx` — 3
- [ ] `pages/ContactDetail.jsx`
- [ ] `pages/Connections.jsx`, `pages/BotConfig.jsx`, `pages/PruebaWhatsApp*`
- [ ] Smoke `/contacts`, `/contacts/:id`, `/connections`, `/connections/:id/config`, `/test-wa`
- [ ] PR lote D

## Lote E — Asamblea / Soporte / Login

- [ ] `pages/AsambleaDashboard.jsx` — 30 (el más pesado)
- [ ] `pages/SupportDashboard.jsx` — 9 + 7 hex crudos
- [ ] `pages/LoginPage.jsx` — 13
- [ ] Smoke `/asamblea`, `/support`, `/login`
- [ ] PR lote E

## Cierre de la spec paraguas

- [ ] `grep` global de `*-white/N` en páginas ruteadas = 0.
- [ ] `CHANGELOG.md` con el resumen de la estandarización.
- [ ] Fichas de módulo actualizadas donde aplique.
- [ ] Quitar `continue-on-error` del paso de lint en `.github/workflows/crm-frontend.yml`
      y verificar CI verde.
- [ ] Lección aprendida sobre la deriva visual y cómo se evita (revisión de diseño en cada PR).
