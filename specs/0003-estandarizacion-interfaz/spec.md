# SPEC 0003 — Estandarización de la interfaz de los módulos del CRM_Frontend

- **Estado:** Aprobada (spec paraguas)
- **Autor:** equipo Skylab (@jbeltran)
- **Fecha:** 2026-09-07
- **Módulos afectados:** CRM_Frontend (todos los módulos con ruta activa + shell + componentes compartidos)
- **Rama:** `feat/0003-estandarizacion-interfaz` (paraguas) + una rama por lote de módulos
- **PR:** _pendiente_

## 1. Problema / oportunidad

En las últimas integraciones (parches de CCTV, Ciberseguridad y Soporte fusionados al repo,
más desarrollo previo a la adopción del sistema de diseño) la interfaz **ha perdido unidad
visual**: cada módulo usa sus propias superficies, colores y tipografías. El síntoma concreto
es el uso de colores crudos que solo se ven bien en un tema y "rompen" en el otro.

**Evidencia — auditoría 2026-09-07** (`grep` sobre `CRM_Frontend/src`):

| Patrón prohibido (chasis) | Ocurrencias |
|---|---|
| `bg-white/5` | 45 |
| `border-white/5` | 32 |
| `border-white/10` | 19 |
| `bg-white/10` | 13 |
| `border-white/20` | 5 |
| **Total `*-white/N`** | **114** |
| Superficies crudas `bg-black/N`, `bg-slate-*`, `bg-zinc-*` | ~120 más |
| Hex crudo en `className` (chasis) | CommandCenter 49, CctvModule 13, SupportDashboard 7, … |

Reparto de `*-white/N` por archivo (los de más peso):

| Archivo | Ruta | Ocurrencias |
|---|---|---|
| `pages/AsambleaDashboard.jsx` | `/asamblea` | 30 |
| `pages/LoginPage.jsx` | `/login` | 13 |
| `layout/Layout.jsx` | shell (todas) | 10 |
| `pages/SupportDashboard.jsx` | `/support` | 9 |
| `pages/UsersDashboard.jsx` | `/users` | 6 |
| `pages/Dashboard.jsx` | `/` | 6 (fuera de `RankingSection`, ya alineado en 0002) |
| `pages/Monitoring.jsx` | `/monitoring` | 5 |
| `pages/CommandCenter.jsx` | `/command-center` | 5 |
| `pages/ServicesTIDashboard.jsx` | `/monitoring/services-ti` | 3 |
| `pages/Contacts.jsx` | `/contacts` | 3 |
| `pages/Points.jsx` | `/points` | 2 |
| `components/support/SupportWidget.jsx` | compartido | 2 |
| `components/GerenciaDashboard.jsx` | compartido | 2 |
| `pages/CctvModule.jsx` | `/points/cctv` | 1 |

Referencia de a dónde hay que llegar: `CRM_Frontend/docs/design-system.md` y el
"pase de diseño" ya hecho en el Ranking (spec 0002), que sirve de ejemplo.

## 2. Objetivo

Todos los módulos con ruta activa, el shell (`Layout`) y los componentes compartidos usan
**solo tokens de tema para el chasis** (fondo, panel, borde, hover, texto base) y se ven
correctos en tema claro y oscuro. Cero `*-white/N`, `bg-black/N` y hex crudo para superficies
y bordes en páginas ruteadas.

## 3. Alcance

- **Sustituir colores crudos de chasis por tokens** según la tabla de mapeo de `plan.md`, en:
  shell (`Layout.jsx`), y páginas ruteadas: `/` (resto de `Dashboard.jsx`), `/asamblea`,
  `/login`, `/support`, `/users`, `/monitoring`, `/monitoring/services-ti`,
  `/monitoring/dashboard`, `/command-center`, `/contacts`, `/contacts/:id`, `/points`,
  `/points/cctv`, `/points/cybersecurity`, `/connections`, `/connections/:id/config`,
  `/test-wa`; y componentes compartidos (`GerenciaDashboard.jsx`, `SupportWidget.jsx`,
  `SystemHealthPanel.jsx`, `AlertsTab.jsx`, `MapView.jsx`).
- **Aplicar la superficie estándar de panel, radios, sombras y tipografía** de
  `design-system.md` §2–§3 donde el módulo se haya desviado.
- **Homogeneizar** control segmentado, cabeceras de tabla, paginación y tooltips de gráfica
  con los patrones §5–§7.
- **Resolver estados vacíos** que hayan quedado como panel en blanco (§8).
- Se ejecuta **por lotes** (una rama/PR por grupo de módulos afines), no en un solo PR gigante.
- Cada lote deja su módulo con `npm run lint` **sin errores nuevos** y, cuando sea barato,
  reduciendo los preexistentes de ese archivo.

## 4. No-objetivos

