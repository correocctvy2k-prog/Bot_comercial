# Documentación técnica

Referencia interna del **Panel Gerencial de Chatbots**. Para instalación y
despliegue, ver el [`README.md`](../README.md). Este documento cubre el modelo de
datos, las definiciones de cada métrica y el detalle módulo por módulo.

- **Versión:** 1.0.0 · **Stack:** Node.js ≥ 18 · Express 5 · Chart.js 4 (CDN)
- **Bots:** `oskitar` (soporte interno) · `betty` (atención a clientes)

---

## 1. Panorama

```
server.js ──┬── por cada bot (config.bots):
            │     lib/logSource  → lee archivo(s)  (local | ssh | compuesta)
            │     lib/archive    → vuelca al histórico ./data/<bot>.<key>.jsonl
            │     lib/parser*    → líneas → eventos normalizados
            │     lib/analytics* → eventos → MODELO (KPIs, series, tablas…)
            │     lib/privacy    → enmascara teléfonos/cédulas en la respuesta
            │
            ├── API JSON  (/api/bots, /api/<bot>/...)
            ├── SSE        (/api/<bot>/stream)   avisa "update" en cada recálculo
            └── estáticos  (public/index.html)
```

Cada bot mantiene en memoria: la fuente, el/los `Archive`, los eventos
normalizados (solo Oskitar, para poder filtrar) y el **modelo cacheado**. El
modelo se recalcula al detectar cambios en el log y en cada `POST /refresh`.

---

## 2. Módulos

| Archivo | Responsabilidad | Exporta |
|---|---|---|
| `config.js` | Carga `.env`, arma `config` y la lista `config.bots`. | objeto `config` |
| `server.js` | Express, rutas, caché de modelos, SSE, orquestación multi-bot. | — |
| `lib/logSource.js` | Abstracción de la fuente del log. | `createBotSource`, `createFileSource`, `LocalFileLogSource`, `RemoteSshLogSource`, `MultiLogSource`, `createLogSource` |
| `lib/archive.js` | Histórico acumulativo append-only con deduplicación. | `Archive` |
| `lib/parser.js` | `conversations.log` → eventos normalizados (Oskitar). | `parseLog` |
| `lib/analytics.js` | Eventos de Oskitar → modelo. | `buildModel`, `classify`, `CATEGORY_RULES` |
| `lib/parserBetty.js` | `messages.log` + `state-manager.log` → eventos (Betty). | `parseBettyMessages`, `parseBettyState` |
| `lib/analyticsBetty.js` | Eventos de Betty → modelo. | `buildBettyModel`, `classifyIntent`, `FLOW_NAMES` |
| `lib/privacy.js` | Enmascarado de teléfonos y cédulas. | `maskPhone`, `maskId`, `maskModel` |
| `lib/csv.js` | Serializa filas a CSV (Excel-friendly). | `toCSV` |
| `lib/exporters.js` | Arma cada conjunto descargable por bot. | `oskitarExport`, `bettyExport` |
| `public/index.html` | Tablero (sin build). | — |

---

## 3. Fuentes de datos (`lib/logSource.js`)

Interfaz común (EventEmitter):

```js
const src = createBotSource(botCfg, config);
src.on('change', () => { /* recalcular */ });
await src.start();          // resuelve rápido; conecta en 2º plano si es SSH
const raw  = await src.read();   // { <clave>: contenido }   (ej. { conversations: "..." })
const meta = src.stat();         // { exists, size, mtime, files? }
src.stop();
```

### `LocalFileLogSource` — 1 archivo en disco
- `read()`: `fs.readFile` completo.
- Vigilancia: `fs.watch` + **sondeo de respaldo** (`WATCH_POLL_MS`) por si `fs.watch`
  no dispara (unidades de red, contenedores). Rebote `WATCH_DEBOUNCE_MS`.
- `stat()`: síncrono (`fs.statSync`).

