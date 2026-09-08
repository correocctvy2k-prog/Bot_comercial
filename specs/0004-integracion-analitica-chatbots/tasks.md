# TASKS 0004 — Integración nativa Analítica de Chatbots

Referencia: `spec.md` y `plan.md`.

## Servicio `chatbot-analytics`

- [ ] Copiar `chatbot-analytics/` al repo (excluir `node_modules`, `.git`, `.env`, `data/*` salvo `.gitkeep`).
- [ ] `chatbot-analytics/.dockerignore` (`node_modules`, `.env`, `.git`, `data`, `*.log`).
- [ ] `chatbot-analytics/Dockerfile` (node:20-alpine, `npm install`, `CMD ["node","server.js"]`, EXPOSE 3000).
- [ ] Servicio en `docker-compose.yml`: `chatbot-analytics` 3008:3000, `env_file: ./chatbot-analytics/.env`, volumen `./chatbot-analytics/data:/app/data`, `restart: always`, TZ.
- [ ] Override en `docker-compose.local.yml` si hace falta.
- [ ] `docker compose … up -d --build chatbot-analytics` y smoke: `/api/bots`, `/api/oskitar/analytics`, `/api/betty/analytics` con datos reales (SSH a 192.168.8.90 OK).

## Frontend nativo (Dashboard.jsx)

- [ ] `CRM_Frontend/Dockerfile` + `docker-compose*.yml`: `VITE_CHATBOT_ANALYTICS_URL`.
- [ ] `src/services/chatbotAnalytics.service.js` (getModel, getUsers, subscribe SSE, exportCsvUrl).
- [ ] `agentType`: `comercial | oskitar | betty`; conmutador de 3 botones.
- [ ] Pestaña **Oskitar**: KPIs, `byDay` (área), `byHour`, `funnel`, `categories`, tabla `users`,
      selector de rango + filtro de categoría, export CSV, sub-vistas Resumen/Detalle, SSE.
- [ ] Pestaña **Betty**: KPIs, `byDay`, `byHour`, `flows`, tabla `customers`, export CSV, SSE.
- [ ] Estados carga/error/vacío; tema claro y oscuro; Recharts (no Chart.js).

## Eliminar Centro de Soporte

- [ ] `Layout.jsx`: quitar item "Centro de Soporte".
- [ ] `App.jsx`: comentar ruta `/support` (reversible).
- [ ] `Dashboard.jsx`: quitar `SoporteDashboardPanel`, rama `agentType === 'soporte'` y handshake postMessage.
- [ ] Conservar `SupportDashboard.jsx` / `SupportWidget.jsx` en el árbol (sin ruta).

## Verificación

- [ ] `cd CRM_Frontend && npm run lint` (sin errores nuevos) + `npm run build`.
- [ ] `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build crm-frontend chatbot-analytics`.
- [ ] Smoke en `http://127.0.0.1:3003/`: 3 pestañas, datos reales, SSE refresca, CSV descarga, claro/oscuro.

## Documentación (DoD)

- [ ] `docs/adr/ADR-0002-servicio-chatbot-analytics.md` (servicio nuevo + `VITE_*` + riesgo sin-auth).
- [ ] `CHANGELOG.md` — Analítica de Agentes + Infra.
- [ ] `CRM_Frontend/docs/analitica-agentes/README.md` — 3 pestañas, fuente de datos, SSE.
- [ ] `chatbot-analytics/README.md` — nota de despliegue dentro del stack Skylab.
- [ ] Lección aprendida si el SSH desde Docker da guerra.

## Cierre

- [ ] PR enlazando la spec. CI verde (build). Merge. Deploy y verificación en `192.168.8.65`.
