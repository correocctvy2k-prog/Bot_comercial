# PLAN 0004 — Integración nativa Analítica de Chatbots

Referencia: `spec.md` en esta misma carpeta.

## Enfoque técnico

Dos frentes independientes que confluyen en `Dashboard.jsx`:

1. **Servicio** `chatbot-analytics` dentro del repo, dockerizado, leyendo los logs reales por
   SSH (config ya probada por el dev: `192.168.8.90`). Expone el modelo por API JSON + SSE.
2. **Frontend nativo**: `Dashboard.jsx` gana `agentType` `oskitar` y `betty`; un servicio
   cliente (`chatbotAnalytics.service.js`) llama a la API; paneles Recharts + tokens.

Alternativa descartada: **iframe** del tablero de `chatbot-analytics`. Rápido pero rompe la
uniformidad visual (Chart.js, su propio CSS) — justo lo que se quiere evitar.

## Archivos a tocar

| Archivo | Cambio | Riesgo |
|---|---|---|
| `chatbot-analytics/**` | Copia del proyecto (sin `node_modules`/`.git`/`.env`) | bajo |
| `chatbot-analytics/Dockerfile` | Nuevo | bajo |
| `chatbot-analytics/.env.example` | Ya existe; se versiona | bajo |
| `chatbot-analytics/.dockerignore` | Nuevo (`node_modules`, `.env`, `.git`, `data`) | bajo |
| `docker-compose.yml` | Servicio `chatbot-analytics` (3008:3000, env_file, volumen `./chatbot-analytics/data`) | medio (ADR) |
| `docker-compose.local.yml` | Override si aplica (p. ej. `MASK_PHONES`) | bajo |
| `CRM_Frontend/Dockerfile` | `ARG`/`ENV` `VITE_CHATBOT_ANALYTICS_URL` | bajo |
| `docker-compose.yml` (crm-frontend build args) | `VITE_CHATBOT_ANALYTICS_URL=http://192.168.8.65:3008` | bajo |
| `docker-compose.local.yml` (crm-frontend) | `VITE_CHATBOT_ANALYTICS_URL=http://127.0.0.1:3008` | bajo |
| `CRM_Frontend/src/services/chatbotAnalytics.service.js` | Nuevo (fetch modelo/users, SSE, url CSV) | medio |
| `CRM_Frontend/src/pages/Dashboard.jsx` | 3 pestañas; paneles Oskitar y Betty; quitar `SoporteDashboardPanel` | alto |
| `CRM_Frontend/src/layout/Layout.jsx` | Quitar item "Centro de Soporte" | bajo |
| `CRM_Frontend/src/App.jsx` | Quitar ruta `/support` (comentada, reversible) | bajo |
| `docs/adr/ADR-0002-servicio-chatbot-analytics.md` | Nuevo | — |
| `CHANGELOG.md`, `CRM_Frontend/docs/analitica-agentes/README.md` | Actualizar | — |

## Contratos de datos / API (de `chatbot-analytics`)

- `GET /api/bots` → `[{id, name, subtitle, engine, ready}]`.
- `GET /api/:bot/analytics?from&to&category` → **Oskitar**: `{meta, kpis, byDay[{date,inbound,
  outbound,sessions,users}], byHour[], categories[{category,messages,sessions}], funnel[],
  users[{…,sessions,categories}], trends}`. **Betty**: `{meta, kpis{totalMessages,uniqueCustomers,
  customers,…}, byDay[], byHour[], customers[{phone,label,flows[]}], flows[]}`.
- `GET /api/:bot/users?from&to&category` → array (sólo Oskitar).
- `GET /api/:bot/export.csv?dataset&from&to` → CSV con BOM.
- `GET /api/:bot/stream` → SSE, evento `update {updatedAt, reason}` ⇒ refetch.
- `POST /api/:bot/refresh` → fuerza recálculo.
- Compat: `/api/analytics` etc. redirigen al primer bot (no se usan).

## Diseño / UI

- Cabecera del módulo intacta; el `<div>` de conmutador pasa a 3 botones (design-system §5).
- Oskitar y Betty: fila de KPIs con icon-badge; grid de paneles (`gap-6`); Recharts
  (`ResponsiveContainer`, grid `rgba(255,255,255,0.05)`, tooltip con superficie estándar);
  tabla de usuarios/clientes al estilo del Ranking rediseñado (una fila = una línea, expand).
- Selector de rango (`from`/`to`) y filtro de categoría (Oskitar) reutilizando el patrón del
  selector de rango del Bot Comercial.
- Sub-vistas de Oskitar: sub-conmutador "Resumen · Detalle" dentro de la pestaña.

## Plan de rollout

1. Servicio: copia + Dockerfile + compose; `up --build chatbot-analytics`; smoke de la API
   con datos reales.
2. Front: servicio cliente + pestaña Oskitar (resumen) → iterar (detalle, Betty).
3. Quitar Centro de Soporte + `SoporteDashboardPanel`.
4. Rebuild `crm-frontend` con la nueva `VITE_*`; smoke claro/oscuro.
5. ADR-0002, CHANGELOG, ficha. PR.

## Plan de rollback

`git revert` del merge + rebuild `crm-frontend` + `docker compose stop chatbot-analytics`.
Centro de Soporte se restaura descomentando 2-3 líneas. Sin estado que revertir (el histórico
de `chatbot-analytics/data` es sólo lectura para el CRM).

## Verificación

- `curl http://127.0.0.1:3008/api/bots` y `/api/oskitar/analytics` → datos reales.
- Recorrido de las 3 pestañas en `http://127.0.0.1:3003/`, claro y oscuro.
- Provocar un `update` (o `POST /api/oskitar/refresh`) y ver el panel refrescar.
- `npm run lint` + `npm run build`.