### `RemoteSshLogSource` — 1 archivo remoto por SSH (requiere `ssh2`)
- `start()`: abre la conexión y **resuelve de inmediato** (no bloquea el arranque).
  Autenticación por clave privada o contraseña; habilita `keyboard-interactive`.
- Al quedar lista: emite `change` (primera carga), lanza `tail -F -n 0 <ruta>` en un
  canal exec (cada trozo de datos → `change` con rebote) y un sondeo de
  `stat -c '%s %Y' <ruta>` de respaldo.
- `read()`: descarga el archivo completo por **SFTP**.
- `stat()`: devuelve el último tamaño/mtime cacheado (refrescado por el sondeo).
- Reconexión automática con backoff de 5 s ante `error`/`close`.

### `MultiLogSource` — varios archivos (Betty)
Agrupa una fuente por archivo. `read()` → `{ messages: "...", state: "..." }`.
`change` de cualquier hijo se re-emite. `ready` = todos los hijos listos.

### Fábricas
- `createFileSource(path, config)` → `Local` o `RemoteSsh` según `config.source.type`.
- `createBotSource(botCfg, config)` → `MultiLogSource` con una fuente por
  `botCfg.files`.

**Extender:** una fuente nueva solo necesita `start/stop/read/stat` y emitir
`change`. El resto del sistema no cambia.

---

## 4. Histórico acumulativo (`lib/archive.js`)

`class Archive(filePath, isValid, tsOf)`:

- `load()` — lee el `.jsonl` existente y llena el set de hashes vistos.
- `ingest(text)` — por cada línea: si `isValid(line)` y su hash SHA-1 no está
  visto, la **agrega** al archivo (`appendFileSync`) y al set. Devuelve cuántas
  agregó.
- `readAll()` — contenido completo (lo que consume el parser).
- `prune(days)` — descarta líneas con `tsOf(line)` más viejas que `days` días
  (`0` = no hace nada). Reescribe el archivo y reconstruye el set.
- `stats()` — `{ lines, since }`.

En `server.js`, `archived(bot, raw)` hace `ingest` de cada archivo y devuelve
`readAll()`; **el motor trabaja sobre esa copia**, no sobre la lectura cruda. Así,
si el log remoto se rota o se vacía, no se pierde nada. Validadores y extractores
de fecha por tipo de archivo están en `ARCHIVE_RULES` (server.js):

| Clave | `isValid` | `tsOf` |
|---|---|---|
| `conversations` | JSON con `message` y `timestamp` | `timestamp` |
| `messages` (Betty) | JSON con `phone` y `message` | `null` (no hay fecha) |
| `state` (Betty) | JSON válido | `message.timeout` / `message.newTimeout` |

Archivos generados: `./data/<botId>.<clave>.jsonl` (p. ej. `data/oskitar.conversations.jsonl`,
`data/betty.messages.jsonl`, `data/betty.state.jsonl`).

---

## 5. Oskitar

### 5.1 Formato de `conversations.log`

Un objeto JSON por línea (**JSON Lines**):

```json
{"level":"info","message":{"content":"Hola","direction":"IN","from":"57...","messageId":"wamid...","type":"text"},"timestamp":"2026-09-01T13:10:05.100Z"}
{"level":"info","message":{"content":"Hola Juan Perez, Bienvenido al Sistema de Soporte...","direction":"OUT","to":"57...","type":"text"},"timestamp":"2026-09-01T13:10:05.900Z"}
```

| Campo | Uso |
|---|---|
| `timestamp` | ISO-8601 en UTC. |
| `message.direction` | `IN` (ciudadano→bot) · `OUT` (bot→ciudadano). |
| `message.from` / `to` | Teléfono del ciudadano; *peer* = `from` en IN, `to` en OUT. |
| `message.type` | `text`, `interactive`, `image`, `audio`, `video`. |
| `message.content` | Texto (ausente en multimedia sin descripción). |
| `message.mediaUrl` / `mediaId` / `mimeType` | Indican adjunto. |

