# SPEC 0004 — Integración nativa de Analítica de Chatbots (Oskitar · Betty) en Analítica de Agentes

- **Estado:** Aprobada
- **Autor:** equipo Skylab (@jbeltran)
- **Fecha:** 2026-09-08
- **Módulos afectados:** CRM_Frontend / Analítica de Agentes (`Dashboard.jsx`); nuevo servicio
  `chatbot-analytics`; `docker-compose*.yml`; eliminación del módulo Centro de Soporte.
- **Rama:** `feat/0004-analitica-chatbots-nativa`
- **PR:** _pendiente_

## 1. Problema / oportunidad

En paralelo se desarrolló `chatbot-analytics` (`G:\Proyects\final-skylab\chatbot-analytics`):
un servicio Express que lee los logs de **Oskitar** (bot de soporte técnico interno) y **Betty**
(bot de atención a clientes), los procesa y expone un **modelo analítico por API JSON + SSE**.
Hoy vive fuera del CRM, con su propio tablero HTML.

El módulo **Analítica de Agentes** del CRM sólo cubre el Bot Comercial (nativo, contra Supabase)
y una pestaña "Bot Soporte Técnico" que **embebe** el tablero de `chatbot-soporte` por iframe.
Queremos que Oskitar y Betty sean **pestañas nativas** del módulo, con el mismo lenguaje visual
del resto (KPIs, Recharts, tablas del `design-system`), no un iframe.

Además: el módulo **Centro de Soporte** (`/support`, embebe `chatbot-soporte`) genera confusión
y no aporta; se retira.

## 2. Objetivo

Analítica de Agentes tiene 3 pestañas nativas — **Bot Comercial · Oskitar · Betty** — que
consumen datos en vivo y se ven como un solo producto. Centro de Soporte deja de existir en la
navegación.

## 3. Alcance

### 3.1 Servicio `chatbot-analytics`
- Copiar el proyecto al repo como `chatbot-analytics/` (sin `node_modules`, `.git`, `.env`).
- `Dockerfile` propio (Node 20-alpine, `npm install` incl. `ssh2`, `CMD node server.js`).
- Servicio `chatbot-analytics` en `docker-compose.yml` + `docker-compose.local.yml`,
  **puerto host 3008 → contenedor 3000**. `env_file: ./chatbot-analytics/.env` (no versionado).
- **Fuente de datos: logs reales por SSH** (`LOG_SOURCE=ssh` a `192.168.8.90`, rutas de
  `ChatBotSoporte/logs/conversations.log` y `ChatBotBetty/logs/{messages,state-manager}.log`).
  El histórico acumulativo se persiste en un volumen (`./chatbot-analytics/data`).
- No lleva autenticación propia (documentado); sólo se expone en la red interna.

### 3.2 Frontend nativo (`Dashboard.jsx`)
- El conmutador `agentType` pasa de `comercial|soporte` a **`comercial|oskitar|betty`**.
- Nuevo servicio cliente `src/services/chatbotAnalytics.service.js`: `getModel(bot, {from,to,category})`,
  `getUsers(bot,…)`, `subscribe(bot, onUpdate)` (SSE), `exportCsvUrl(bot, dataset, range)`.
  Base URL = `import.meta.env.VITE_CHATBOT_ANALYTICS_URL`.
- **Pestaña Oskitar** (engine `oskitar`): KPIs (conversaciones, personas únicas, mensajes
  in/out, categorías…), serie temporal `byDay` (área), actividad por hora `byHour`, embudo
  `funnel`, top categorías, tabla de usuarios (`users`) con expand, export CSV. Oskitar tiene
  dos vistas internas (resumen / detalle) que se reproducen como sub-tabs o secciones.
- **Pestaña Betty** (engine `betty`): KPIs (mensajes, clientes únicos…), `byDay`, `byHour`,
  lista de flujos (`flows`), tabla de clientes (`customers`) con sus flujos, export CSV. Vista única.
- Live updates vía SSE (`/api/:bot/stream`): al recibir `update`, refetch del modelo.
- Estados de carga / error / vacío resueltos (nunca panel en blanco).
- Todo con `design-system.md`: superficie estándar, Recharts §7 (no Chart.js), tokens de tema,
  KPIs con icon-badge. Reutiliza componentes ya existentes del módulo donde aplique.

### 3.3 Eliminación de Centro de Soporte
- Quitar del sidebar (`Layout.jsx`) el item "Centro de Soporte".
- Quitar la ruta `/support` de `App.jsx` (cae al redirect `*`).
- Retirar de `Dashboard.jsx` el `SoporteDashboardPanel` (iframe de `chatbot-soporte`) y su
  rama `agentType === 'soporte'`, y la lógica de handshake `postMessage`.
