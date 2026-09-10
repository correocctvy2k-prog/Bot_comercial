# Changelog

Registro de cambios del ecosistema Skylab. Formato basado en
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

Cada PR actualiza la sección **No publicado**, bajo la subsección del módulo que toca
(`CRM_Frontend`, `chatbot-soporte`, `Bot Comercial`, `Ciberseguridad`, `CCTV`,
`Monitoreo IT`, `Asamblea`, `Infra/Docs`). Al desplegar a producción se mueve el bloque
a una versión fechada.

## [No publicado]

### CCTV — "Eventos diarios" como consola operativa (zona, conciliación, resolución)
`specs/0011-eventos-diarios-operacion/`
- **Tarjeta de evidencia ampliada:** muestra el detalle del correo Dahua — **Evento de alarma**
  (`payload.rawEventType`), **Canal de entrada** (`channelRaw`), **Alarma** (`alarm`), fase
  interpretada + retraso, asunto, remitente, IP. Filas vacías se omiten.
- **Legibilidad:** sube un escalón la tipografía y los iconos de las tarjetas de la vista.
- **Conciliar identidades desde la vista:** el panel "Identidades por conciliar" trae un
  buscador de punto canónico + Vincular (`POST /api/cctv/events/identity/link`); al vincular
  refresca la vista y el cuadro se oculta al llegar a 0. Limpieza puntual de los 8 pendientes
  con `scripts/reconcile-eventos-diarios-pendientes-20260910.mjs`.
- **Fuera "Movimiento consolidado":** panel eliminado; `dailyEventsData` deja de devolver el
  array `motionBursts` (se conservan `summary.motionBursts`/`noisyBursts` y la serie
  `hourly[].motion` del gráfico).
- **Resolver inconsistencias de notificación CCTV:** tabla nueva `cctv_notification_resolutions`
  (`platform/schema.sql`, idempotente) + `platform/notification-resolutions.js`. Tres opciones
  por punto: **Solo ping** (`PING_ONLY`, persistente → fuerza `coverage=PING_ONLY`), **Cámara
  sin notificar** (`MISCONFIGURED_NO_NOTIFY`, persistente → sub-lista "En seguimiento"),
  **Falso positivo hoy** (`FALSE_POSITIVE`, solo esa fecha). Rutas
  `POST /api/cctv/notifications/:locationId/resolve` y `.../reopen` (`x-actor`, `audit_log`).
  Respuesta gana `notificationsInFollowUp[]` y `summary.{notificationsInFollowUp,notificationsResolved}`.
- **Tableros por zona:** `dailyEventsData` gana `zoneBoards[]` (`platform/zone-boards.js`, sobre
  los `operationalDays` de spec 0010, sin consultas nuevas). Una tarjeta por zona con cubos de
  5 estados — 🟢 a tiempo · 🟡 abrió tarde · 🔵 cerró · ⚪ sin actividad · 🔴 anomalía —
  (prioridad `ANOMALY > LATE > CLOSED > ON_TIME > IDLE`); "Sin zona" es un tablero propio.
  Click en un cubo resalta el punto en "Señales CCTV de jornada".
- `cctv-automation-final`: `npm test` **76/76** (sin CI). Migración de esquema: la tabla se
  crea en el arranque; hacer backup del `.db` antes del deploy a `.65`.

### CCTV — "Eventos diarios" interpreta la jornada por ventanas operativas + ping
`specs/0010-eventos-diarios-interpretacion/`
- **Problema:** el `event_type` salía solo del nombre de la alarma, sin lógica horaria →
  detecciones matinales como "DESCONOCIDO" siendo la apertura, y "cierres" a las 7 am.
- **Interpretación (`platform/operational-event-policy.js`, `window-config.js`):** por punto y
  día se resuelve la fase de la jornada con el **ping SIIS como vector primario** (transición
  offline↔online), luego evidencia CCTV, luego presencia de ping. Ventanas configurables por env
  (`CCTV_WIN_*`); el **cierre a mediodía viene desactivado** (se solapaba con la mañana y
  marcaba un cierre falso a cientos de puntos que solo seguían online). `interpretPointDay`
  devuelve `phases`, `eventPhases` (clasifica **cada** detección, no una representativa),
  `anomalies`, `notificationConfigInconsistency` (solo `WITH_CCTV` = envió correo Dahua en 30 d)
  e `interpretation`.
