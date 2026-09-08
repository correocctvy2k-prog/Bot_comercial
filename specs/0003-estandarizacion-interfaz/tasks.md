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

> **Reclasificado tras auditar a fondo.** Lo que parecía un cambio mecánico no lo es:
> `Monitoring.jsx` (79 líneas con color fijo), `ServicesTIDashboard.jsx` (33) y sobre todo
> `CommandCenter.jsx` (123) tienen **componentes a medida en oscuro** (toast de alerta tipo
> terminal, visualización de radar, consola de mando) y **decenas de `#hex` de Recharts**.
> Forzarles tokens es rediseño, no sustitución → se parte en sub-lotes.

### B1 — Cambios mecánicos seguros ·  rama `feat/0003b-analitica-monitoreo`

- [x] `pages/Dashboard.jsx` — control segmentado Bot Comercial/Soporte: `hover:bg-white/5`
      → `hover:bg-muted/50` (2). El resto de "colores" del archivo son marca de canal
      (`#25D366` / `#2AABEE`) y series Recharts → se conservan (§1, §7).
- [x] `pages/MonitoringDashboard.jsx` — `StatusDot` y `MiniStat`: `bg-slate-600` →
      `bg-muted-foreground/40`, `text-slate-400` → `text-muted-foreground` (estado desconocido).
- [x] Build verde, lint 0 en los archivos tocados. Smoke `/` en claro y oscuro sin regresión.
- [ ] PR B1

### B2 — Recharts / theming de gráficas (pendiente, su propia rama)

- [ ] `Monitoring.jsx`, `ServicesTIDashboard.jsx`, `GerenciaDashboard.jsx`: `CartesianGrid
      stroke`, ejes, `Tooltip contentStyle/labelStyle/itemStyle` a superficie estándar (§7).
      ~90 `#hex` entre los tres. Requiere criterio de paleta de series (¿tokens? ¿fija?).

### B3 — Componentes a medida en oscuro (pendiente, decisión de diseño)

- [ ] Toast de notificación (duplicado en `Monitoring.jsx` y `ServicesTIDashboard.jsx`):
      `bg-[#07101d]/95 bg-slate-950/70 text-slate-50/300/400` → ¿card estándar o se mantiene
      el estilo "alerta terminal"? Unificar el duplicado en un componente compartido.
- [ ] `Monitoring.jsx` visualización de radar/globo (líneas ~1235-1302): `border-white/10`,
      gradientes `rgba(...)`. Es un widget decorativo; decidir si se toca.
- [ ] `pages/CommandCenter.jsx` — **NO es un cambio de tokens.** Es una consola dark-only con
      lenguaje de color propio (81 `text-zinc-*`, 81 `#hex`). Decisión: (a) se documenta como
      excepción intencional dark-only, o (b) se rediseña con su propia spec. `Layout.jsx` ya
      la excluye del header por `pathname === '/command-center'`.

### B — resto

- [ ] `components/AlertsTab.jsx` — sin color fijo; solo tiene 4 errores de lint preexistentes.
- [ ] Smoke `/monitoring`, `/monitoring/services-ti` requieren `comercial-bot` (3001) y
      Servicios TI (3004) arriba — hoy caídos (ver [[comercial-bot-build-roto-bullseye]]).

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
