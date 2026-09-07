# CRM_Frontend — Módulo "Analítica de Agentes IA"

Ruta: `/` · Archivo: `src/pages/Dashboard.jsx` · Servicio: `src/services/crm.service.js`

## Propósito

Monitoreo y gestión de los bots de IA en producción. Dos vistas conmutables:

| Vista | Contenido | Fuente de datos |
|-------|-----------|-----------------|
| **Bot Comercial** | KPIs, gráfica de actividad, donut de distribución por canal, Ranking de Usuarios & Zonas Escaneadas, monitor de actividad en tiempo real | Supabase (`interactions_log`, `contact_identities`, `contacts`) directo |
| **Bot Soporte Técnico** | KPIs resumidos + panel interactivo embebido (`iframe`) del ChatBotSoporte | `VITE_SUPPORT_BOT_URL` (servicio `chatbot-soporte`, puerto 3006) vía `postMessage` |

## Piezas clave (`Dashboard.jsx`)

| Componente | Responsabilidad |
|------------|-----------------|
| `Dashboard` (default) | Estado de vista (`agentType`), rango (`timeRange`), queries React Query, suscripción realtime a `interactions_log` |
| `SoporteDashboardPanel` | Autoriza sesión CRM contra el bot de soporte, embebe `dashboard.html`, sincroniza tema por `postMessage` |
| `KpiCard`, `ChannelDonut`, `CustomTooltip` | Presentación de métricas |
| `RankingSection` + `SortIcon` | Podio Top 3 + tabla completa: búsqueda, filtro de canal, orden por columnas, paginación (`RANKING_PAGE_SIZE = 15`), export CSV |
| `FeedItem` | Ítem del monitor de actividad en tiempo real |

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

> Pendiente: spec retroactiva `specs/0002-analitica-agentes-ranking/` para formalizar lo
> anterior bajo SDD.

## Pendientes / ideas

- Orden por "Última actividad" (requiere exponer timestamp crudo, hoy es string relativo).
- Métricas reales para la vista de Soporte (hoy varias son fijas: 94.8%, <1.8s, 99.9%, 98.5%).
- Comparativa entre periodos en KPIs.

## Antes de modificar

- Seguir `../design-system.md`.
- Verificar en Docker local `http://127.0.0.1:3003/` (`docs/operacion/despliegue-local.md`).
- Crear/actualizar la spec en `specs/`.
