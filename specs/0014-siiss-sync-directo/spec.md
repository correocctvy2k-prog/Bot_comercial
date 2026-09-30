# SPEC 0014 — Sincronización directa SIISS → Operación de Puntos

- **Estado:** Implementada y verificada en Docker local (2026-09-22), pendiente PR
- **Autor:** Claude (a pedido de ia_gerencia@ganepalmira.com.co)
- **Fecha:** 2026-09-22
- **Módulos afectados:** CRM_Frontend/Operación de Puntos (`Points.jsx`), `cctv-automation-final` (backend `cctv-api`, puerto 3003)
- **Rama:** `feat/0014-siiss-sync-directo`
- **PR:** <pendiente>

## 1. Problema / oportunidad

El botón "Sync SIISS" en Operación de Puntos (`CRM_Frontend/src/pages/Points.jsx:463-478`) llama
`POST http://localhost:3001/api/siiss/sync`. Ese puerto es el servicio `comercial-bot`, que nunca
implementó esa ruta (solo expone `/api/health`, `/webhook*`, `/api/monitoring/*`) → 404 real, no
un problema de red.

La lógica de cruce SIIS↔`puntos_venta` sí existía, pero en `Asamblea/src/services/siiss.service.js`,
nunca conectada a una ruta HTTP, y documentada como riesgo de seguridad pendiente (credenciales
por defecto hardcodeadas) en `cctv-automation-final/docs/SIIS_INTEGRATION_MAP.md`.

Decisión del usuario (2026-09-22): no depender de `Asamblea` porque es un módulo que puede
desaparecer. En cambio, reutilizar el cliente SIIS seguro que ya vive en `cctv-automation-final`
(`platform/siis-client.js`, sin credenciales por defecto, ya cumple ADR-001) — ese backend
(`cctv-api`, puerto 3003) ya tiene configuradas tanto `SIISS_URL/USER/PASS` como
`SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY` en `cctv-automation-final/.env`.

## 2. Objetivo

El botón "Sync SIISS" de Operación de Puntos actualiza `puntos_venta.siiss_active` y
`siiss_last_sync` en Supabase con datos reales y actuales de SIIS, sin pasar por `Asamblea`.

## 3. Alcance

- Nuevo módulo puro `cctv-automation-final/platform/siis-points-sync.js`: cruce `estacodi` ↔
  `puntos_venta.siiss_id` (match exacto, la identidad ya la confirmó Operación de Puntos al
  capturar `siiss_id` — no hay ambigüedad que resolver, a diferencia del cruce contra `locations`
  de spec 0012).
- Nueva ruta `POST /api/cctv/siiss/sync-points` en `cctv-automation-final/api/server.js`.
- Nuevo script `cctv-automation-final/scripts/sync-siiss-points.js` (CLI, mismo patrón que
  `scripts/sync-crm-points.js` de spec 0012) para permitir correrlo también por cron/manual sin
  pasar por HTTP.
- Frontend: `Points.jsx` apunta el botón a `VITE_CCTV_API_BASE` (ya usado por otras llamadas del
  mismo módulo, ver `points.service.js:95-96`) en vez de `VITE_BACKEND_URL:3001`.

## 4. No-objetivos

- No se toca `Asamblea` (se deja intacto, sin nueva dependencia hacia ni desde ahí).
- No se construye conciliación de identidad con revisión humana (eso ya existe para `locations`
  en la spec 0012/ADR-001 y no aplica aquí: `siiss_id` en `puntos_venta` ya es una identidad
  confirmada, no una nueva a decidir).
- No se toca el pipeline de staging existente (`stg_siis_locations`, `sync-siis-live.js`,
  `run-siis-observer.js`) que alimenta el catálogo `locations` de CCTV — es un flujo distinto y
  ya funciona.
- No se arregla en esta spec el otro 404 visto en consola
  (`GET /api/points/:ip/analytics`, `points.service.js:87-93`) — no es SIISS, se deja para otra
  spec si el usuario lo pide.

## 5. Criterios de aceptación

- [x] `POST /api/cctv/siiss/sync-points` responde `{ok:true, matched, updated, errors:[]}` con
      datos reales de SIIS (no mock). Verificado: `{"ok":true,"stations":366,"crmPoints":358,"matched":351,"updated":351,"errors":[]}`.
- [x] Los puntos con `siiss_id` en Supabase quedan con `siiss_last_sync` actualizado tras correr
      el sync; `siiss_active` refleja `estaping` cuando SIIS lo reporta (no se pisa con `false`
      cuando SIIS no informa el ping).
- [x] Botón "Sync SIISS" ya no da 404 (ruta probada directo con `curl` contra `cctv-api`
      reconstruido en Docker local, exactamente el camino que usa el botón vía nginx).
- [x] `npm test` en verde en `cctv-automation-final` — 96/96.
- [x] `npm run lint` + `npm run build` verdes en `CRM_Frontend` (lint: sin errores nuevos en los
      archivos tocados; el repo ya tenía deuda de lint preexistente y documentada aparte).
- [x] Verificado en `http://127.0.0.1:3003/` — ver detalle de cómo en `plan.md`.

## 6. Restricciones de arquitectura y diseño

- Respetar `CRM_Frontend/docs/design-system.md` (cambio de frontend es solo la URL del fetch, sin
  tocar UI).
- Seguir ADR-001: `SIISS_URL/USER/PASS` obligatorias, sin valores de respaldo en código, el
  frontend nunca se autentica directo contra SIIS (sigue pasando por el backend).
- No tocar `docker-compose.yml` base, puertos publicados, ni `nginx.conf` — la ruta nueva vive
  bajo el prefijo `/api/cctv/` que `cctv-api` ya expone en el puerto 3003 existente.

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| SIIS no responde o token expira a mitad de sync | El botón muestra error, no hay sync parcial silencioso | `fetchStations()` ya tiene timeout (8s) y lanza error explícito; la ruta no atrapa el error, cae al catch global (500) y el frontend muestra el `alert` de error |
| Muchos `PATCH` secuenciales a Supabase (uno por punto) | Sync algo lento con ~370 puntos | Mismo patrón ya validado en spec 0012 (`sync-crm-points.js`), aceptable para un botón manual, no un loop automático |
| `estaping` null interpretado como "inactivo" | Falsos negativos de disponibilidad | `diffSiissStatus` solo sobreescribe `siiss_active` cuando `online` no es `null`; si SIIS no informa el ping, se deja el valor anterior y solo se refresca `siiss_last_sync` |

## 8. Impacto en producción

Cambio aislado a una ruta nueva (no reemplaza nada existente) + un botón que hoy ya está roto
(404). Sin cambio de esquema Supabase (columnas `siiss_active`/`siiss_last_sync` ya existen).
Rollback: revertir el commit del frontend (vuelve a apuntar a `:3001`, vuelve a dar 404 — mismo
estado que hoy) y dejar de desplegar el rebuild de `cctv-api` con la ruta nueva.
