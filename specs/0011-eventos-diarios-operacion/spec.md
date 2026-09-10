# SPEC 0011 — CCTV / Eventos diarios: operación por zona, conciliación y resolución

- **Estado:** Validada (2026-09-10)
- **Autor:** equipo Skylab (@jbeltran)
- **Fecha:** 2026-09-10
- **Módulos afectados:** `cctv-automation-final` (`api/server.js` → `dailyEventsData` y rutas
  nuevas, `platform/`, migración de esquema, `tests/`); `CRM_Frontend/src/pages/CctvModule.jsx`
  (vista "Eventos diarios").
- **Rama:** `feat/0011-eventos-diarios-operacion`
- **Depende de:** spec 0010 (interpretación por ventanas + ping, ya en producción).

## 1. Problema / contexto

Tras 0010, "Eventos diarios" ya interpreta la jornada por ventanas con el ping como vector
primario. Revisando en producción quedan carencias de **lectura operativa** y de **cierre del
ciclo** (ver algo mal ≠ poder resolverlo):

1. **La tarjeta ampliada de una evidencia no muestra el detalle del correo.** Un punto como
   OFICINA PRINCIPAL genera varias "Apertura mañana" seguidas y no hay forma de ver, sin salir
   a la bandeja, qué disparó cada una: `Evento de alarma:` (`payload.rawEventType`),
   `canal de entrada` (`payload.channelRaw`), `Alarma:` (`payload.alarm`). Sin eso no se sabe
   si hay una regla/cámara mal configurada.
2. **El cuadro "Identidades por conciliar" y el de "Movimiento consolidado" son ruido
   permanente.** Hoy: 8 nombres / 32 eventos sin vincular (Independencia 3931, 19 con 35,
   Parque Prado 2301…). No hay forma de resolverlos desde la vista; el operador tiene que ir a
   otro lado. Y el panel de movimiento consolidado ya no aporta a la lectura de jornada.
3. **El cuadro "Inconsistencias de notificación CCTV" solo informa, no resuelve.** El operador
   ve "el ping dice que operó pero el CCTV no notificó" y no puede hacer nada con eso desde ahí.
4. **Fuentes e iconos de las tarjetas son pequeños** para una pantalla de operación /
   monitoreo.
5. **Falta una vista de estado por zona.** No hay un panorama de "en la zona PALMIRA, de N
   puntos, cuántos abrieron, cuántos tarde, cuántos siguen cerrados".

## 2. Objetivo

Que "Eventos diarios" sea una **consola operativa**: se lee el estado de cada zona de un
vistazo, se ve el detalle técnico de cada evidencia, y las dos cosas accionables
(identidades sin vincular, inconsistencias de notificación) **se resuelven desde la misma
vista** y dejan de aparecer.

## 3. Alcance

### 3.1 Tarjeta de evidencia ampliada — detalle del correo (frontend)

Al abrir una evidencia (`setEvidence(item)` / modal existente), además de la imagen mostrar:

| Campo mostrado | Origen |
|---|---|
| **Evento de alarma** | `item.payload.rawEventType` (p. ej. "Tripwire fin", "Detección humana") |
| **Canal de entrada** | `item.payload.channelRaw` (p. ej. "Pto_Venta_21595") |
| **Alarma** | `item.payload.alarm` (nombre de la regla en el NVR/DSS) |
| Asunto del correo | `item.payload.subject` |
| Remitente / IP | `item.payload.sender`, `item.payload.sourceIp` |
| Fase interpretada + retraso | `item.operationalPhaseLabel`, `item.operationalLateBy` |

`dailyEventsData` ya devuelve `payload` en `evidenceItems`; no cambia el backend. Si algún
campo viene vacío se omite la fila.

### 3.2 Tamaño de fuentes e iconos de las tarjetas (frontend)