- **No** se cambia lógica, estado, llamadas a datos ni contratos. Es solo aspecto.
- **No** se rediseña ningún módulo ni se añaden funciones nuevas.
- **No** se tocan `nginx.conf`, puertos, `docker-compose.yml` base, stack ni config build-time.
- **No** es obligatorio dejar el lint global en 0 en esta spec (es consecuencia, no meta);
  pero al terminar los lotes se quita el `continue-on-error` del CI (`specs/0001`).
- **No** se sustituyen los colores de **identidad semántica** permitidos por `design-system.md`
  §1: estados (emerald/rose/amber), marcas de canal (`#25D366`, `#2AABEE`), podio oro/plata/bronce.
- **No** entra el arreglo del build de `comercial-bot` (ver [[comercial-bot-build-roto-bullseye]]).

## 5. Criterios de aceptación

Por cada lote de módulos:

- [ ] `grep -REn "bg-white/|border-white/|bg-black/[0-9]" src/<archivos del lote>` → **0
      resultados** en el chasis (se permiten los usos de identidad semántica del §1, documentados
      en el PR si los hubiera).
- [ ] Sin hex crudo (`#rrggbb`) en `className` para fondo/borde de los archivos del lote.
- [ ] Paneles con la superficie estándar (`bg-card/60 backdrop-blur-xl border border-border/80
      rounded-2xl shadow-sm`) o una variante válida del §2.
- [ ] Tipografía de títulos, micro-etiquetas y KPIs según §3.
- [ ] Verificado a mano en `http://127.0.0.1:3003/` en **tema claro y oscuro**, con captura
      antes/después en el PR.
- [ ] Sin scroll horizontal de página; estados vacíos resueltos.
- [ ] `cd CRM_Frontend && npm run lint` sin errores **nuevos** respecto a `main` (idealmente
      menos en los archivos del lote); `npm run build` verde.

Cierre de la spec paraguas:

- [ ] Todos los lotes fusionados.
- [ ] `grep` global de `*-white/N` en páginas ruteadas = 0.
- [ ] Se retira `continue-on-error` del paso de lint en `.github/workflows/crm-frontend.yml`.

## 6. Restricciones de arquitectura y diseño

- Fuente de verdad: `CRM_Frontend/docs/design-system.md`. Si algo del sistema de diseño resulta
  ambiguo o insuficiente, se actualiza esa guía en el mismo PR (no se improvisa por módulo).
- Cambios puramente de presentación: diffs revisables, sin tocar imports de datos ni hooks.
- Tokens definidos en `src/index.css` (`:root` / `.dark`). Si falta un token para un caso real,
  se añade ahí con ADR breve; no se parchea con color crudo.

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| Una sustitución cambia el aspecto más de lo esperado (contraste, jerarquía) | Medio | Captura antes/después por módulo; revisión visual en claro y oscuro obligatoria |
| Regresión difícil de ver en módulos poco usados (`/test-wa`, `/connections`) | Bajo | Lote pequeño y checklist idéntico; smoke manual de cada ruta del lote |
| Tocar componentes compartidos (`Layout`, `GerenciaDashboard`) afecta a varias pantallas | Medio | Ese lote va primero y solo; smoke de todas las rutas que los montan |
| Mezclar arreglo de lint con cambio visual enturbia el diff | Bajo | El lint se arregla solo si es trivial y en commit aparte dentro del mismo PR |

## 8. Impacto en producción

- **Usuario final:** la interfaz se ve consistente entre módulos y deja de "romperse" al
  cambiar de tema. Sin cambios de comportamiento.
- **Despliegue:** rebuild estándar del contenedor `crm-frontend` por cada lote que se promueva.
- **Rollback:** cada lote es un PR de solo presentación → `git revert` + rebuild. Sin estado
  ni datos que revertir.

## 9. Orden de lotes propuesto

1. **Lote A — Shell y compartidos:** `Layout.jsx`, `GerenciaDashboard.jsx`, `SupportWidget.jsx`,
   `SystemHealthPanel.jsx`. (Base de todo; hacerlo primero.)
2. **Lote B — Analítica y Monitoreo:** resto de `Dashboard.jsx`, `Monitoring.jsx`,
   `MonitoringDashboard.jsx`, `ServicesTIDashboard.jsx`, `CommandCenter.jsx`, `AlertsTab.jsx`.
3. **Lote C — Puntos / CCTV / Ciberseguridad:** `Points.jsx`, `CctvModule.jsx`,
   `CybersecurityDashboard.jsx`. (Coordinar con el WIP de `stash@{0}` de Ciberseguridad.)
4. **Lote D — Contactos y Conexiones:** `Contacts.jsx`, `ContactDetail.jsx`, `Connections.jsx`,
   `BotConfig.jsx`, `PruebaWhatsApp`.
5. **Lote E — Asamblea, Soporte y Login:** `AsambleaDashboard.jsx` (30 usos, el más pesado),
   `SupportDashboard.jsx`, `LoginPage.jsx`.

Cada lote = 1 spec ligera hija (`specs/0003-…/lote-X.md` o `specs/000N-…`), 1 rama, 1 PR.
