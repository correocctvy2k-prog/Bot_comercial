# SPEC 0010 — CCTV / Eventos diarios: interpretación operativa por ventanas + ping

- **Estado:** Validada
- **Autor:** equipo Skylab (@jbeltran)
- **Fecha:** 2026-09-09
- **Módulos afectados:** `cctv-automation-final` (`engine.js`, `api/server.js` →
  `dailyEventsData`, `platform/operational-event-policy.js`, `platform/operational-closure.js`,
  `tests/`); `CRM_Frontend/src/pages/CctvModule.jsx` (vista "Eventos diarios").
- **Rama:** `fix/0010-eventos-diarios-interpretacion`

## 1. Problema

En la pestaña **Eventos diarios** (Seguridad Electrónica):

1. **Detecciones que salen como "DESCONOCIDO" siendo la apertura del punto.** Varias
   detecciones matinales de OFICINA PRINCIPAL aparecen con badge "DESCONOCIDO" porque
   `engine.js:classify()` solo marca `APERTURA`/`CIERRE` cuando el correo es *tripwire* o el
   campo `Alarma` dice literalmente "apertura"/"cierre". Una detección humana / genérica a
   las 07:00 no se interpreta como apertura.
2. **Aperturas en horario nocturno y cierres en la mañana.** El `event_type` sale 100 % del
   nombre de la alarma, sin lógica horaria. Una alarma llamada "Cierre Tienda X" que dispara
   a las 07:00 se cuenta como cierre; el gráfico "Actividad CCTV por hora" muestra cierres a
   las 7 y aperturas a las 20.

La fusión CCTV + ping SIIS ya existe pero **solo en la vista de detalle de punto**
(`locationDetail`/`buildOperationalTimeline`), no en "Eventos diarios".

## 2. Objetivo

Que "Eventos diarios" interprete la operación de cada punto por **cuatro ventanas** usando el
**ping SIIS como vector primario** y el CCTV como **apoyo / prueba visual**, mostrando el
evento real (apertura mañana, cierre mediodía, apertura tarde, cierre noche, o anomalía) en
vez del `event_type` crudo — y detectando inconsistencias de configuración de las
notificaciones CCTV en los puntos que sí tienen cámara.

### Salvedad clave (2026-09-10)

- **No todos los puntos tienen CCTV que notifique por detección; todos sí tienen ping.**
- **El ping SIIS es el primer vector de detección**; el CCTV es apoyo para prueba visual.
- Se irán integrando más puntos con CCTV con el tiempo.
- Por tanto: las fases (apertura/cierre) se derivan del **ping**; el evento CCTV se **adjunta**
  como evidencia a la fase que corresponda. La "inconsistencia de configuración" solo aplica a
  puntos con `cctv_coverage_status` ≠ `NONE` (los que deberían haber notificado y no lo
  hicieron). Un punto sin CCTV es `PING_ONLY`, nunca una anomalía por "falta de detección".

## 3. Modelo operativo

Los puntos tienen **jornada partida**. Ventanas por defecto (hora local Bogotá,
configurables por env):

| Fase | Ventana | Env |
|------|---------|-----|
| `APERTURA_MANANA` | 05:00 – 09:30 | `CCTV_WIN_OPEN_AM` (`"05:00-09:30"`) |
| `CIERRE_MEDIODIA` | 13:00 – 14:00 | `CCTV_WIN_CLOSE_MIDDAY` (`"13:00-14:00"`) |
| `APERTURA_TARDE` | 15:00 – 17:00 | `CCTV_WIN_OPEN_PM` (`"15:00-17:00"`) |
| `CIERRE_NOCHE` | 18:00 – 22:00 | `CCTV_WIN_CLOSE_PM` (`"18:00-22:00"`) |

Tolerancia ping↔evento: `CCTV_PING_EVENT_TOLERANCE_MIN` (por defecto 20 min).

## 4. Alcance

### 4.1 Interpretación por punto y día (backend)

Para cada punto y día, con la serie de **pings SIIS** (`stg_siis_locations.online` por
`siis_sync_run`, ordenada) como base y las **detecciones CCTV** (cualquier tipo salvo
`MOTION`/`MOVIMIENTO`/`DISCARDED` y fase `FIN`) como apoyo:

- **`coverage`** por punto: `WITH_CCTV` **solo si el punto ha enviado al menos un correo
  Dahua en los últimos 30 días** (= el equipo realmente notifica por detección). Tener
  cámaras (`cctv_coverage_status='ACTIVE'`) no basta: muchos puntos graban pero no mandan
  avisos. El resto es `PING_ONLY`.
- **Por cada una de las 4 ventanas**, la fase se resuelve así:
  - **Ping**: transición `offline→online` en la ventana de apertura, o `online→offline` en la
    de cierre (o el primer/último ping *online* del día para AM/noche). Ese timestamp es
    `phase.at` con `source: 'PING'`.
  - **CCTV**: la **primera** detección CCTV que cae en la ventana (cualquier `event_type`) se
    adjunta como `phase.evidence` (prueba visual). Si no hubo transición de ping pero sí
    detección CCTV → `phase.at` = la detección, `source: 'CCTV'`.
- **Inconsistencia de configuración** (solo `coverage='WITH_CCTV'`):
  - Ping marca actividad en una ventana pero **no** hay detección CCTV → `missingDetection`
    de esa fase + `notificationConfigInconsistency`.
  - Hay detección CCTV pero desfasada del ping > `CCTV_PING_EVENT_TOLERANCE_MIN` →
    `notificationConfigInconsistency` con el gap.
- **Punto sin apertura**: no hay ping *online* en las ventanas de apertura pero sí actividad
  nocturna → `interpretation: 'CIERRE_SIN_APERTURA'` (el punto se abrió sin registrarse).