- **`GET /api/cctv/events/daily`:** `hourly.openings/closures`, la lista `pointOperations` y sus
  KPIs se calculan por fase interpretada, no por `event_type` crudo. El gráfico por hora solo
  cuenta fases con evidencia real (transición de ping o correo CCTV); la *presencia* de ping no
  es un cierre. Nuevos campos: `operationalWindows`, `notificationInconsistencies[]`,
  `summary.{notificationInconsistencies,outOfWindowDetections,cierreSinApertura,pointsWithOpening}`.
- **`CRM_Frontend/src/pages/CctvModule.jsx`:** badge por fase operativa en el grid de evidencias
  (todas las detecciones de una apertura muestran "Apertura mañana", ya no "DESCONOCIDO"; máx.
  3 tiles por punto), "· tarde Nm", panel "Inconsistencias de notificación CCTV", estado "Sin
  señal en ventana" para puntos cuyas alarmas cayeron fuera de toda ventana.
- Nuevas vars: `CCTV_WIN_OPEN_AM`, `CCTV_WIN_OPEN_PM`, `CCTV_WIN_CLOSE_PM`,
  `CCTV_WIN_CLOSE_MIDDAY` (vacía = desactivada), `CCTV_WIN_GRACE_MIN`,
  `CCTV_PING_EVENT_TOLERANCE_MIN`. `cctv-automation-final`: `npm test` 64/64 (sin CI).
- **Deuda conocida:** `GET /api/cctv/events/daily` tarda ~6 s (previo a 0010; 0010 suma ~0,6 s).

### CCTV / Mantenimiento — "Ejecución del programa" en vivo desde la API de Trello
`specs/0008-cctv-mantenimiento-refresco/`
- **Bug:** la vista "Ejecución del programa" mostraba datos de hace días mientras el dashboard
  de soporte sí se actualizaba. Causa: `import-trello-support.js` llama a la API de Trello, pero
  `import-trello-maintenance.js` leía `skylab-tareas.db` (caché del backend de "Table Trello",
  que no corre en el `.65` y no se puede calentar desde el contenedor `cctv-operational-worker`).
- **Fix:** `platform/import-trello-maintenance.js` reescrito para leer la lista
  `MANTENIMIENTO CCTV 2026` **directo de la API de Trello** (board `TRELLO_MAINTENANCE_BOARD_ID`,
  por defecto el board "Mantenimientos"), con el mismo patrón que soporte. Se elimina
  `scripts/refresh-trello-maintenance-cache.js` y su paso en `run-operational-cycle.js`.
  Esquema de BD y contrato de `GET /api/cctv/maintenance` sin cambios; frontend sin cambios.
  Nuevas vars: `TRELLO_MAINTENANCE_BOARD_ID`, `TRELLO_MAINTENANCE_LIST_NAME` (opcional).

## [2026-09-09] — spec 0009 a producción

Merge del PR #2 (`main` = `f3bad12`) y rebuild de `crm-frontend` en `192.168.8.65`.

### CRM_Frontend — Bots Gane Palmira: tiempo real y rediseño premium
`specs/0009-bots-tiempo-real-rediseno/`
- **Rediseño visual base (Tanda A):** se quita el "Monitor de Actividad" de Bot Comercial
  (las 3 vistas quedan con la misma estructura). `src/components/Panel.jsx` y `MiniBars.jsx`
  extraídos y rediseñados (índice de posición, valor/porcentaje alineados, top-1 con acento,
  tipografía del design-system). `TopUsersBoard` gana modo `compact` (fila ~44 px) → los 3
  rankings ocupan bastante menos.
- **Tablas Personas/Clientes más legibles (Tanda B):** `src/components/entityBits.jsx` —
  `StatusPill` (icono + color por estado), `CategoryChips` (color estable por nombre, +N),
  `LastActivity` (relativa + fecha absoluta en `title`). "No disponible" resaltado en ámbar.
- **Feedback en vivo (Tanda C):** al cambiar un KPI, pulso sutil del borde. Las tablas se
  ordenan por última actividad y, al llegar un `update` por SSE, la fila reciente sube a la
  primera posición y se resalta ~2 s. Punto "en vivo" en la cabecera. Todo se anula con
  `prefers-reduced-motion`. Nuevo `src/hooks/usePrevious.js`.