- **No se elimina** el servicio `chatbot-soporte` del `docker-compose` en esta spec (lo consume
  el bot en producción); sólo se quita su superficie en el CRM. `SupportDashboard.jsx` y
  `SoporteWidget`/`SupportWidget` se comentan/retiran de rutas pero se conservan en el árbol
  para poder revertir (patrón de [[working-model-governance]], como Asamblea).

## 4. No-objetivos

- **No** se reescribe la lógica analítica: el modelo lo calcula `chatbot-analytics`, el CRM sólo
  lo pinta.
- **No** se toca el Bot Comercial ni el Ranking (spec 0002 / rediseño 0004-modulos).
- **No** se elimina físicamente `chatbot-soporte` ni su servicio Docker.
- **No** se añade autenticación a `chatbot-analytics` en esta spec (riesgo registrado).
- **No** se migra la fuente a Supabase ni se cambia el formato de los logs de los bots.
- **No** entra el arreglo del build de `comercial-bot` ([[comercial-bot-build-roto-bullseye]]).

## 5. Criterios de aceptación

- [ ] `docker compose … up -d --build chatbot-analytics` levanta el servicio; `GET
      http://127.0.0.1:3008/api/bots` responde `[{id:"oskitar",…},{id:"betty",…}]` y
      `/api/oskitar/analytics` y `/api/betty/analytics` devuelven modelo con datos **reales**
      (no el sample).
- [ ] En `http://127.0.0.1:3003/`, Analítica de Agentes muestra 3 pestañas: Bot Comercial,
      Oskitar, Betty. Ya no existe "Bot Soporte Técnico".
- [ ] Oskitar: KPIs, serie por día, por hora, embudo, categorías y tabla de usuarios pintan con
      datos reales; export CSV descarga; el panel se actualiza al llegar un evento SSE.
- [ ] Betty: KPIs, series, flujos y tabla de clientes pintan; export CSV descarga.
- [ ] Sidebar sin "Centro de Soporte"; `/support` redirige a `/`.
- [ ] Sin iframes nuevos; todo Recharts + tokens; correcto en tema claro y oscuro.
- [ ] `cd CRM_Frontend && npm run lint` (sin errores nuevos) + `npm run build` verdes.
- [ ] Verificado en Docker local.

## 6. Restricciones de arquitectura y diseño

- `design-system.md` obligatorio para toda la UI nueva.
- **ADR requerido**: se modifica `docker-compose.yml` base (servicio nuevo) y se añade un
  `VITE_*` build-time → `docs/adr/ADR-0002-servicio-chatbot-analytics.md`.
- Config build-time (`VITE_CHATBOT_ANALYTICS_URL`) inyectada como `ARG`/`ENV` en el `Dockerfile`
  de `CRM_Frontend`, igual que el resto (LL-0001).
- El `.env` de `chatbot-analytics` (credenciales SSH) **nunca** se versiona; sólo `.env.example`.
- SSE: el `nginx.conf` del CRM debe permitir `proxy_buffering off` para `/api/*` del analytics
  si se enruta por nginx; si el navegador llama directo a `:3008`, no aplica (se decide en plan).

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| `chatbot-analytics` sin autenticación, expuesto en `:3008` | Medio (fuga de métricas / teléfonos) | Sólo red interna; `MASK_PHONES=1` en el `.env` del contenedor; ADR lo registra; auth en spec futura |
| Credenciales SSH en `.env` del contenedor | Medio | `.env` fuera de git; `env_file` montado; rotar si se filtra |
| El contenedor no alcanza `192.168.8.90:22` desde la red Docker | Alto (sin datos) | Verificar en el smoke; fallback a montar los logs por volumen; el servicio degrada, no cae |
| Duplicar en React la lógica de las "2 vistas" de Oskitar | Medio (esfuerzo/deriva) | El modelo ya viene resuelto por la API; el front sólo compone; no se recalcula nada |
| SSE tras nginx se corta (buffering) | Bajo | Llamada directa del navegador a `:3008`, o `proxy_buffering off` documentado |

## 8. Impacto en producción

- **Usuario final:** Analítica de Agentes gana Oskitar y Betty como pestañas nativas; desaparece
  Centro de Soporte y la pestaña "Bot Soporte Técnico".
- **Despliegue:** nuevo contenedor `chatbot-analytics` (rebuild + `.env` con SSH en el server);
  rebuild de `crm-frontend` con `VITE_CHATBOT_ANALYTICS_URL`. Volumen para `chatbot-analytics/data`.
- **Rollback:** `git revert` del merge + `docker compose up -d --build crm-frontend` y
  `docker compose stop chatbot-analytics`. El Centro de Soporte se restaura descomentando ruta
  y nav. Sin migraciones.