- **Detección/transición fuera de las 4 ventanas** → `anomalies[]` (entra en "requieren
  revisión"). Aquí caen los "cierres a las 7am / aperturas a las 20h" que hoy confunden.
- **Apertura tardía / cierre temprano**: si `phase.at` cae después del fin de su ventana (o
  después del `custom_open_time` del punto, ver §4.3) → `lateBy: <min>`.

Salida nueva en `dailyEventsData` (aditiva): por cada punto, un objeto
`operationalDay = { date, phases: { APERTURA_MANANA: {...}, CIERRE_MEDIODIA: {...}, ... },
missingDetections: [...], notificationConfigInconsistency: bool, anomalies: [...] }`.
`evidenceItems` y `pointOperations` pasan a usar `phase`/`interpretation` para su etiqueta.

### 4.2 Vista "Eventos diarios" (frontend)

- El badge de cada tarjeta muestra la fase interpretada: **"Apertura mañana"**, **"Cierre
  mediodía"**, **"Apertura tarde"**, **"Cierre noche"**, **"Fuera de ventana"**,
  **"Cierre sin apertura detectada"**, **"Config. de notificación inconsistente"**,
  **"Movimiento"** — no más "DESCONOCIDO" para lo que es una apertura.
- El gráfico **"Actividad CCTV por hora"**: `openings` = aperturas interpretadas (AM + tarde),
  `closures` = cierres interpretados (mediodía + noche). Desaparecen los cierres a las 7am.
- Panel/aviso de **inconsistencias de configuración** (puntos con `notificationConfigInconsistency`).

### 4.3 Horario por punto (frontend)

`CctvModule.jsx` ya trae `pointContext.schedules` (`zone_schedules` de Supabase:
`custom_open_time`/`custom_close_time`/`has_custom_schedule` + horario base por zona). Se usa
para refinar "abrió tarde N min" / "cerró temprano" comparando contra la fase interpretada del
backend. El backend usa solo las ventanas globales (no tiene acceso a `zone_schedules`).

## 5. No-objetivos

- **No** se cambia el ingreso ni el parseo de correos (`index.js`, `parseBody`); solo la
  **interpretación** posterior.
- **No** se reescribe `engine.js:classify()` entero — se mantiene su salida (`categoria`,
  `tipo`, `fase`) y se añade una capa de interpretación operativa encima
  (`operational-event-policy.js`).
- **No** se sincroniza `zone_schedules` al SQLite de CCTV en esta spec (el refinamiento por
  punto queda en el frontend). Queda como mejora futura.
- **No** se tocan las otras pestañas (Alarmas, Mantenimiento, Proyecto, Visitantes).
- **No** se cambia el esquema de `cctv_events` ni de la BD.

## 6. Criterios de aceptación

- [ ] Una detección matinal (cualquier `event_type`) dentro de 05:00–09:30 aparece como
      **"Apertura mañana"**, no "DESCONOCIDO".
- [ ] Un evento con `event_type='CLOSING'` a las 07:00 **no** cuenta como cierre; queda como
      "Fuera de ventana" o se reinterpreta como la apertura si es la primera del día.
- [ ] "Actividad CCTV por hora": cero cierres antes de las 13:00 y cero aperturas después de
      las 17:00 (salvo marcadas como anomalía).
- [ ] Un punto con primer ping *online* a las 06:30 y sin detección CCTV en la ventana de
      apertura sale listado con **inconsistencia de configuración**.
- [ ] Primera detección del día a las 20:00 sin apertura previa → **"Cierre sin apertura
      detectada"**, con apertura/cierre estimados por ping.
- [ ] Umbrales configurables por env; con los valores por defecto reproducen §3.
- [ ] `cd cctv-automation-final && npm test` verde (con casos nuevos de interpretación).
- [ ] Verificado en local y en `192.168.8.65` con datos reales de OFICINA PRINCIPAL.

## 7. Restricciones

- Interpretación en la capa `platform/operational-event-policy.js` (con tests propios);
  `dailyEventsData` la consume. No lógica de negocio nueva embebida en el `switch` de rutas.
- Hora local siempre `America/Bogota` (ya se usa `Intl.DateTimeFormat` con esa TZ).
- `platform/operational-closure.js` (corte diario) debe seguir cuadrando: revisar que consuma
  la fase interpretada y no el `event_type` crudo, o dejar su comportamiento y solo cambiar la
  vista — decidir en `plan.md`.

## 8. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| La interpretación por ventanas oculta un evento real raro (p. ej. apertura de emergencia 03:00) | Medio | "Fuera de ventana" no se descarta: se muestra como anomalía en "requieren revisión" |
| Puntos con horario distinto al estándar marcados como "tardíos" en falso | Medio | El refinamiento por `zone_schedules` (§4.3) ajusta; los env permiten mover las ventanas globales |
| `operational-closure.js` deja de cuadrar si cambia el criterio de apertura/cierre | Alto | Plan explícito: o se adapta el cierre a la fase interpretada, o se aísla la vista sin tocar el cierre |
| Menos "eventos reconocidos" en el `summary` al reclasificar DESCONOCIDO | Bajo | `summary.recognized` debe **subir**: DESCONOCIDO→Apertura es reconocer más |

## 9. Impacto en producción

- **Usuario:** "Eventos diarios" pasa a leerse en términos operativos reales (4 fases) y
  expone dónde la configuración de notificaciones CCTV no coincide con la operación (ping).
- **Despliegue:** rebuild de `cctv-api` (+ `cctv-operational-worker` si `operational-closure`
  cambia) y `crm-frontend`. Sin migraciones.
- **Rollback:** `git revert` del merge + rebuild.
