# CRM_Frontend — Módulo "Analítica de Agentes IA"

Ruta: `/` · Archivo: `src/pages/Dashboard.jsx` · Servicio: `src/services/crm.service.js`

## Propósito

Monitoreo y gestión de los bots de IA en producción. **Tres pestañas** conmutables
(`agentType`: `comercial` | `oskitar` | `betty`):

| Pestaña | Contenido | Fuente de datos |
|---------|-----------|-----------------|
| **Bot Comercial** | KPIs, gráfica de actividad, donut de distribución por canal, Ranking de Usuarios & Zonas Escaneadas, monitor de actividad en tiempo real | Supabase (`interactions_log`, `contact_identities`, `contacts`) directo |
| **Oskitar** (soporte técnico interno) | Sub-conmutador **Resumen / Detalle**. Resumen: 8 KPIs, actividad por día/hora, embudo, categorías, tabla de personas. Detalle: KPIs de recurrencia, rapidez de respuesta por tramos, día de semana, motivos de escalamiento, contenido más enviado, "personas por día" con drill-down. Filtro de rango/categoría, CSV, SSE | Servicio `chatbot-analytics` — `GET {VITE_CHATBOT_ANALYTICS_URL}/api/oskitar/analytics` + `/stream` (SSE) |
| **Betty** (atención a clientes) | Vista única: 4 KPIs, series por día/hora/semana, flujos, intenciones, recorrido "consultar resultados", tipos de mensaje, clientes más activos, tabla de clientes. CSV, SSE | `chatbot-analytics` — `/api/betty/analytics` + `/stream` |

`chatbot-analytics` (spec 0004 / ADR-0002) es un servicio Express aparte (host `3008` →
contenedor `3000`) que lee los logs de los bots por SSH y calcula el modelo. El CRM sólo lo
pinta. Ver `specs/0004-integracion-analitica-chatbots/`.

> El módulo **Centro de Soporte** (`/support`, embebía `chatbot-soporte`) se retiró: su
> analítica vive ahora en la pestaña Oskitar.

## Piezas clave (`Dashboard.jsx` + componentes)

| Componente | Responsabilidad |
|------------|-----------------|
| `Dashboard` (default) | Estado de pestaña (`agentType`), rango (`timeRange`), queries React Query, realtime `interactions_log` |
| `ChatbotAnalyticsPanel` (`src/components/`) | Pestañas Oskitar y Betty: `useQuery` contra `chatbotAnalytics.service`, SSE, Recharts, tablas, filtros, CSV |
| `KpiCard`, `ChannelDonut`, `CustomTooltip` | Presentación de métricas del Bot Comercial |
| `RankingSection` + `PodiumCard` + `ZoneSummary` | Podio Top 3 + tabla: búsqueda, filtro de canal, orden por columnas, paginación (`RANKING_PAGE_SIZE = 15`), export CSV |
| `FeedItem` | Ítem del monitor de actividad en tiempo real |

## Servicio (`chatbotAnalytics.service.js`)

`listBots`, `getModel(bot, {range,category})`, `getHealth`, `exportCsvUrl`, `subscribe(bot, onUpdate)`
(SSE). Base URL: `VITE_CHATBOT_ANALYTICS_URL`.

## Servicio (`crm.service.js`)

`getDashboardStats`, `getRecentInteractions`, `getActivity`, `getChannelDistribution`,
`getSiissHealth`, `getUserRanking`.

- **Rango de tiempo**: `24h` / `7d` / `1m` / `1y`. Criterio homogéneo con `getDashboardStats`
  (`24h` = últimas 24 h exactas; el resto = `startOfDay(now - (días-1))`).
- `getUserRanking` agrupa `interactions_log` (`direction = INCOMING`) por `provider_id`,
  resuelve nombre gerencial (identidades de contacto → mapa conocido → heurística), calcula
  día top, desglose por día de semana y zonas escaneadas (`parseZoneFromContent`). Si no hay
  logs, devuelve un set de datos gerenciales por defecto.

## Estado actual / historial

Ver `CHANGELOG.md` (sección CRM_Frontend — Analítica de Agentes). Resumen:

- `getUserRanking` respeta el rango real (antes forzaba mínimo 30 días).
- `RankingSection`: paginación, filtro de canal (Todos/WhatsApp/Telegram), orden por
  `# Pos.` y `Total Mensajes`, export CSV del ranking filtrado.
- Pase de diseño: superficies y tipografía alineadas con `../design-system.md`; tokens de
  tema en vez de `bg-white/5`.

Formalizado bajo SDD en `specs/0002-analitica-agentes-ranking/` (spec retroactiva).

## Pendientes / ideas

- Orden por "Última actividad" (requiere exponer timestamp crudo, hoy es string relativo).
- Métricas reales para la vista de Soporte (hoy varias son fijas: 94.8%, <1.8s, 99.9%, 98.5%).
- Comparativa entre periodos en KPIs.

## Antes de modificar

- Seguir `../design-system.md`.
- Verificar en Docker local `http://127.0.0.1:3003/` (`docs/operacion/despliegue-local.md`).
- Crear/actualizar la spec en `specs/`.
