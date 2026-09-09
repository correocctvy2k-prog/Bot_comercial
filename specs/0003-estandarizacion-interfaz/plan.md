# PLAN 0003 — Estandarización de la interfaz (spec paraguas)

Referencia: `spec.md` en esta misma carpeta.

## Enfoque técnico

Trabajo **mecánico y por lotes**, guiado por `CRM_Frontend/docs/design-system.md`. Cada lote:

1. `grep` de patrones prohibidos en los archivos del lote → lista de líneas a tocar.
2. Sustituir según la **tabla de mapeo** (abajo), leyendo el contexto de cada línea (no
   buscar-y-reemplazar a ciegas: `bg-white/5` en una tarjeta ≠ en un divisor ≠ en un hover).
3. Ajustar superficie de panel, radios, sombras y tipografía si el módulo se desvió.
4. `npm run lint` + `npm run build`; smoke manual en claro y oscuro con captura antes/después.
5. PR de solo presentación enlazando esta spec.

Alternativa descartada: **codemod / regex global**. El mismo patrón crudo mapea a tokens
distintos según el rol (chasis vs hover vs divisor), así que un reemplazo automático
introduciría regresiones sutiles. Se hace archivo por archivo con revisión visual.

## Tabla de mapeo (crudo → token)

| Uso detectado | Crudo habitual | Token de reemplazo |
|---|---|---|
| Fondo de página | `bg-slate-950`, `bg-black`, `bg-[#0b1220]` | `bg-background` |
| Fondo de panel / tarjeta | `bg-white/5`, `bg-white/10`, `bg-slate-900`, `bg-zinc-800` | `bg-card/60 backdrop-blur-xl` (panel), `bg-card/40 backdrop-blur-sm` (secundario) |
| Fondo sutil / cabecera de tabla / barra de filtros | `bg-white/5`, `bg-black/20` | `bg-muted/40` |
| Hover de fila / de item | `hover:bg-white/5`, `hover:bg-black/10` | `hover:bg-muted/40` |
| Borde de panel / divisor | `border-white/10`, `border-white/5`, `border-slate-700` | `border-border/80` (panel), `divide-border/40` (filas) |
| Borde de control | `border-white/20` | `border-border` |
| Texto base | `text-slate-200`, `text-white` (como color base) | `text-foreground` |
| Texto secundario | `text-slate-400`, `text-white/60` | `text-muted-foreground` |
| Chip / badge de chasis | `bg-white/5 border-white/10` | `bg-muted/50 border border-border` |
| Superficie de tooltip de gráfica | `bg-slate-900 border-slate-700` | `bg-card border border-border rounded-lg` |
| `CartesianGrid` | `stroke="#333"` | `stroke="rgba(255,255,255,0.05)"` (según §7) |

**Se conservan** (identidad semántica, §1 de `design-system.md`): `text-emerald-*/rose-*/amber-*`
para estados; `#25D366` / `#2AABEE` para WhatsApp / Telegram; oro/plata/bronce del podio;
gradientes de icon-badge. Si un archivo los usa para el chasis (no para identidad), sí se cambian.

## Archivos a tocar (por lote)

| Lote | Archivos | `*-white/N` | lint err (hoy) |
|---|---|---|---|
| A — Shell y compartidos | `layout/Layout.jsx`, `components/GerenciaDashboard.jsx`, `components/support/SupportWidget.jsx`, `components/SystemHealthPanel.jsx` | 10 + 2 + 2 + 0 | 3 + 0 + 2 + 3 |
| B — Analítica y Monitoreo | `pages/Dashboard.jsx` (resto), `pages/Monitoring.jsx`, `pages/MonitoringDashboard.jsx`, `pages/ServicesTIDashboard.jsx`, `pages/CommandCenter.jsx`, `components/AlertsTab.jsx` | 6 + 5 + 0 + 3 + 5 + 0 | 0 + 8 + 0 + 7 + 6 + 4 |
| C — Puntos / CCTV / Ciber | `pages/Points.jsx`, `pages/CctvModule.jsx`, `pages/CybersecurityDashboard.jsx` | 2 + 1 + 0 | 0 + 7 + 3 |
| D — Contactos y Conexiones | `pages/Contacts.jsx`, `pages/ContactDetail.jsx`, `pages/Connections.jsx`, `pages/BotConfig.jsx`, `pages/PruebaWhatsApp*` | 3 + 0 + 0 + 0 | 0 + 2 + 1 + 2 |
| E — Asamblea / Soporte / Login | `pages/AsambleaDashboard.jsx`, `pages/SupportDashboard.jsx`, `pages/LoginPage.jsx` | 30 + 9 + 13 | 3 + 0 + 0 |

(Conteos de la auditoría 2026-09-07; revalidar al empezar cada lote.)

## Contratos de datos / API

Ninguno. Cambio exclusivamente de presentación. Prohibido tocar imports de servicios, hooks,
`useQuery`, `useEffect` o props de datos en este trabajo.

## Diseño / UI

- Todo sale de `design-system.md`. Si aparece un caso no cubierto (p. ej. un token que falta
  en `src/index.css`), se amplía la guía y/o los tokens en el mismo PR, con ADR breve si es
  decisión de arquitectura de tema.
- El Ranking (spec 0002, `RankingSection` en `Dashboard.jsx`) es la referencia de "cómo debe
  quedar": superficie estándar, control segmentado §5, tabla §6.

## Plan de rollout

Por lote: local dockerizado + smoke (claro y oscuro) → PR + CI (build bloqueante) → merge →
promoción a prod en la siguiente ventana. Los lotes son independientes entre sí salvo el A,
que va primero por tocar el shell.

## Plan de rollback

Cada lote es un PR de solo presentación: `git revert` del merge + rebuild del contenedor
`crm-frontend`. Sin migraciones ni estado.

## Verificación

- `grep -REn "bg-white/|border-white/|bg-black/[0-9]|#[0-9a-fA-F]{6}" src/<archivos del lote>`
  → solo identidad semántica documentada.
- Recorrido manual de cada ruta del lote en `http://127.0.0.1:3003/`, alternando tema
  claro/oscuro; captura antes/después adjunta al PR.
- `npm run lint` (sin errores nuevos) y `npm run build` (verde).