### 5.2 Parser (`lib/parser.js`)

`parseLog(text)` → `{ events, parseErrors, totalLines }`. Cada `event`:

```
{ ts:Date, iso:string, direction:'IN'|'OUT', peer:string, type:string,
  content:string|null, hasMedia:boolean, mediaUrl, mimeType, messageId }
```

Líneas no-JSON o sin `message`/`timestamp` se cuentan en `parseErrors` y se
ignoran (un log a medio escribir no rompe nada). Los eventos se ordenan por `ts`.

### 5.3 Motor (`lib/analytics.js`) — `buildModel(events, opts)`

`opts`: `{ sessionGapMinutes, tzOffsetHours, from?, to?, category? }`.

**Huso horario.** Los `timestamp` llegan en UTC. Para los cortes por **día** y
**hora** se aplica `tzOffsetHours` (por defecto −5, Colombia; sin horario de
verano, así que un desfase fijo es exacto).

**Sesión.** Mensajes de un mismo teléfono separados por menos de
`SESSION_GAP_MIN` minutos. Cada sesión se enriquece con: `inCount`/`outCount`,
`durationSec`, `docRequested` (el bot pidió el documento), `docSubmitted` (llegó un
IN sólo numérico), `validated` (el bot respondió *"Gracias por validar tu
documento…"*), `queryAfterValidation`, `escalated` (el bot mencionó *"Soporte
Informática"* / *"Llama a Soporte"*), `gratitude` (algún IN contiene "gracias"),
`categories`, `responseTimesSec`.

**Consulta sustantiva.** IN de texto que aporta intención: no vacío, no sólo
dígitos, no un saludo suelto, > 2 caracteres. Los IN multimedia también cuentan.

**Tiempo de respuesta.** Dentro de la sesión se marca el instante del primer IN
pendiente; al llegar el primer OUT se registra la diferencia y se limpia la marca.
Es la **latencia de primera respuesta** a cada turno. Se reportan mediana,
promedio, P90 y tramos (`< 2 s`, `2–5 s`, `5–10 s`, `10–30 s`, `> 30 s`).

**Categorías.** Clasificación por palabras clave (`CATEGORY_RULES`, orden =
prioridad): Biométrico/Huella · Impresión/Facturación · Errores/Fallas del
sistema · Giros/Transacciones · Registro de clientes · Juegos/Chance/Apuestas ·
Contacto/Soporte humano · Información general · *Sin clasificar*.

**Embudo.** Sesiones que alcanzan cada etapa: Iniciaron → Enviaron documento →
Documento validado → Realizaron una consulta → Cerraron agradeciendo.

**Respuestas de contingencia.** Plantillas del bot que representan una no
resolución directa, contadas por tipo: Derivado a soporte humano · Formato de
mensaje no soportado · Documento inválido · Datos incorrectos · Sin información
disponible.

**Identidad.** Nombre del saludo *"Hola NOMBRE, Bienvenido al Sistema de
Soporte…"* (o de *"Gracias por validar tu documento NOMBRE,"*). Documento: último
IN puramente numérico (5–12 dígitos) antes de la primera validación.

**Tendencia (`trends`).** Compara la primera mitad del periodo con la segunda.
`comparable:true` solo si `daysCovered ≥ 14` (con menos, el frontend muestra solo
la mini-serie, sin porcentaje).

**`peopleByDay`.** Por día: lista de personas que escribieron ese día con su
conteo de mensajes (para el gráfico "personas por día" con drill-down).

#### Forma del modelo de Oskitar

```jsonc
{
  "meta": { "generatedAt", "tzOffsetHours", "sessionGapMinutes",
            "filter": { "from", "to", "category" },
            "firstEvent", "lastEvent", "rangeStart", "rangeEnd",
            "daysCovered", "availableCategories": [ ... ] },
  "kpis": { "uniqueUsers", "sessions", "totalMessages", "inbound", "outbound",
            "messagesPerSession", "avgSessionDurationMin",
            "validationRate", "escalationRate", "botContainmentRate",
            "gratitudeRate", "responseMedianSec", "responseP90Sec",
            "recurringUserRate", "mediaDelivered" },
  "byDay":    [ { "date", "inbound", "outbound", "sessions", "users" } ],
  "byHour":   [ { "hour": 0..23, "inbound" } ],
  "byWeekday":[ { "weekday": 0..6, "name", "count" } ],
  "peopleByDay": [ { "date", "people": [ { "phone", "name", "document", "messages" } ] } ],
  "heatmap":  [ { "weekday", "weekdayName", "hour", "count" } ],   "heatMax",
  "categories": [ { "category", "messages", "sessions", "pct" } ],
  "funnel":     [ { "stage", "count", "pctOfStart" } ],
  "responseTime": { "buckets": [ { "label", "count" } ], "medianSec", "p90Sec", "avgSec", "samples" },
  "contingencyResponses": [ { "reason", "count" } ],
  "contentDelivered":     [ { "title", "type", "count" } ],
  "topUsers":             [ { "phone", "label", "count" } ],
  "trends": { "comparable", "users", "sessions", "inbound", "containmentPoints", "responseMedian" },
  "recurring": { "recurringUsers", "newUsers", "sessionsFromRecurring", "avgSessionsPerUser" },
  "users": [ { "phone", "name", "document", "sessions", "totalMessages", "inbound",
               "outbound", "firstInteraction", "lastInteraction", "lastMessage",
               "lastMessageAt", "categories": [ ... ], "validated", "escalated",
               "gratitude", "avgResponseSec" } ]
}
```

**Filtros.** `?from`/`?to` (día local, inclusive) y `?category`. Sin filtros se
devuelve el modelo cacheado; con filtros se reconstruye para esa petición desde
`bot.state.events`.

---

## 6. Betty

### 6.1 Formatos

**`messages.log`** — mensajes del cliente. **Sin timestamp, sin dirección.**

```json
{"level":"info","message":"Hola","phone":"57...","type":"text"}
{"level":"info","message":"No disponible","phone":"57...","type":"interactive"}
```

**`state-manager.log`** — máquina de estados del bot. **Con timestamp** en el campo
`timeout` (o `newTimeout`), que es **cuándo expira el estado** (va adelantado del
momento real). Hay también líneas informativas con `message` string que se
descartan.

```json
{"level":"info","message":{"action":"setState","flow":"resultados","step":"processing","timeout":"2026-09-02T19:53:18.925Z","userId":"57..."}}
{"level":"info","message":{"action":"clearState","flow":"resultados","step":"processing","userId":"57..."}}
```

### 6.2 Parser (`lib/parserBetty.js`)

- `parseBettyMessages(text)` → `[{ phone, message, type }]`.
- `parseBettyState(text, { stateTtlMs })` → `[{ action, flow, step, fromStep,
  toStep, userId, ts:Date|null, iso:string|null }]`.
  **Ajuste de hora:** `ts = min(timeout − stateTtlMs, ahora)`. `BETTY_STATE_TTL_SEC`
  (≈ 720 s = 12 min) es la ventana de expiración observada; nunca se deja una
  marca en el futuro.

### 6.3 Motor (`lib/analyticsBetty.js`) — `buildBettyModel(raw, opts)`

`raw` = `{ messages, state }` (texto). `opts` = `{ tzOffsetHours, stateTtlMs }`.

- **Clientes:** unión de `phone` (messages) + `userId` (state).
- **"No disponible":** mensajes exactamente `"no disponible"` (opción de menú).
  Se reporta conteo, % del total y clientes afectados. Es la alerta principal.
- **Intenciones** (`INTENT_RULES`, sobre el texto libre): Resultados de lotería ·
  Comparte un enlace · Solicita ayuda · Descargar la app · Saludo · Otro.
- **Flujos** (de `state`, `FLOW_NAMES`): `resultados` → "Consultar resultados",
  `chance` → "Jugar chance", `location` → "Ubicación de puntos". Por flujo:
  `starts` (nº de `setState`) y `customers` (usuarios distintos).
- **Embudo "resultados":** clientes distintos por paso — Entraron → Indicaron una
  fecha (`step:"date_input"`) → Se procesó (`step:"processing"`) → Cerraron el
  flujo (`clearState`).
- **Series de tiempo:** `byDay` / `byHour` desde los `ts` (aproximados) de `state`.
- **`customers`:** por teléfono — `messages`, `notAvailable`, `flowEvents`,
  `flows[]`, `topIntent`, `lastActivity` (de `state`; `null` para los 12 que solo
  aparecen en `messages.log`).

#### Forma del modelo de Betty

```jsonc
{
  "meta": { "generatedAt", "tzOffsetHours", "rangeStart", "rangeEnd",
            "daysCovered", "parseErrors", "timingNote" },
  "kpis": { "uniqueCustomers", "totalMessages", "flowsStarted",
            "notAvailableRate", "messagesPerCustomer", "stepCorrections" },
  "notAvailable": { "count", "pct", "customers", "totalCustomers" },
  "flows":       [ { "flow", "name", "starts", "customers" } ],
  "stepBreakdown": [ { "key": "<flow>/<step>", "count" } ],
  "resultadosFunnel": [ { "stage", "count", "pctOfStart" } ],
  "intents":     [ { "intent", "count", "pct" } ],
  "messageTypes":[ { "type", "count", "pct" } ],
  "byDay":  [ { "date", "count" } ],
  "byHour": [ { "hour": 0..23, "count" } ],
  "byWeekday": [ { "weekday", "name", "count" } ],
  "topCustomers": [ { "phone", "label", "count" } ],
  "topByFlow":    [ { "phone", "label", "flows" } ],
  "customers": [ { "phone", "messages", "notAvailable", "flowEvents",
                   "flows": [ ... ], "topIntent", "lastActivity" } ]
}
```

Betty **no acepta filtros** (`?from`/`?to`/`?category`): se devuelve siempre el
modelo cacheado completo.

---

## 7. Privacidad (`lib/privacy.js`)

- `maskPhone("573173184631")` → `"57••••••4631"` (primeros 2 + últimos 4).
- `maskId("1112956985")` → `"•••••••985"` (últimos 3).
- `maskModel(model)` recorre `users`, `topUsers`, `customers`, `topCustomers`,
  `topByFlow`, `peopleByDay[].people` y enmascara `phone`/`document` in situ.
- `server.js` aplica el enmascarado sobre una **copia** del modelo antes de
  responder (no toca la caché) cuando `config.maskPhones` es `true`.

---

## 8. Descargas CSV (`lib/csv.js` + `lib/exporters.js`)

`GET /api/<bot>/export.csv?dataset=&from=&to=` — construye las filas desde el
**histórico** (`archived(bot, raw)`), aplica enmascarado y rango, serializa con
`toCSV` y responde con `Content-Disposition: attachment` + BOM UTF-8.

| Bot | `dataset` | Contenido | Filtra por fecha |
|---|---|---|---|
| oskitar | `conversaciones` (defecto) | 1 fila por mensaje: fecha, hora, teléfono, nombre, documento, dirección, tipo, categoría, contenido | sí |
| oskitar | `personas` | tabla de personas (agregada) | sí |
| betty | `clientes` (defecto) | tabla de clientes | por `lastActivity` |
| betty | `flujos` | 1 fila por evento de estado: fecha, hora, teléfono, acción, flujo, paso | sí |
| betty | `mensajes` | 1 fila por mensaje: teléfono, tipo, intención, mensaje | no (sin fecha en el log) |

---

## 9. API — contrato

Ver la tabla de rutas en el [`README.md`](../README.md#api-rest). Notas:

- `GET /api/<bot>/analytics` → 503 `{error}` si el modelo aún no está listo
  (arranque o SSH desconectado).
- `GET /api/<bot>/users` → `[]` para Betty (no aplica).
- `GET /api/<bot>/health` → incluye `source` (tipo, conexión, tamaño, mtime),
  `parseErrors`, `history` (`dir`, `keepDays`, `files: { <key>: { lines, since } }`),
  `sseClients`, `uptimeSec`.
- `GET /api/<bot>/stream` (SSE): `event: hello` al conectar, `event: update`
  `{ updatedAt, reason }` en cada recálculo, comentario `: ping` cada 25 s.
- `/api/analytics`, `/api/users`, `/api/health` → **redirect 307** al primer bot.

---

## 10. Frontend (`public/index.html`)

Un solo archivo, sin build. Chart.js 4 + `chartjs-plugin-datalabels` desde
`jsdelivr`. Puntos clave:

- **Selector de bot** (`initBots` / `setBot`): consulta `/api/bots`; si hay más de
  uno muestra el conmutador. `apiBase()` = `/api/<bot>`.
- **Tema:** script en `<head>` aplica `data-theme` antes de pintar; toggle
  persistido en `localStorage`.
- **En vivo:** `EventSource` a `/api/<bot>/stream`; en cada `update` recarga la
  vista actual (con la tarjeta atenuada, sin salto de layout).
- **Filtros de Oskitar:** periodo (Todo / 7 / 14 días / Fechas) y categoría;
  reconstruyen la URL de `/analytics`.
- **Responsive de gráficos:** series por día largas → contenedor `.chart-scroll`
  con ancho mínimo por columna; etiquetas compactas (`dayTicks`); barras
  horizontales → alto proporcional al nº de ítems (`hbar`); `grace` + `padding.top`
  para que las etiquetas de valor no se recorten.
- **Descarga CSV:** modal con `<input type="date">` (calendario nativo) que arma la
  URL de `export.csv` y dispara la descarga con un `<a download>` oculto.

---

## 11. Puntos de extensión

| Quiero… | Dónde |
|---|---|
| Añadir/afinar categorías de Oskitar | `CATEGORY_RULES` en `lib/analytics.js` |
| Afinar intenciones o nombres de flujo de Betty | `INTENT_RULES` / `FLOW_NAMES` en `lib/analyticsBetty.js` |
| Nueva fuente de log (otro transporte) | nueva clase en `lib/logSource.js` con `start/stop/read/stat` + evento `change`; enchufar en `createFileSource` |
| Nuevo bot | añadir una entrada a `config.bots` con su `engine` y `files`; crear su `parser*`/`analytics*` si el `engine` es nuevo; añadir su rama en `reload()` y `ARCHIVE_RULES` |
| Nuevo conjunto CSV | `oskitarExport` / `bettyExport` en `lib/exporters.js` + opción en `DATASETS` (frontend) |
| Cambiar el enmascarado | `lib/privacy.js` |

---

## 12. Decisiones de diseño

- **Sin base de datos ni build.** El histórico `.jsonl` + memoria alcanzan para el
  volumen actual (decenas de miles de líneas). Para años de datos, añadir lectura
  incremental en `Archive`/parsers.
- **La fuente del log es intercambiable.** Local, SSH o compuesta comparten
  interfaz; el motor no depende de ello.
- **El histórico es la fuente de verdad**, no la lectura remota puntual: así una
  rotación del log no borra nada.
- **Clasificación por reglas** (no NLP): transparente, versionable y fácil de
  ajustar por el equipo.
- **Betty tiene menos datos** (sin dirección, sin timestamp de mensaje, sin
  identidad): su vista se limita a lo que el log realmente permite y lo indica en
  el pie ("horas aproximadas").
