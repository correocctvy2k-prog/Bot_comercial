# SPEC 0015 — Monitor de puntos en tiempo real (ping) + sync SIISS horario

> **✅ Bloqueador de build resuelto (2026-09-23):** el `Dockerfile` raíz (`node:20-bullseye`)
> no podía reconstruirse — Debian bullseye llegó a EOL, `apt-get update` daba 404 en
> `deb.debian.org/debian-security` (previo a esta spec, ya documentado en memoria del
> proyecto). La propia imagen de Node ya trae comentadas las líneas de
> `snapshot.debian.org` con fecha fija para este caso exacto; se activan y se apagan las
> líneas "en vivo" (`sed` nuevo al inicio del `Dockerfile`, con `[check-valid-until=no]`
> porque el Release firmado del snapshot expira con el tiempo). Verificado con build real:
> `comercial-bot` y `comercial-worker` arrancan y corren sin crashear (ver `tasks.md`).

- **Estado:** Implementada y verificada en Docker local (2026-09-23), pendiente PR
- **Autor:** Claude (a pedido de ia_gerencia@ganepalmira.com.co)
- **Fecha:** 2026-09-23
- **Módulos afectados:** Bot Comercial (`src/`, raíz del repo — nuevo worker
  `comercial-worker`), `cctv-automation-final` (`run-operational-cycle.js`)
- **Rama:** `feat/0015-monitor-puntos-tiempo-real` (apilada sobre `feat/0014-siiss-sync-directo`,
  ver §7 — depende de `platform/siis-points-sync.js` y `scripts/sync-siiss-points.js` de esa spec)
- **PR:** <pendiente, después de mergear 0014>

## 1. Problema / oportunidad

Al usar el botón "Sync SIISS" (spec 0014) se detectó un caso real: HELADERIA SEMBRADOR tenía
`puntos_venta.ip` desactualizada, y el indicador "BOT" (ping propio) seguía mostrando el punto
caído días después de que la IP real ya funcionaba. Investigando la causa:

- El "BOT" (`point.active`/`latency`/`last_online_at` en `puntos_venta`) lo llena
  `monitor_puntos_wpp.py`, invocado **solo bajo demanda** por `src/services/monitor.service.js`
  cuando alguien pide un reporte de puntos por WhatsApp. No hay cron ni intervalo — si nadie pide
  el reporte, el dato queda congelado indefinidamente, sin importar que la IP ya se haya
  corregido.
- El sync con SIISS (spec 0014) también es 100% manual (botón), sin repetirse solo.
- Confirmado además (hallazgo aparte, no causado por esto): el servicio Docker `comercial-worker`
  (`docker-compose.yml`, `command: node src/worker.js`) apunta a un archivo que **no existe** en
  el repo — bug dormido, sin relación con el bot de WhatsApp.

Decisión del usuario (2026-09-23): el usuario necesita datos en tiempo real. Pide separar el
monitoreo del bot de WhatsApp (para no arriesgar su funcionamiento) en un proceso dedicado con
ping constante, y automatizar el sync SIISS con menor frecuencia para no saturar su API.

## 2. Objetivo

`puntos_venta.active`/`latency`/`last_online_at` reflejan el estado real de cada punto con **como
mucho 1 minuto de atraso**, y `siiss_active`/`siiss_last_sync` con **como mucho 1 hora**, ambos
solo durante el horario de operación (05:30–22:30, todos los días) — sin tocar el flujo de
WhatsApp bajo demanda.

## 3. Alcance

- **`src/worker.js`** (nuevo — resuelve además el bug dormido de `comercial-worker`): cron cada
  minuto (`node-cron`, ya es dependencia del proyecto), gateado a horario de operación, que
  invoca `monitor_puntos_wpp.py --json --tipo ping_only` (nuevo modo, ver abajo) en un proceso
  Python separado del que dispara el bot de WhatsApp.
- **`monitor_puntos_wpp.py`**: nuevo valor `--tipo ping_only` que ejecuta únicamente
  `load_targets_from_supabase` → `scan_from_df_parallel` → `update_supabase_results`, sin
  `build_report_text` ni gráfico. Aditivo: no toca los `--tipo` que ya usa el bot de WhatsApp
  (`standard`/con `--zona`). (Nota: `scan_and_update_known_haplites`, de spec 0013, no existe
  todavía en la base de esta rama — cuando 0013 se mergee, revisar si debe sumarse también al
  modo `ping_only`.)
- **`src/services/businessHours.service.js`** (nuevo): ventana de horario configurable por env
  (`POINTS_OPERATIONAL_WINDOW_START`/`_END`, default `05:30`/`22:30`, America/Bogota).
- **`cctv-automation-final/platform/business-hours.js`** (nuevo, mismo cálculo que el anterior
  pero como módulo independiente — ver §6 por qué no se comparte un solo archivo entre los dos
  proyectos) + test.
- **`cctv-automation-final/scripts/run-operational-cycle.js`**: nuevo paso `siissPointsSync`,
  gateado por `operationalSourceDue('siissPointsSync', 60)` **y** horario de operación, que
  corre `scripts/sync-siiss-points.js` (ya existe, spec 0014).