Subir un escalón la tipografía y los iconos de las tarjetas de la vista (grid de evidencias,
lista "Señales CCTV de jornada", panel de inconsistencias, tarjetas de zona nuevas):
`text-[9px]/[10px]` → `text-xs/sm`; iconos de badge `12` → `16`; badges de fase con más
padding. Respetar el design-system (`CRM_Frontend/docs/design-system.md`) y
`prefers-reduced-motion`. Sin cambios de layout, solo escala legible.

### 3.3 Conciliación de identidades desde la vista (backend + frontend)

**Decisión (2026-09-10): ambas vías.**

**3.3.a — Limpieza puntual (una vez).** Conciliar los 8 nombres pendientes actuales creando
`location_aliases` (infra ya existente, 573 aliases). Mapeos propuestos (confirmar los
dudosos en `tasks.md` antes de aplicar):

| storeRaw | Punto canónico (confirmado 2026-09-10) |
|---|---|
| Independencia 3931 | INDEPENDENCIA (PALMIRA) |
| Metro 2242 | CARREFOUR METRO (PALMIRA) |
| 19 con 35 | LA 19 CON 35 (PALMIRA) |
| Parque Prado 2301 | PARQUE EL PRADO (PALMIRA) |
| Parq Bolivar 3333 | PARQUEADERO PARQUE BOLIVAR (PALMIRA) |
| Ant. Ppal 3054 | ANTIGUA PPAL II (PALMIRA) |
| Antigua Ppal cll31#32 29 | ANTIGUA PPAL II (PALMIRA) |
| Antigua Ppal Rozo | ANTIGUA PRINCIPAL ROZO (ROZO) |

**3.3.b — UI de conciliación en la vista.** Panel "Identidades por conciliar" pasa de lista
muerta a accionable: por cada `storeRaw` pendiente, un buscador/selector de punto canónico
(catálogo `locations` activo) + botón **Vincular** → `POST /api/cctv/events/identity/link`
(endpoint existente, `{alias, locationId}`, crea alias durable + override + audit_log).
Tras vincular, la fila desaparece; cuando la lista llega a 0 el cuadro no se renderiza.

**3.3.c — Quitar "Movimiento consolidado".** Se elimina el panel del frontend. En el backend,
`motionBursts` se mantiene en la respuesta por si otra vista lo usa (verificar en `plan.md`);
si nadie más lo consume, se recorta a `motionBursts: motionBursts.length` en el `summary`.

### 3.4 Resolución de inconsistencias de notificación (backend + frontend)

**Esquema nuevo** (migración en `db/` o `scripts/` según el patrón del repo):

```sql
CREATE TABLE cctv_notification_resolutions (
  id              TEXT PRIMARY KEY,
  location_id     TEXT NOT NULL REFERENCES locations(id),
  resolution      TEXT NOT NULL,           -- ver enum abajo
  scope           TEXT NOT NULL,           -- 'PERSISTENT' | 'DATE'
  effective_date  TEXT,                    -- solo si scope='DATE' (YYYY-MM-DD)
  note            TEXT,
  decided_by      TEXT NOT NULL,
  decided_at      TEXT NOT NULL,
  active          INTEGER NOT NULL DEFAULT 1
);
```

**Opciones de resolución (enum `resolution`) — confirmadas con el usuario:**

| Opción | `resolution` | `scope` | Efecto |
|---|---|---|---|
| **Punto solo-ping (sin CCTV real)** | `PING_ONLY` | `PERSISTENT` | El punto deja de evaluarse como `WITH_CCTV` en `interpretPointDay` (override sobre la regla "envió Dahua en 30 d"). No vuelve a salir como inconsistente. |
| **Cámara sin notificación configurada** | `MISCONFIGURED_NO_NOTIFY` | `PERSISTENT` | Se marca el punto como "config. pendiente"; se **oculta** de inconsistencias activas y aparece en una sub-lista "en seguimiento". Botón opcional **"Crear tarjeta de mantenimiento"** (Trello) — ver §5 no-objetivos. |
| **Falso positivo / ignorar por hoy** | `FALSE_POSITIVE` | `DATE` | Se archiva solo para `effective_date`; al día siguiente, si reincide, vuelve a aparecer. |

