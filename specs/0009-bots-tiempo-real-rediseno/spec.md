# SPEC 0009 — Bots Gane Palmira: tiempo real y rediseño premium

- **Estado:** Validada
- **Autor:** equipo Skylab (@jbeltran)
- **Fecha:** 2026-09-09
- **Módulos afectados:** CRM_Frontend / Bots Gane Palmira (`Dashboard.jsx`,
  `ChatbotAnalyticsPanel.jsx`, `botKit.jsx`, `TopUsersBoard.jsx`, `PageHeader.jsx`);
  servicio `chatbot-analytics` (`lib/analyticsBetty.js`, sólo para #7).
- **Rama:** `feat/0009-bots-tiempo-real-rediseno`
- **PR:** _pendiente_

## 1. Problema / oportunidad

Tras 0005-0006 el módulo funciona y es consistente, pero el usuario señaló 7 mejoras de
percepción y lectura (numeradas 2-8 de su lista; la #1 va aparte en `specs/0008-*`).

## 2. Objetivo

Que el módulo (a) **muestre la actividad de los bots en vivo** con feedback visual sutil,
(b) sus tarjetas, rankings y tablas se lean más fácil y se vean premium, y (c) Betty tenga
la misma profundidad de vista que Oskitar.

## 3. Alcance — por tandas

### Tanda A — Rediseño visual base (sin datos nuevos)
- **(6) Quitar "Monitor de Actividad" de Bot Comercial.** Eliminar el bloque del live-feed de
  `Dashboard.jsx` (`feed` query, `FeedItem`, su `invalidateQueries(['feed'])`). Bot Comercial
  queda con la misma estructura que Oskitar/Betty (KPIs → gráficas → ranking).
- **(3) Tarjetas de datos premium.** Refactor de `Panel` y `MiniBars` (en
  `ChatbotAnalyticsPanel.jsx`) — extraer a `src/components/` como piezas compartidas:
  - `Panel`: cabecera con la tipografía del design-system §3 (título `text-sm font-black`,
    subtítulo `text-[11px] text-muted-foreground`), icon-badge coherente, más aire interno.
  - `MiniBars`: barra con valor y porcentaje alineados, degradado por serie, altura y
    separación mayores, orden estable; fila destacable (top-1) con acento.
  - Aplica a: Embudo de atención, Categorías de consulta, Motivos de escalamiento, Contenido
    más enviado (Oskitar); Flujos, Intenciones, Recorrido, Tipos de mensaje (Betty).
- **(4) Ranking Top 5 más compacto.** `TopUsersBoard` variante densa: fila ~44 px, medalla
  como índice de color pequeño (sin icono-badge grande), avatar de iniciales opcional
  (`compact` prop), valor a la derecha en `font-black`. Altura total de 5 filas ≈ 260 px
  (hoy ≈ 380). La tabla completa plegable de Bot Comercial no cambia.

### Tanda B — Tablas Personas / Clientes / Ranking legibles (#5)
- Componente compartido `src/components/EntityTable.jsx` (o refuerzo in-situ) para las tablas
  de Personas (Oskitar), Clientes (Betty) y la tabla completa del Ranking (Bot Comercial):
  - **Estado con icono + color**: `escaló` (rose, `AlertTriangle`), `resuelto`/`ok` (emerald,
    `CheckCircle2`), `no disponible` (amber, `MinusCircle`), `atendido` (slate).
  - **Categorías/flujos** como chips con color estable por categoría (paleta del design-system,
    no crudo), máx. 2 + "+N".
  - **Canal** con su icono de marca (WhatsApp/Telegram) donde aplique.
  - **Última actividad**: relativa visible + fecha absoluta en `title`.
  - **Acción explícita** "Ver ficha" (ya existe) + fila clicable a la ficha.
  - Micro-barra de actividad (sparkline simple con `byDay` del usuario si el modelo lo trae;
    si no, omitir sin romper).
  - Cabecera, hover y paginación según design-system §6.

### Tanda C — Tiempo real con feedback visual (#2)
- **Disparadores** (ya existen, se reaprovechan): SSE `update` de `chatbot-analytics`
  (`api.subscribe`) para Oskitar/Betty; Supabase realtime `interactions_log` INSERT para Bot
  Comercial. En ambos casos se hace `refetch`/`invalidate` como hoy.
- **Feedback nuevo** (con `framer-motion`, ya en `package.json`):
  - **KPIs**: al cambiar un valor respecto al render anterior (`usePrevious`), pulso sutil de
    fondo/borde (~600 ms) y count-up corto del número. No molesto, no bloquea.
  - **Tabla de Personas/Clientes**: ordenar por última interacción **descendente**; al llegar
    un `update`, diffear contra la lista previa, detectar filas cuya última interacción avanzó,
    **moverlas a la fila 1** con animación de layout (`motion.tr` + `layout`) y un flash de
    fondo sutil de toma de posición. Sin saltos bruscos, respeta `prefers-reduced-motion`.
  - **Gráficas**: transición suave de los valores (Recharts `isAnimationActive` + `animationDuration` moderado).
- Indicador "en vivo" discreto en la cabecera del bot (punto que late cuando entró un `update`
  reciente).

### Tanda D — Paridad de Betty (#7 y #8)
- **(7) "Actividad por día" de Betty con dos series.** `messages.log` no trae timestamp ni
  dirección → **no** se puede "mensajes del cliente por día". Se implementa la versión honesta
  más cercana desde `state-manager.log` (único con tiempo): dos series por día —
  **"Actividad de conversación"** (`action = setState`) vs **"Progreso del bot"**
  (`action = updateStep`). Requiere `lib/analyticsBetty.js`: además de `byDay.count`, exponer
  `byDay.conversation` y `byDay.progress` (o un `byDayKind`). Nota al pie mantiene "horas
  aproximadas". _(Alternativa si el usuario prefiere: dejar una sola serie + nota.)_
- **(8) Betty: sub-vista "Detalle · analítica".** Añadir el conmutador Resumen / Detalle a
  `BettyView` (igual patrón que `OskitarView`):
  - **Resumen** (queda como hoy, depurado): 4 KPIs, actividad por día (nueva, #7), por hora,
    flujos, intenciones.
  - **Detalle**: KPIs de recurrencia por flujo (`topByFlow`), embudo "Consultar resultados"
    (`resultadosFunnel`), pasos más transitados (`stepBreakdown`), desglose de "No disponible"
    (`notAvailable`: count, %, clientes afectados), actividad por día de la semana
    (`byWeekday`), tipos de mensaje (`messageTypes`). Todo ya viene en el modelo; sólo se
    reorganiza la vista.

## 4. No-objetivos

- **No** se cambia el cálculo analítico de Oskitar ni el de Bot Comercial. Betty sólo suma
  campos derivados a `byDay` (aditivo, sin tocar KPIs existentes).
- **No** se inventan datos: Betty no tendrá "mensajes salientes" reales porque el log no los
  tiene.
- **No** se añade una librería de animación nueva (se usa `framer-motion`, ya presente).
- **No** se toca el submenú, las rutas ni el `ContactDrawer` (0005) salvo integración de la
  fila animada.
- **No** se rediseña el Bot Comercial más allá de: quitar el monitor, aplicar tarjetas/ranking
  nuevos y el feedback en vivo del ranking.

## 5. Criterios de aceptación

- [ ] Bot Comercial ya no muestra "Monitor de Actividad"; las 3 vistas tienen la misma
      estructura (encabezado → resumen → KPIs → gráficas → ranking → tabla).
- [ ] `Panel` y `MiniBars` comparten componente, usan la tipografía del design-system y se ven
      en claro y oscuro sin colores crudos de chasis.
- [ ] El ranking Top 5 ocupa notablemente menos alto y sigue abriendo la ficha por fila.
- [ ] Las tablas de Personas/Clientes/Ranking muestran estado con icono+color, chips de
      categoría, canal e "última actividad" con absoluto en `title`.
- [ ] Al llegar una interacción nueva: los KPIs afectados dan un pulso sutil y la persona/
      cliente con actividad reciente sube a la fila 1 con animación de toma de posición;
      respeta `prefers-reduced-motion`.
- [ ] Betty tiene "Actividad por día" con dos series reales y sub-vista "Detalle · analítica".
- [ ] `npm run lint` (sin errores nuevos) + `npm run build` verdes; verificado en Docker local
      claro y oscuro; endpoint `/api/betty/analytics` devuelve los campos nuevos de `byDay`.

## 6. Restricciones de arquitectura y diseño

- `CRM_Frontend/docs/design-system.md` obligatorio (tipografía §3, tablas §6, tokens §1).
- `framer-motion` sólo para micro-interacciones; nada de animaciones que bloqueen o mareen;
  honrar `prefers-reduced-motion`.
- Cambio en `chatbot-analytics` estrictamente aditivo (`byDay.*`), sin romper el contrato
  actual del modelo → sin ADR. Rebuild del servicio en el deploy.
- Reutilizar (`Panel`, `MiniBars`, tabla) en vez de duplicar; extraer a `src/components/`.

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| El reordenamiento animado "salta" con listas largas o refetch frecuente | Medio | `layout` de framer + `key` estable por teléfono; animar sólo el top ~10; debounce del `update` |
| El pulso de KPIs resulta molesto | Bajo | Duración corta (~600 ms), sólo en cambio real, sin sonido; opción de desactivar vía `prefers-reduced-motion` |
| "Actividad de conversación / progreso" de Betty se malinterpreta | Medio | Etiquetas claras + nota al pie; si el usuario no lo valida, se deja una sola serie |
| Extraer `Panel`/tabla rompe algún uso puntual | Bajo | Un commit por pieza; revisión visual vista por vista |
| El modelo de Betty en prod tarda en traer `byDay.*` nuevos | Bajo | El front cae con elegancia si el campo falta (serie única) |

## 8. Impacto en producción

- **Usuario:** el módulo se ve más pulido, se lee mejor y "respira" en vivo; Betty gana
  profundidad.
- **Despliegue:** rebuild de `crm-frontend` y de `chatbot-analytics` (campos nuevos en el
  modelo de Betty).
- **Rollback:** `git revert` del merge + rebuild. Sin migraciones.
