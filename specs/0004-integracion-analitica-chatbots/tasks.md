# TASKS 0004 — Integración nativa Analítica de Chatbots

Referencia: `spec.md` y `plan.md`.

## Servicio `chatbot-analytics`

- [x] Copiar `chatbot-analytics/` al repo (excluir `node_modules`, `.git`, `.env`, `data/*` salvo `.gitkeep`).
- [x] `chatbot-analytics/.dockerignore` (`node_modules`, `.env`, `.git`, `data`, `*.log`).
- [x] `chatbot-analytics/Dockerfile` (node:20-alpine, `npm install`, `CMD ["node","server.js"]`, EXPOSE 3000).
- [x] Servicio en `docker-compose.yml`: `chatbot-analytics` 3008:3000, `env_file: ./chatbot-analytics/.env`, volumen `./chatbot-analytics/data:/app/data`, `restart: always`, TZ.
- [x] (n/a) Override en `docker-compose.local.yml` si hace falta.
- [x] `docker compose … up -d --build chatbot-analytics` y smoke: `/api/bots`, `/api/oskitar/analytics`, `/api/betty/analytics` con datos reales (SSH a 192.168.8.90 OK).

## Frontend nativo (Dashboard.jsx)

- [x] `CRM_Frontend/Dockerfile` + `docker-compose*.yml`: `VITE_CHATBOT_ANALYTICS_URL`.
- [x] `src/services/chatbotAnalytics.service.js` (getModel, getUsers, subscribe SSE, exportCsvUrl).
- [x] `agentType`: `comercial | oskitar | betty`; conmutador de 3 botones.
- [x] Pestaña **Oskitar**: KPIs, `byDay` (área), `byHour`, `funnel`, `categories`, tabla `users`,
      selector de rango + filtro de categoría, export CSV, sub-vistas Resumen/Detalle, SSE.
- [x] Pestaña **Betty**: KPIs, `byDay`, `byHour`, `flows`, tabla `customers`, export CSV, SSE.
- [x] Estados carga/error/vacío; tema claro y oscuro; Recharts (no Chart.js).

## Eliminar Centro de Soporte

- [x] `Layout.jsx`: quitar item "Centro de Soporte".
- [x] `App.jsx`: comentar ruta `/support` (reversible).
- [x] `Dashboard.jsx`: quitar `SoporteDashboardPanel`, rama `agentType === 'soporte'` y handshake postMessage.
- [x] Conservar `SupportDashboard.jsx` / `SupportWidget.jsx` en el árbol (sin ruta).

## Verificación

- [x] `cd CRM_Frontend && npm run lint` (sin errores nuevos) + `npm run build` (verde).
- [x] `docker compose … up -d --build crm-frontend chatbot-analytics`.
- [x] Smoke `http://127.0.0.1:3003/`: 3 pestañas, datos reales (Oskitar 40 conv / Betty 33
      clientes), sin errores de consola, claro y oscuro. `/support` redirige a `/`.
      CORS: se añadió middleware abierto a `chatbot-analytics/server.js`.
- [x] SSE en vivo verificado (Playwright): un `POST /api/oskitar/refresh` externo dispara un
      refetch del modelo en el panel abierto. Botón "Actualizar" = `POST /refresh` + refetch.

## Documentación (DoD)

- [x] `docs/adr/ADR-0002-servicio-chatbot-analytics.md`.
- [x] `CHANGELOG.md` — Analítica de Agentes + Infra.
- [x] `CRM_Frontend/docs/analitica-agentes/README.md` — 3 pestañas, fuente de datos, SSE.
- [x] `chatbot-analytics/README.md` — sección "Despliegue dentro del stack Skylab".
- [ ] Lección aprendida: el SSH desde Docker funcionó sin ajustes (no hizo falta).

## Cierre

- [ ] PR enlazando la spec. CI verde (build). Merge. Deploy y verificación en `192.168.8.65`.