**API nueva:**
- `POST /api/cctv/notifications/:locationId/resolve` — body
  `{ resolution, scope, effectiveDate?, note? }`, header `x-actor`. Inserta en
  `cctv_notification_resolutions` + `audit_log`. Idempotente por
  `(location_id, resolution, effective_date)`.
- `POST /api/cctv/notifications/:locationId/reopen` — `active=0` a la resolución vigente
  (por si el operador se equivoca).

**`dailyEventsData`:** al construir `notificationInconsistencies`, filtra los puntos con
resolución vigente (`PERSISTENT` activa, o `DATE` para la fecha consultada). `interpretPointDay`
recibe el set de `PING_ONLY` forzados y lo respeta al fijar `coverage`. La respuesta gana
`notificationsInFollowUp[]` (los `MISCONFIGURED_NO_NOTIFY`) y `summary.notificationsResolved`.

**Frontend:** cada fila del panel de inconsistencias gana un menú (3 opciones) + campo de nota;
al resolver, la fila sale de "activas". Sub-sección plegable "En seguimiento" para las de
cámara mal configurada. Enlace "reabrir".

### 3.5 Tarjetas por zona con cubos de estado (backend + frontend)

**Backend — `dailyEventsData` gana `zoneBoards[]`:**

```
zoneBoards: [
  { zone: 'PALMIRA', total: N,
    counts: { ON_TIME: n, LATE: n, CLOSED: n, IDLE: n, ANOMALY: n },
    points: [ { locationId, name, state, openingAt, lateBy } ] },
  ...,
  { zone: null, ... }   // "Sin zona" como tablero propio
]
```

**Estado por punto y día (`state`) — 5 estados confirmados:**

| `state` | Color cubo | Regla (sobre el `operationalDay` de 0010) |
|---|---|---|
| `ON_TIME` | Verde | Tiene fase de apertura (`APERTURA_MANANA`/`APERTURA_TARDE`) con `lateBy === 0`. |
| `LATE` | Ámbar | Tiene fase de apertura con `lateBy > 0`. |
| `CLOSED` | Azul | Tiene fase de cierre (`CIERRE_NOCHE`) y **no** de apertura del día, o ya pasó su ventana de cierre. |
| `IDLE` | Gris | `interpretation === 'SIN_ACTIVIDAD'` (ping presente, sin transición ni evidencia). |
| `ANOMALY` | Rojo | `interpretation === 'CIERRE_SIN_APERTURA'` o `anomalies.length > 0` (detección/transición fuera de toda ventana). |

Prioridad si aplica más de uno: `ANOMALY` > `LATE` > `CLOSED` > `ON_TIME` > `IDLE`.

**Frontend:** una tarjeta por zona (grid responsive). Encabezado: nombre de zona + `total` +
mini-leyenda. Cuerpo: rejilla de cubos (~14 px, `title`/tooltip con nombre del punto, hora de
apertura y `lateBy`). Click en un cubo → resalta el punto en la lista "Señales CCTV de
jornada" (o abre su detalle si ya existe ese flujo). Orden de zonas por `total` desc; "Sin
zona" al final. Respeta `prefers-reduced-motion` (sin animación de entrada de cubos).

## 4. Criterios de aceptación

- [ ] Al ampliar una evidencia se ven **Evento de alarma**, **Canal de entrada** y **Alarma**
      con los valores del correo; filas vacías se omiten.
- [ ] Tipografía/iconos de las tarjetas suben un escalón sin romper el layout ni el
      design-system; `prefers-reduced-motion` respetado.
- [ ] Los 8 `storeRaw` pendientes actuales quedan vinculados (alias durable) y el cuadro
      "Identidades por conciliar" desaparece cuando la lista llega a 0.
- [ ] Desde la vista se puede vincular un `storeRaw` a un punto canónico y la siguiente carga
      ya no lo lista.