- **Paridad de Betty (Tanda D):** conmutador **Resumen / Detalle** (como Oskitar); el Detalle
  añade "pasos más transitados" y el desglose de "No disponible". La "Actividad por día" de
  Betty se deja en una serie honesta ("Eventos del bot"): el `messages.log` no trae fecha ni
  dirección, así que una serie "entrantes vs salientes" sería un dato fabricado.

## [2026-09-09] — specs 0002–0006 a producción (`192.168.8.65`)

Merge del PR #1 (`main` = `eeca883`, fast-forward de 26 commits) y despliegue: rebuild de
`crm-frontend` + **estreno de `chatbot-analytics`** (:3008) en prod. Contenido:

### CRM_Frontend — Polish: tipografía de encabezados, avatar de bot, ranking Top 5
`specs/0006-polish-tipografia-ranking/`

- **Estándar de encabezado de módulo.** `design-system.md` §3: el `<h1>` superior de cada
  página usa `text-2xl font-bold tracking-tight` + subtítulo `text-sm font-medium` en frase
  (antes `text-lg font-black` + micro-etiqueta en mayúsculas). Nuevo
  `src/components/PageHeader.jsx` (`{ icon, title, subtitle, actions }`), adoptado en las 3
  vistas de bots y en Contactos; normalizados en el sitio los `<h1>` de `UsersDashboard` y
  `MonitoringDashboard`. CCTV y Ciberseguridad conservan su encabezado premium-dark propio;
  `Monitoring`/`ServicesTI` inyectan su título en la barra superior del layout (sin cambio).
- **Avatar de bot.** `chatbot-analytics/image/{Comercial,Oskitar,Betty}.png` optimizados a
  256 px → `src/assets/bots/`. `botKit.jsx`: `BOT_AVATARS` + `<BotAvatar bot size>` (imagen
  circular con `ring` de token y `onError` → icono lucide). En el encabezado de cada vista de
  bot y en el conmutador de bots.
- **Ranking Top 5 premium.** Nuevo `src/components/TopUsersBoard.jsx` (board compacto Top 5,
  oro/plata/bronce 1-3; fila → `ContactDrawer`). En Bot Comercial va arriba y la tabla
  completa (podio Top 3 + búsqueda + filtro de canal + CSV) se pliega tras "Ver tabla
  completa". Oskitar (`topUsers`) y Betty (`topCustomers`) muestran el mismo board sobre su
  tabla de personas/clientes.

### CRM_Frontend — Módulo "Bots Gane Palmira" (ex Analítica de Agentes)
- **Detalle y consistencia del módulo** (`specs/0005-bots-gane-palmira/`, tandas 1-3):
  - Módulo renombrado a **"Bots Gane Palmira"**; cabecera compacta (sin título duplicado);
    conmutador de bot arriba.
  - **Submenú por bot** en el sidebar; rutas `/bots/comercial|oskitar|betty` (`/` redirige);
    el conmutador de pestañas sincroniza la URL.
  - `src/components/botKit.jsx`: `KpiCard`, `PeriodSelect` y `BotSummary` **compartidos** por
    las 3 vistas. Oskitar y Betty ahora usan el mismo `KpiCard` y el mismo selector de periodo
    (`Hoy 24h / 7 días / mes / año`) que Bot Comercial.
  - **Resumen en lenguaje natural** al inicio de cada vista (generado de los KPIs del periodo).
  - Quitado el KPI "Cobertura SIISS" de Bot Comercial.
- **Ficha de contacto + historial por bot** (`specs/0005-bots-gane-palmira/`, tanda 4):
  - Nuevo `src/components/ContactDrawer.jsx`: drawer lateral **solo lectura** con datos del
    contacto (teléfono, documento, primera/última interacción, nº de conversaciones), estado
    (`escalado` / `resuelto` / `no disponible` / `atendido`), categorías/flujos y la
    **transcripción de la conversación** tipo chat, con separadores de fecha y "cargar
    mensajes anteriores" (`useInfiniteQuery`, páginas de 200).
  - Se abre desde la fila de la tabla de **Personas** (Oskitar), **Clientes** (Betty) y del
    **Ranking** (Bot Comercial) — botón "Ficha".
  - `chatbotAnalytics.service.js`: `getContact(bot, id, {limit, offset})`.
  - `crm.service.js`: `getContactByProvider(providerId, {limit, offset})` — historial del Bot
    Comercial desde Supabase (`interactions_log` por `provider_id` + identidades hermanas),
    devuelto con la misma forma que el endpoint del servicio para reutilizar el drawer.

