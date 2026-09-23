# PLAN 0015 — Monitor de puntos en tiempo real (ping) + sync SIISS horario

Referencia: `spec.md` en esta misma carpeta.

## Enfoque técnico

Dos piezas independientes que comparten solo el concepto de "horario de operación"
(05:30–22:30 America/Bogota), implementado dos veces (una por proyecto, ver spec.md §6):

1. **Ping en tiempo real**: en vez de escribir un ping nuevo desde cero, se reutiliza
   `monitor_puntos_wpp.py` (ya probado, ya paralelo, ya escribe a Supabase) agregándole un modo
   `--tipo ping_only` que corta el flujo antes de generar reporte/gráfico. Un nuevo
   `src/worker.js` (que además resucita el contenedor `comercial-worker`, roto desde antes de
   esta spec) lo dispara cada minuto con `node-cron` (ya es dependencia del proyecto raíz, sin
   uso previo).
2. **Sync SIISS horario**: `syncSiissPoints()` (spec 0014) ya existe como script CLI
   (`scripts/sync-siiss-points.js`). Se engancha en `run-operational-cycle.js`, mismo patrón que
   `crmPointsSync` (spec 0012), con su propio `operationalSourceDue('siissPointsSync', 60)` +
   chequeo de horario.

Se descartó compartir un solo módulo de horario entre `comercial-bot` y `cctv-automation-final`
por ser paquetes Node independientes (ver spec.md §6) — la duplicación es de ~20 líneas puras,
sin dependencias, más barata que acoplar los despliegues.

## Archivos a tocar

| Archivo | Cambio | Riesgo |
|---------|--------|--------|
| `monitor_puntos_wpp.py` | Nuevo `if args.tipo == "ping_only":` dentro de `main()`, antes de `build_report_text` — corta temprano, sin tocar el resto | bajo (aditivo, no modifica rutas existentes) |
| `src/services/businessHours.service.js` | Nuevo. `isWithinPointsMonitorWindow(date, env)` | bajo |
| `src/worker.js` | Nuevo. `node-cron` cada minuto + spawn de `monitor_puntos_wpp.py --tipo ping_only`, con guard `running` anti-solape | bajo — proceso separado de `comercial-bot` |
| `cctv-automation-final/platform/business-hours.js` | Nuevo. Misma función que `businessHours.service.js`, copia independiente | bajo |
| `cctv-automation-final/tests/business-hours.test.js` | Nuevo | bajo |
| `cctv-automation-final/scripts/run-operational-cycle.js` | Nuevo paso `siissPointsSync` (gateado por `operationalSourceDue` + horario) | bajo — paso no crítico, no baja el ciclo si falla |
| `docker-compose.yml` | Sin cambios (el servicio `comercial-worker` ya existe) | — |

## Contratos de datos / API

**`monitor_puntos_wpp.py --json --tipo ping_only`** (stdout, éxito):
```json
{"ok": true, "scanned": 358, "active": 340, "duration": 42.3}
```
Mismo `update_supabase_results()` que ya usa el bot de WhatsApp — mismas columnas
(`active`, `latency`, `last_online_at`, `nvr_port`, `nvr_checked_at`), mismo `on_conflict="ip"`,
mismo `_detect_and_log_transitions` (→ `point_activity_log`). Sin cambios de esquema.

**Env nuevas** (con default, no rompen si no están):
- `POINTS_OPERATIONAL_WINDOW_START` / `POINTS_OPERATIONAL_WINDOW_END` (default `05:30`/`22:30`),
  usadas por ambos módulos de horario (mismos nombres en los dos proyectos, para que quede claro
  que es el mismo concepto aunque el código no se comparta).
- `SIISS_POINTS_SYNC_INTERVAL_MINUTES` (default `60`), mismo estilo que
  `CRM_POINTS_SYNC_INTERVAL_MINUTES` de spec 0012.

## Diseño / UI

Sin cambios de UI en esta spec.

## Plan de rollout

1. Local: `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
   comercial-bot comercial-worker cctv-operational-worker`.
2. Verificar `docker logs comercial-worker` (arranca sin crashear, loguea el primer ciclo).
3. Verificar que el bot de WhatsApp sigue respondiendo igual (`comercial-bot` sin cambios de
   comportamiento).
4. `cctv-automation-final`: `npm test`.
5. PR (después de mergear `feat/0014-siiss-sync-directo` primero — spec.md §7) + CI.
6. Merge + deploy a `.65`: rebuild `comercial-bot`, `comercial-worker`, `cctv-operational-worker`.

## Plan de rollback

Detener/quitar el servicio `comercial-worker` (el bot de WhatsApp en `comercial-bot` no depende
de él) y revertir el paso `siissPointsSync` de `run-operational-cycle.js` si el sync horario da
problemas. Ningún cambio de esquema que revertir.

## Verificación

- `cd cctv-automation-final && npm test`.
- Docker local: logs de `comercial-worker` mostrando ciclos cada minuto dentro del horario, y
  silencio fuera de él (probar cambiando `POINTS_OPERATIONAL_WINDOW_START/_END` a un rango que
  incluya/excluya la hora actual, para no tener que esperar hasta las 05:30/22:30 reales).
- Confirmar en Supabase que `puntos_venta.updated_at`/`last_online_at` avanzan solos sin pedir
  nada por WhatsApp.
- Confirmar que un reporte de WhatsApp pedido a mano sigue funcionando idéntico (mismo formato,
  mismo tiempo de respuesta aproximado).