- [ ] El panel "Movimiento consolidado" ya no se renderiza.
- [ ] Cada inconsistencia se puede resolver con una de las 3 opciones + nota; `PING_ONLY` y
      `MISCONFIGURED_NO_NOTIFY` no reaparecen; `FALSE_POSITIVE` solo se silencia esa fecha.
- [ ] Existe "reabrir" para una resolución.
- [ ] `zoneBoards[]` con los 5 estados y la prioridad definida; "Sin zona" es un tablero.
- [ ] Los conteos de cada tablero de zona cuadran con la lista "Señales CCTV de jornada"
      filtrada por esa zona.
- [ ] `cd cctv-automation-final && npm test` verde con casos nuevos (estado por punto,
      filtrado por resolución, `coverage` forzado a `PING_ONLY`).
- [ ] Verificado en local (`127.0.0.1:3003`) y en `192.168.8.65` con datos reales.

## 5. No-objetivos

- **No** se crea automáticamente la tarjeta de mantenimiento en Trello: la opción
  `MISCONFIGURED_NO_NOTIFY` solo **marca**; el botón "Crear tarjeta" queda como enganche para
  una spec posterior (necesita write-API de Trello, hoy solo se lee).
- **No** se toca el parseo de correos ni `engine.js` (spec 0010 ya fijó la interpretación).
- **No** se rediseñan las otras pestañas (Alarmas, Mantenimiento, Proyecto, Visitantes).
- **No** se sincroniza `zone_schedules` al SQLite (el refinamiento por horario de punto sigue
  en el frontend, como en 0010 §4.3).
- **No** se añade autenticación por usuario a las rutas nuevas: se mantiene el `x-actor` por
  header como el resto de mutaciones de `cctv-api`.

## 6. Restricciones

- Lógica de estado por punto y de filtrado por resolución en `platform/` (con tests), no
  embebida en el `switch` de rutas de `server.js`.
- Hora local siempre `America/Bogota`.
- Migración de esquema idempotente y con el patrón que ya use el repo (revisar en `plan.md`
  si hay `migrations/` o se hace por `CREATE TABLE IF NOT EXISTS` al arranque).
- `motionBursts` no se elimina del backend sin verificar que ninguna otra vista lo consume.

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| Migración de esquema en prod (`.65`) sobre SQLite en uso | Alto | `CREATE TABLE IF NOT EXISTS` idempotente; backup del `.db` antes del deploy (ya es práctica del repo); sin `ALTER` destructivo |
| Forzar `PING_ONLY` oculta una inconsistencia real futura (le instalan cámara después) | Medio | "Reabrir" siempre disponible; la resolución queda en `audit_log`; revisión periódica de `notificationsInFollowUp` |
| Mapeo de identidad equivocado en la limpieza puntual | Medio | Confirmar los dudosos en `tasks.md`; alias reversible; `audit_log` |
| `zoneBoards` infla la respuesta de `events/daily` (ya ~6 s / ~420 KB) | Medio | `points[]` slim (solo campos del cubo); reutiliza `operationalDays` ya calculado, sin queries nuevas |
| Subir tamaños rompe el grid en pantallas chicas | Bajo | Cambios por breakpoint; smoke visual en 1280 y 1920 |

## 8. Impacto en producción

- **Usuario:** "Eventos diarios" pasa a consola operativa: estado por zona, detalle técnico
  por evidencia, y cierre de las dos colas accionables desde la misma pantalla.
- **Despliegue:** migración de esquema (tabla nueva) + rebuild `cctv-api` y `crm-frontend` +
  `docker restart crm-frontend` (lección 0008). La limpieza de identidades (3.3.a) se corre
  una vez contra la BD de prod tras el deploy.
- **Rollback:** `git revert` del merge + rebuild. La tabla `cctv_notification_resolutions`
  queda huérfana pero inerte (no la lee el código viejo). Los alias creados son datos válidos,
  no se revierten.
