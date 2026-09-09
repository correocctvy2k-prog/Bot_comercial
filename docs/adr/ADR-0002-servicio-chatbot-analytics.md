# ADR-0002 — Servicio `chatbot-analytics` en el stack + variable build-time del CRM

- **Estado:** Aceptado
- **Fecha:** 2026-09-08
- **Spec:** `specs/0004-integracion-analitica-chatbots/`
- **Relacionado:** ADR-0001 (config build-time), LL-0001 (`VITE_*` build-time)

## Contexto

En paralelo se desarrolló `chatbot-analytics`: un servicio Express que lee los logs de los bots
**Oskitar** (soporte técnico) y **Betty** (clientes) — por SSH al servidor de los bots
(`192.168.8.90`) — los procesa y expone un **modelo analítico por API JSON + SSE**.

Se quiere que el módulo **Analítica de Agentes** del CRM muestre Oskitar y Betty como pestañas
**nativas** (mismo lenguaje visual del resto), consumiendo esa API. Esto obliga a:

1. Añadir un servicio nuevo al `docker-compose.yml` **base** (prohibido sin ADR).
2. Añadir una `VITE_*` build-time nueva al `Dockerfile` de `CRM_Frontend` (config build-time,
   ADR-0001).

## Decisión

1. **`chatbot-analytics` se incorpora al repo** como carpeta hermana de `ChatBotSoporte`, con su
   propio `Dockerfile` (node:20-alpine, incluye `ssh2`).
2. **Servicio `chatbot-analytics` en `docker-compose.yml`:** puerto host **3008 → contenedor
   3000** (`PORT=3000` forzado por `environment:` para no depender del `.env`), `env_file:
   ./chatbot-analytics/.env` (credenciales SSH, **no versionado**), volumen
   `./chatbot-analytics/data:/app/data` para el histórico acumulativo.
3. **`docker-compose.local.yml`** sólo añade la URL local del frontend
   (`VITE_CHATBOT_ANALYTICS_URL=http://127.0.0.1:3008`) y el `depends_on`. No duplica el servicio.
4. **Nueva build-arg `VITE_CHATBOT_ANALYTICS_URL`** en `CRM_Frontend/Dockerfile` y en los
   `build.args` de ambos compose (`192.168.8.65:3008` en base, `127.0.0.1:3008` en local),
   igual que el resto de `VITE_*`.
5. El navegador llama **directo** a `:3008` (SSE incluido). No se enruta por el `nginx` del CRM,
   así se evita el problema de buffering de SSE tras proxy.

## Alternativas descartadas

- **Iframe del tablero HTML de `chatbot-analytics`.** Rápido, pero rompe la uniformidad visual
  (Chart.js, CSS propio) — justo lo que se quiere corregir. Se opta por consumir la API JSON y
  pintar nativo con Recharts + tokens.
- **Portar la lógica analítica a un endpoint del CRM / Supabase.** Duplica trabajo ya hecho y
  probado; el formato de los logs de los bots no cambia. Se mantiene el servicio dedicado.
- **Enrutar `/analytics/*` por el nginx del CRM.** Añade config de `proxy_buffering off` para
  SSE y un punto de fallo; el navegador puede ir directo a `:3008` en la red interna.

## Consecuencias

**Positivas:** Oskitar y Betty quedan integrados de forma nativa y coherente; el servicio es
reutilizable (tiene su propio tablero y API); el histórico se preserva en un volumen.

**Negativas / riesgos:**
- `chatbot-analytics` **no tiene autenticación propia** (documentado en su README). Mitigación:
  sólo se expone en la red interna; `MASK_PHONES=1` en el `.env` del contenedor. Añadir auth
  queda para una spec futura.
- El `.env` del servicio lleva **credenciales SSH en claro**. Mitigación: fuera de git
  (`.gitignore`), montado por `env_file`; rotar si se filtra.
- Un puerto publicado más (3008). Aceptado; documentado aquí y en `docs/operacion/`.

## Reversión

`git revert` del merge de la spec 0004 + `docker compose stop chatbot-analytics` +
rebuild de `crm-frontend` sin la `VITE_*`. Sin migraciones ni estado que deshacer.