### CRM_Frontend — Analítica de Agentes · Integración Oskitar / Betty
- **Analítica de chatbots nativa** (`specs/0004-integracion-analitica-chatbots/`, `ADR-0002`):
  el conmutador del módulo pasa a 3 pestañas — **Bot Comercial · Oskitar · Betty**. Oskitar y
  Betty son nativas (Recharts + tokens, no iframe), consumen la API JSON + SSE del nuevo
  servicio `chatbot-analytics`. KPIs, series por día/hora, embudo (Oskitar), categorías,
  flujos (Betty), tablas de personas/clientes, filtro de rango y categoría, export CSV y
  refresco en vivo por SSE.
- Se **retira "Bot Soporte Técnico"** del módulo (embebía `chatbot-soporte`).
- Se **retira el módulo "Centro de Soporte"** (`/support` + nav): la analítica de soporte vive
  ahora en la pestaña Oskitar. Página conservada en el árbol, sin ruta.

### Infra / Docs
- **Servicio `chatbot-analytics`** (`specs/0004`, `ADR-0002`): panel gerencial Express
  (Oskitar + Betty) incorporado al repo; `Dockerfile` propio; servicio en `docker-compose*`
  (host 3008 → contenedor 3000), lee los logs de los bots por SSH; CORS abierto para el CRM.
  Nueva build-arg `VITE_CHATBOT_ANALYTICS_URL`. `.env` con credenciales SSH **no versionado**.
- **Servicio `chatbot-analytics` · endpoint de ficha de contacto** (`specs/0005`, tanda 4):
  nuevo `GET /api/<bot>/contact?id=<tel>&limit=&offset=` (`lib/contact.js`) — reconstruye
  datos + transcripción de un teléfono desde lo ya cargado en memoria (`state.events` /
  `state.betty`), **sin releer logs ni recalcular el modelo**. Respeta `MASK_PHONES` (resuelve
  el `id` enmascarado por `maskPhone(peer) === id`). Aditivo: no cambia el contrato de las
  rutas existentes → sin ADR. Betty: solo mensajes del cliente (el log no trae hora ni
  respuestas del bot) + recorrido de la máquina de estados.
- **Modelo de trabajo SDD y gobernanza** (`specs/0001-modelo-de-trabajo-sdd/`, `ADR-0001`):
  documento canónico `docs/WORKING_MODEL.md` + punteros por herramienta de IA
  (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`); estructura
  `specs/`; `docs/adr/` y `docs/lecciones-aprendidas/` a nivel raíz; `docker-compose.local.yml`
  (override, no toca el base) + `docs/operacion/despliegue-local.md`; CI
  `.github/workflows/crm-frontend.yml` (build bloqueante; lint informativo hasta que el
  frente de estandarización — `specs/0003` — lo lleve a 0); `.github/pull_request_template.md`;
  `CRM_Frontend/docs/design-system.md`. Sin impacto en producción.

### CRM_Frontend — Analítica de Agentes
- **Ranking de Usuarios & Zonas** (`specs/0002-analitica-agentes-ranking/`, spec retroactiva):
  - `getUserRanking` respeta el rango de tiempo real (`24h`/`7d`/`1m`/`1y`) en vez de forzar
    mínimo 30 días; mismo criterio que `getDashboardStats`.
  - Paginación de la tabla completa (15 por página) con controles e indicadores; se oculta
    con ≤ 15 usuarios.
  - Filtro por canal (Todos / WhatsApp / Telegram), orden por columnas (`# Pos.`,
    `Total Mensajes`) y exportación a CSV del ranking filtrado y ordenado (BOM UTF-8).
  - Buscador y todos los filtros resetean la paginación a la página 1.
  - Pase de diseño: superficies y tipografía alineadas con el ADN premium de la cabecera;
    tokens de tema en vez de `bg-white/5` / `border-white/10`.

---

## Historial previo

Antes de este changelog, el registro de cambios vivía en el historial de Git y en
`PROYECTO_CONTEXTO.md`. Ver `git log` para lo anterior a 2026-09-07.
