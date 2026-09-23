# PLAN 0014 — Sincronización directa SIISS → Operación de Puntos

Referencia: `spec.md` en esta misma carpeta.

## Enfoque técnico

Reutilizar el cliente SIIS seguro ya existente (`platform/siis-client.js`, `platform/siis.js`)
que `cctv-api` (puerto 3003) ya usa para el pipeline de `locations`, pero con un cruce nuevo y
mucho más simple: `estacodi` ↔ `puntos_venta.siiss_id` directo, sin staging ni revisión humana
(esa identidad ya la fijó un humano al capturar `siiss_id` en Operación de Puntos). Se descartó
reactivar `Asamblea/src/services/siiss.service.js` porque el usuario pidió explícitamente no
depender de un módulo que puede desaparecer, y esa versión además tenía credenciales por defecto
hardcodeadas (riesgo ya documentado en `SIIS_INTEGRATION_MAP.md`).

Se sigue el mismo patrón de I/O que `scripts/sync-crm-points.js` (spec 0012): `fetch()` crudo
contra el REST de Supabase con `SUPABASE_SERVICE_ROLE_KEY`, sin el SDK `@supabase/supabase-js`
(no es una dependencia del backend `cctv-automation-final` hoy).

## Archivos a tocar

| Archivo | Cambio | Riesgo |
|---------|--------|--------|
| `cctv-automation-final/platform/siis-points-sync.js` | Nuevo. `diffSiissStatus()` (puro) + `syncSiissPoints()` (I/O: fetchStations + lectura/escritura Supabase) | bajo |
| `cctv-automation-final/tests/siis-points-sync.test.js` | Nuevo. Test de `diffSiissStatus()` con `node:test` | bajo |
| `cctv-automation-final/scripts/sync-siiss-points.js` | Nuevo. CLI delgado sobre `syncSiissPoints()`, con `--dry-run` (mismo patrón que `sync-crm-points.js`) | bajo |
| `cctv-automation-final/api/server.js` | Nueva ruta `POST /api/cctv/siiss/sync-points` | bajo — ruta aislada, no toca rutas existentes |
| `CRM_Frontend/src/pages/Points.jsx` | Botón "Sync SIISS": cambia `VITE_BACKEND_URL` por `VITE_CCTV_API_BASE` + ruta nueva | bajo |

## Contratos de datos / API

**`POST /api/cctv/siiss/sync-points`** (sin body)

Respuesta 200:
```json
{ "ok": true, "stations": 320, "crmPoints": 370, "matched": 340, "updated": 340, "errors": [] }
```
- `stations`: estaciones recibidas de SIIS en esta corrida.
- `crmPoints`: puntos de `puntos_venta` con `siiss_id` no nulo y no cerrados permanentemente.
- `matched`: puntos donde `siiss_id` coincidió con un `estacodi` de la respuesta SIIS.
- `updated`: de los `matched`, cuántos se escribieron con éxito en Supabase.
- `errors`: `[{crmPointId, error}]` por cada `PATCH` que falló (no aborta el resto).

Errores (login/timeout SIIS, Supabase caído, env vars faltantes): la ruta no atrapa la excepción,
cae al `catch` global de `server.js` → 500 `{error: message}`. El frontend ya maneja esto
(`catch` del `fetch` → `alert('❌ Error al conectar con SIISS: ...')`).

**Escritura en `puntos_venta`** (columnas existentes, sin migración):
- `siiss_active` ← `estaping` normalizado a booleano, **solo si SIIS lo reportó** (no nulo).
- `siiss_last_sync` ← timestamp ISO de esta corrida, siempre que hubo match (independiente de si
  `siiss_active` cambió).

## Diseño / UI

Sin cambios visuales. Solo la URL de destino del `fetch` en el botón ya existente
(`Points.jsx:466-474`).

## Plan de rollout

1. Local dockerizado: rebuild `cctv-api` + `crm-frontend` con `docker-compose.local.yml`.
2. Smoke test manual en `http://127.0.0.1:3003/` → Operación de Puntos → botón "Sync SIISS".
3. `npm test` en `cctv-automation-final`, `npm run lint` + `npm run build` en `CRM_Frontend`.
4. PR + CI.
5. Merge + deploy a `.65`: rebuild `cctv-api` (nueva ruta) — **sin `docker-compose.local.yml`** —
   + `docker compose up -d --build crm-frontend` (nuevo build-arg `VITE_CCTV_API_BASE` ya existe
   en el compose de prod, se reutiliza) + `docker restart crm-frontend` (regla del proyecto: tras
   rebuild de un backend, nginx cachea la IP del upstream anterior).

## Plan de rollback

Revert del commit de `Points.jsx` (vuelve a `:3001`, vuelve al 404 de hoy — no hay regresión neta)
+ no desplegar el rebuild de `cctv-api` con la ruta nueva. La ruta nueva es aditiva: no reemplaza
ni modifica ninguna ruta existente, así que dejar `cctv-api` en la versión anterior no rompe nada
más.

## Verificación

- `cd cctv-automation-final && npm test` — incluye `tests/siis-points-sync.test.js`.
- `cd CRM_Frontend && npm run lint && npm run build`.
- Docker local: `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build cctv-api crm-frontend` + `docker restart crm-frontend`.
- En `http://127.0.0.1:3003/` → Operación de Puntos → clic en "Sync SIISS" → confirmar que no da
  404 y que el `alert` muestra un número de puntos sincronizados > 0 (o el mensaje de error real
  de SIIS si la VPN/red a SIIS no está disponible desde la máquina local — documentar cuál de los
  dos se observó).