- `docker-compose.yml`: **sin cambios** — `comercial-worker` ya está declarado, solo faltaba el
  archivo.

## 4. No-objetivos

- No se toca `monitor.service.js` ni el flujo de WhatsApp bajo demanda (`runMonitor`,
  `runMonitorAndSend`, `buildArgs`) — el nuevo modo es aditivo y usa su propio spawn en
  `worker.js`, sin compartir código con el camino del bot.
- No se resuelve aquí la falta de un campo "IP secundaria" en `puntos_venta` (spec 0014, ya
  documentado): SIISS no expone ninguna IP por su API (`estacionesByPing` confirmado sin campo de
  IP), así que seguimos sin poder comparar IPs entre las dos fuentes — la discordancia sigue
  siendo "dos resultados de ping distintos", no "dos IPs distintas".
- No se agrega distinción pico/normal de cadencia (como `siis-observer-policy.js` para el otro
  flujo SIIS): un solo horario fijo, tal como lo pidió el usuario.
- No se toca la UI de Points.jsx en esta spec (los indicadores/tooltip ya se ajustaron en 0014).

## 5. Criterios de aceptación

- [ ] `docker compose up` con `comercial-worker` corriendo sin crashear (ya no busca un archivo
      inexistente).
- [ ] Durante el horario de operación, `puntos_venta.active`/`latency`/`last_online_at` se
      actualizan solos cada ~1 minuto (verificable por `updated_at` avanzando sin pedir nada por
      WhatsApp).
- [ ] Fuera del horario de operación, el worker no pinguea (verificable por log / por
      `updated_at` sin avanzar).
- [ ] `scripts/sync-siiss-points.js` corre solo una vez por hora dentro del horario, vía
      `run-operational-cycle.js` (verificable en `operational-cycle.jsonl`).
- [ ] El bot de WhatsApp sigue funcionando exactamente igual (mismo `--tipo standard`/zona, sin
      cambios de comportamiento ni de tiempos de respuesta).
- [ ] `cctv-automation-final`: `npm test` en verde (incluye test nuevo de `business-hours.js`).
- [ ] Verificado en Docker local (`comercial-bot`, `comercial-worker`, `cctv-operational-worker`).

## 6. Restricciones de arquitectura y diseño

- `cctv-automation-final` y el proyecto raíz (`comercial-bot`) son paquetes Node
  **independientes** (`package.json`/`node_modules` propios, se despliegan y versionan aparte).
  Aunque el `Dockerfile` raíz copia todo el monorepo y en local hay un bind-mount que técnicamente
  permitiría un `require` cruzado, se trata como antipatrón: la ventana de horario se duplica como
  un módulo pequeño e independiente en cada proyecto (~20 líneas, sin dependencias) en vez de
  importar de uno a otro.
- No se agregan dependencias npm nuevas: `node-cron` ya está en `package.json` de la raíz (sin
  uso previo en el código).
- Reutilizar `_detect_and_log_transitions` / `update_supabase_results` /
  `scan_and_update_known_haplites` de `monitor_puntos_wpp.py` tal cual existen — no reescribir la
  lógica de ping ni de paralelismo (`ThreadPoolExecutor`, `MAX_WORKERS=35`).

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| Rama apilada sobre `feat/0014` (sin mergear aún) — mismo patrón que `LL-0002` | Cadena de ramas sin fusionar si se posterga el merge | Recomendado: abrir y mergear el PR de 0014 primero, luego el de 0015, en orden — no seguir apilando más ramas encima |
| Ciclo de ping se solapa si tarda más de 1 minuto (~370 puntos, 35 workers en paralelo) | Dos procesos Python pingueando a la vez, uso de red/CPU duplicado | Flag `running` en `worker.js`: si el ciclo anterior sigue vivo, se omite el tick (se loguea, no se acumulan procesos) |
| Ping automático (cada minuto) + reporte de WhatsApp bajo demanda corren al mismo tiempo | Ambos son `subprocess` independientes escribiendo a Supabase — sin conflicto de datos (mismo `upsert` idempotente), solo ping duplicado ocasional | Aceptado, sin lock cruzado (bajo impacto, evento raro) |
| `comercial-worker` llevaba tiempo "roto" sin que nadie lo notara (sin healthcheck ni alerta) | Si esta spec introduce un bug real en `worker.js`, podría pasar igual de desapercibido | `restart: always` ya existe; agregar logs claros por ciclo (`[points-ping-worker] ...`) para que sea visible en `docker logs comercial-worker` |

## 8. Impacto en producción

`comercial-worker` empieza a correr por primera vez (hoy crashea o no hace nada útil). Nuevo
tráfico de red: ~370 pings ICMP por minuto durante horario de operación (antes solo ocurría
cuando alguien pedía un reporte por WhatsApp). Sync SIISS pasa de manual a automático cada hora
en horario de operación. Sin cambios de esquema Supabase. Rollback: revertir `docker-compose.yml`
no hace falta (el archivo `src/worker.js` es aditivo); alcanza con detener/quitar el servicio
`comercial-worker` si el ping constante genera problemas de red, y remover el paso
`siissPointsSync` de `run-operational-cycle.js`.
