# Panel Gerencial de Chatbots — Gane Palmira

Tablero web de analítica gerencial sobre los chatbots de WhatsApp de Gane Palmira.
Lee los logs que generan los bots (en disco o **directamente del servidor por
SSH**), mantiene un **histórico acumulativo** que nunca se pierde y muestra un
panel **en vivo** con dos vistas por bot.

| Bot | Rol | Logs |
|-----|-----|------|
| **Oskitar** | Soporte técnico interno (colaboradores de los puntos de venta) | `conversations.log` |
| **Betty** | Atención a clientes finales | `messages.log` + `state-manager.log` |

- **Stack:** Node.js ≥ 18 · Express 5 · sin framework de frontend, sin paso de build.
- **Sin base de datos.** Todo el estado vive en memoria + un archivo `.jsonl` de histórico.
- **Dependencias:** `express` (obligatoria) y `ssh2` (opcional, solo para leer por SSH).

---

## Índice

1. [Características](#características)
2. [Arquitectura](#arquitectura)
3. [Requisitos](#requisitos)
4. [Puesta en marcha rápida (local)](#puesta-en-marcha-rápida-local)
5. [Configuración (variables de entorno)](#configuración-variables-de-entorno)
6. [Conectar a los logs reales](#conectar-a-los-logs-reales)
7. [Despliegue en un servidor](#despliegue-en-un-servidor)
8. [Histórico acumulativo](#histórico-acumulativo)
9. [Privacidad](#privacidad)
10. [Descargas CSV](#descargas-csv)
11. [API REST](#api-rest)
12. [Estructura del proyecto](#estructura-del-proyecto)
13. [Desarrollo](#desarrollo)
14. [Solución de problemas](#solución-de-problemas)
15. [Notas y limitaciones](#notas-y-limitaciones)

---

## Características

### Comunes a los dos bots
- **Panel en vivo**: el modelo se recalcula cuando el log cambia y el navegador se
  actualiza solo por **Server-Sent Events**.
- **Histórico que solo crece**: aunque el log del servidor se rote o se vacíe, el
  panel conserva todo en `./data/*.jsonl` (ver [Histórico](#histórico-acumulativo)).
- **Selector de bot** en la cabecera (Oskitar ⇄ Betty). El wordmark y las vistas
  cambian según el bot.
- **Tema claro / oscuro** con persistencia; se aplica antes de pintar (sin parpadeo).
- **Hora legal de Colombia (UTC-5)** en todas las fechas, sin importar el reloj del
  equipo que abre el panel.
- **Descarga CSV** con selector de rango de fechas.
- **Enmascarado de teléfonos y cédulas** configurable.
- **Diseño responsive**: las series temporales largas se desplazan dentro de su
  tarjeta; las barras horizontales ajustan su alto al número de ítems.

### Oskitar — dos vistas
- **Resumen** (gerencia): titular en lenguaje natural generado de los datos, anillo
  con el % de conversaciones resueltas por el bot, indicadores con contador
  animado, mini-gráfico "personas · últimos 7 días", temas más consultados, hora
  pico, resuelto vs. escalado, personas más activas, satisfacción.
- **Detalle** (analítica): actividad por día, rapidez de respuesta, **gráfico de
  personas por día con drill-down** (toca una barra → tabla de quiénes escribieron
  ese día), embudo de la conversación, motivos de escalamiento, contenido más
  enviado y la **tabla completa de personas** (búsqueda + orden).

### Betty — vista única
Titular en lenguaje natural, **anillo de alerta "% No disponible"** (opción de menú
que los clientes tocan mucho), indicadores, **para qué usan a Betty** (flujos),
**qué escriben** (intenciones), actividad por hora y por día, **recorrido del flujo
"consultar resultados"**, clientes más activos, tipos de mensaje y la **tabla de
clientes**.

---

## Arquitectura

```
                        navegador  ── SSE / fetch ──►  ┌─────────────┐
                                                       │  server.js  │  Express
        ┌── /api/bots  /api/<bot>/analytics  ──────────┤  (multi-bot)│
        │   /api/<bot>/health|stream|refresh|export.csv └──────┬──────┘
        │                                                      │  recalcula al cambiar el log
        ▼                                                      ▼
   public/index.html                              ┌────────────────────────────┐
   (tablero, sin build)                           │        por cada bot        │
                                                  │  lib/logSource  (local/ssh)│
                                                  │        │ lee               │
                                                  │        ▼                   │
                                                  │  lib/archive  (histórico   │
                                                  │        │       .jsonl)     │
                                                  │        ▼                   │
                                                  │  lib/parser* + analytics*  │
                                                  │        │                   │
                                                  │        ▼                   │
                                                  │   modelo en caché ─► API   │
                                                  └────────────────────────────┘
```

**Flujo de datos**

1. **Fuente** (`lib/logSource.js`): lee el/los archivo(s) del bot. En modo `local`
   vigila con `fs.watch` + sondeo; en modo `ssh` descarga por SFTP y sigue con
   `tail -F`. Emite `change` cuando hay novedad.
2. **Histórico** (`lib/archive.js`): cada lectura se vuelca a `./data/<bot>.<archivo>.jsonl`
   agregando **solo las líneas nuevas** (deduplicadas por hash). El resto del
   sistema trabaja sobre esta copia, no sobre la lectura cruda.
3. **Parser + motor** (`lib/parser*.js` + `lib/analytics*.js`): convierten el
   histórico en un **modelo** (KPIs, series, embudo, tablas…).
4. **Servidor** (`server.js`): cachea el modelo, lo sirve por API JSON y avisa a
   los navegadores por SSE. Enmascara teléfonos/cédulas al responder.
5. **Frontend** (`public/index.html`): un solo archivo HTML/CSS/JS que pinta el
   tablero con Chart.js (cargado por CDN).

La **fuente del log está detrás de una interfaz**: el parser, el motor y el
frontend no saben si los datos vienen de disco o de SSH.

---

## Requisitos

- **Node.js ≥ 18** (probado con 20 y 22). Ver `.nvmrc`.
- Para leer por SSH: `npm install ssh2` y que el servidor remoto tenga los
  comandos `tail` y `stat` (estándar en Linux) y permisos de **lectura** sobre los
  logs.
- El navegador que abre el panel necesita salida a internet para dos scripts de
  CDN (Chart.js y el plugin de etiquetas). Ver [Desarrollo](#desarrollo) para
  servirlo offline.

---

## Puesta en marcha rápida (local)

```bash
git clone <URL-DEL-REPO> chatbot-analytics
cd chatbot-analytics
npm install
npm start          # arranca con conversations.sample.log de ejemplo
```

Abre **http://localhost:3000**. Verás Oskitar con datos de ejemplo.

Para apuntar a un log real en esta misma máquina:

```bash
cp .env.example .env
# edita .env:  LOG_SOURCE=local  y  LOG_PATH=/ruta/al/conversations.log
npm start
```

---

## Configuración (variables de entorno)

Todo se configura por entorno. Puedes usar variables reales del sistema o un
archivo **`.env`** en la raíz (se carga solo, sin dependencias; **no se versiona**).

| Variable | Defecto | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor web. |
| `LOG_SOURCE` | `local` | `local` (archivos de disco) o `ssh` (servidor remoto). |
| **Modo `local`** | | |
| `LOG_PATH` | `./conversations.sample.log` | Log de Oskitar. |
| `BETTY_MESSAGES_PATH` | — | `messages.log` de Betty. Betty aparece solo si se define junto con el siguiente. |
| `BETTY_STATE_PATH` | — | `state-manager.log` de Betty. |
| **Modo `ssh`** (requiere `ssh2`) | | |
| `LOG_SSH_HOST` / `LOG_SSH_PORT` | — / `22` | Host y puerto SSH del servidor del chatbot. |
| `LOG_SSH_USER` | — | Usuario SSH. |
| `LOG_SSH_KEY` | — | Ruta a la clave privada OpenSSH (recomendado). |
| `LOG_SSH_PASSPHRASE` | — | Passphrase de la clave, si tiene. |
| `LOG_SSH_PASSWORD` | — | Contraseña SSH (alternativa a la clave). |
| `LOG_SSH_REMOTE_PATH` | — | Ruta **absoluta** del `conversations.log` de Oskitar. |
| `LOG_SSH_BETTY_MESSAGES` | — | Ruta absoluta del `messages.log` de Betty. |
| `LOG_SSH_BETTY_STATE` | — | Ruta absoluta del `state-manager.log` de Betty. |
| **Privacidad** | | |
| `MASK_PHONES` | `1` | `1` = teléfonos y cédulas enmascarados. `0` = completos. |
| **Histórico** | | |
| `HISTORY_DIR` | `./data` | Carpeta del histórico acumulativo. |
| `HISTORY_DAYS` | `0` | Días a conservar. `0` = **guardar todo, nunca borrar**. |
| **Análisis** | | |
| `SESSION_GAP_MIN` | `30` | Minutos de inactividad que cierran una sesión de Oskitar. |
| `TZ_OFFSET_HOURS` | `-5` | Huso para los cortes por día/hora (Colombia = −5). |
| `BETTY_STATE_TTL_SEC` | `720` | Ventana que se resta al `timeout` de Betty (≈ 12 min). |
| `BETTY_DISABLED` | — | `1` oculta Betty aunque esté configurada. |
| `WATCH_DEBOUNCE_MS` | `400` | Rebote antes de recalcular tras un cambio. |
| `WATCH_POLL_MS` | `3000` | Sondeo de respaldo de cambios (modo local). |

---

## Conectar a los logs reales

### A) El panel corre en la misma máquina que el chatbot

```bash
LOG_SOURCE=local \
LOG_PATH=/home/app/ChatBotSoporte/logs/conversations.log \
BETTY_MESSAGES_PATH=/home/app/ChatBotBetty/logs/messages.log \
BETTY_STATE_PATH=/home/app/ChatBotBetty/logs/state-manager.log \
npm start
```

### B) El panel corre en otra máquina y hay acceso SSH al servidor del chatbot

```bash
npm install ssh2
cp .env.example .env
```

`.env`:

```dotenv
LOG_SOURCE=ssh
LOG_SSH_HOST=10.0.0.20
LOG_SSH_USER=app
LOG_SSH_KEY=/home/panel/.ssh/id_ed25519
LOG_SSH_REMOTE_PATH=/home/app/ChatBotSoporte/logs/conversations.log
LOG_SSH_BETTY_MESSAGES=/home/app/ChatBotBetty/logs/messages.log
LOG_SSH_BETTY_STATE=/home/app/ChatBotBetty/logs/state-manager.log
```

```bash
npm start
#  [ssh] conectado a app@10.0.0.20:22
```

- El panel se conecta, descarga los logs por SFTP y los sigue con `tail -F`.
- Si la conexión se cae, **reconecta sola**; `/api/<bot>/health` lo marca como
  `degraded` mientras tanto. El arranque **no se bloquea** aunque el SSH falle.
- **Nada se instala ni se ejecuta de forma persistente en el servidor del chatbot**:
  solo lecturas (`tail`, `stat`, SFTP).
- Prueba de credenciales desde tu terminal:
  ```bash
  ssh -p 22 app@10.0.0.20 "stat -c '%s %Y' /home/app/ChatBotSoporte/logs/conversations.log && tail -n1 $_"
  ```

### C) Montaje SSHFS (sin dependencias de Node)

Monta el directorio remoto con **SSHFS** (`sshfs-win` + WinFsp en Windows) y usa la
opción A apuntando las rutas al punto de montaje. El sondeo de respaldo cubre que
`fs.watch` no dispare sobre un sistema de archivos de red.

---

## Despliegue dentro del stack Skylab (recomendado)

Este proyecto vive en el monorepo `Bot_comercial` y se despliega como servicio Docker junto
al resto. Lo consume el módulo **Analítica de Agentes** del CRM (pestañas *Oskitar* y *Betty*),
que llama a `GET /api/:bot/analytics` y `GET /api/:bot/stream` (SSE) directo, sin pasar por el
nginx del CRM. Ver `specs/0004-integracion-analitica-chatbots/` y `docs/adr/ADR-0002`.

```bash
# desde la raíz del repo — host 3008 → contenedor 3000
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build chatbot-analytics
```

- **`.env` obligatorio** en `./chatbot-analytics/.env` (montado por `env_file`, **no versionado**).
  Para producción: `LOG_SOURCE=ssh` + credenciales/rutas de los servidores de los bots. Copiar
  de `.env.example`.
- El `PORT` interno se fuerza a `3000` desde `docker-compose.yml` (`environment: PORT=3000`);
  el `PORT` del `.env` se ignora.
- Histórico acumulativo en el volumen `./chatbot-analytics/data` (`HISTORY_DIR=/app/data`).
- El servidor manda `Access-Control-Allow-Origin: *` (API de solo lectura). **No trae
  autenticación**: exponer sólo en la red interna. `MASK_PHONES=1` recomendado dentro del CRM.
- En producción (`192.168.8.65`): `git pull` + el mismo `docker compose up -d --build
  chatbot-analytics`, y `crm-frontend` con `VITE_CHATBOT_ANALYTICS_URL=http://192.168.8.65:3008`.

## Despliegue standalone (sin Docker)

Ejemplo para un Linux con systemd (Debian/Ubuntu/RHEL).

### 1. Instalar

```bash
sudo useradd -r -m -d /opt/chatbot-analytics -s /usr/sbin/nologin panel
sudo -u panel git clone <URL-DEL-REPO> /opt/chatbot-analytics
cd /opt/chatbot-analytics
sudo -u panel npm ci --omit=dev          # + `npm i ssh2` si se usará modo ssh
sudo -u panel cp .env.example .env
sudo -u panel nano .env                   # completar configuración
```

### 2. Servicio systemd

`/etc/systemd/system/chatbot-analytics.service`:

```ini
[Unit]
Description=Panel Gerencial de Chatbots
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=panel
WorkingDirectory=/opt/chatbot-analytics
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
# El histórico se guarda aquí; debe ser escribible por el usuario `panel`
Environment=HISTORY_DIR=/opt/chatbot-analytics/data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now chatbot-analytics
sudo systemctl status chatbot-analytics
journalctl -u chatbot-analytics -f          # logs en vivo
```

### 3. Nginx como reverse proxy (incluye lo necesario para SSE)

```nginx
server {
    listen 80;
    server_name panel.ejemplo.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Connection '';   # imprescindible para /api/<bot>/stream
        proxy_buffering off;              # imprescindible para SSE
        proxy_read_timeout 1h;
    }
}
```

> El panel **no trae autenticación**. Si se expone fuera de la red interna,
> protégelo con Basic Auth en Nginx, un VPN o un proxy de identidad.

### 4. Alternativa sin systemd: PM2

```bash
npm i -g pm2
pm2 start server.js --name chatbot-analytics
pm2 save && pm2 startup
```

### 5. Actualizar

```bash
cd /opt/chatbot-analytics
sudo -u panel git pull
sudo -u panel npm ci --omit=dev
sudo systemctl restart chatbot-analytics
```

El histórico en `./data` y el `.env` no se tocan al actualizar.

---

## Histórico acumulativo

El log del chatbot puede rotarse o vaciarse. Para no perder lo viejo, el panel
guarda una **copia local en `./data/*.jsonl` que solo crece**:

- En cada lectura agrega las líneas nuevas (deduplicadas por hash de la línea).
- Toda la analítica y los CSV trabajan sobre esa copia.
- Sobrevive a reinicios (el índice se reconstruye desde el archivo) y a rotaciones
  del log remoto.
- `HISTORY_DAYS=0` (por defecto) → nunca borra. `HISTORY_DAYS=180` → conserva solo
  los últimos 180 días.
- Para empezar de cero: detener el servicio, borrar `./data/` y arrancar.
- Estado del histórico en `GET /api/<bot>/health` → campo `history`.

---

## Privacidad

- Por defecto, la API entrega los **teléfonos** como `57••••••4631` y las
  **cédulas** como `•••••••985` (se conservan los últimos dígitos para poder
  identificar la fila y buscar). El número completo **no sale del proceso**.
- `MASK_PHONES=0` los muestra completos (para quien esté autorizado).
- El enmascarado aplica también a las descargas CSV.
- `lib/privacy.js` centraliza la lógica.

---

## Descargas CSV

Botón **⬇** en la cabecera → diálogo con calendario (desde / hasta) y selector de
conjunto:

| Bot | Conjuntos |
|---|---|
| **Oskitar** | **Conversaciones** (1 fila por mensaje) · **Personas** (tabla resumida) |
| **Betty** | **Clientes** · **Flujos** (eventos de estado) · **Mensajes** (todos, sin fecha) |

El CSV respeta el enmascarado, trae **BOM UTF-8** (Excel abre bien tildes y
emojis) y escapa comillas/comas/saltos de línea. También accesible por URL:
`GET /api/<bot>/export.csv?dataset=...&from=YYYY-MM-DD&to=YYYY-MM-DD`.

---

## API REST

Base: `http://<host>:<port>`

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/bots` | Lista de bots (`id`, `name`, `engine`, `ready`). |
| `GET` | `/api/<bot>/analytics` | Modelo completo. Oskitar acepta `?from=&to=&category=`. |
| `GET` | `/api/<bot>/users` | Detalle por usuario (solo Oskitar; `[]` para Betty). |
| `GET` | `/api/<bot>/health` | Estado: fuente, conexión, `parseErrors`, histórico, uptime. |
| `POST` | `/api/<bot>/refresh` | Fuerza relectura + recálculo. |
| `GET` | `/api/<bot>/stream` | Server-Sent Events: `hello` al conectar, `update` en cada recálculo. |
| `GET` | `/api/<bot>/export.csv` | Descarga CSV (`dataset`, `from`, `to`). |
| `GET` | `/api/analytics` · `/api/users` · `/api/health` | Redirigen (307) al primer bot (`oskitar`), por compatibilidad. |

`<bot>` = `oskitar` \| `betty`. La forma de cada modelo está documentada en
[`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md).

---

## Estructura del proyecto

```
chatbot-analytics/
├── server.js                 Servidor Express: API, SSE, caché de modelos, orquestación multi-bot
├── config.js                 Configuración + carga de .env + lista de bots
├── conversations.sample.log  Datos de ejemplo (Oskitar) para arrancar tras clonar
├── .env.example              Plantilla de configuración
├── lib/
│   ├── logSource.js          Fuentes: archivo local · SSH (SFTP + tail -F) · compuesta (varios archivos)
│   ├── archive.js            Histórico acumulativo append-only (.jsonl, deduplicado)
│   ├── parser.js             conversations.log  → eventos normalizados (Oskitar)
│   ├── analytics.js          eventos            → modelo de Oskitar
│   ├── parserBetty.js        messages.log + state-manager.log → eventos (Betty)
│   ├── analyticsBetty.js     eventos            → modelo de Betty
│   ├── privacy.js            enmascarado de teléfonos y cédulas
│   ├── csv.js                serializador CSV
│   └── exporters.js          arma cada conjunto descargable (Oskitar / Betty)
├── public/
│   └── index.html            Tablero completo (HTML + CSS + JS, sin build)
├── docs/
│   └── DOCUMENTATION.md       Referencia técnica: modelo de datos, métricas, módulos
└── data/                      Histórico (.jsonl). Se crea solo. NO se versiona.
```

---

## Desarrollo

```bash
npm run dev        # node --watch server.js (reinicia al guardar)
```

- **Frontend sin build**: `public/index.html` es un único archivo. Chart.js y
  `chartjs-plugin-datalabels` se cargan desde `jsdelivr`. Para un entorno sin
  internet, descarga esos dos archivos a `public/` y cambia los `<script src>`.
- **Sintaxis del frontend** (rápido, sin navegador):
  ```bash
  node -e "const fs=require('fs');const s=fs.readFileSync('public/index.html','utf8').match(/<script>([\s\S]*?)<\/script>/g);s.forEach(b=>new Function(b.replace(/<\/?script>/g,'')))" && echo OK
  ```
- **Puntos de extensión**:
  - Categorías de Oskitar → `CATEGORY_RULES` en `lib/analytics.js`.
  - Intenciones / nombres de flujo de Betty → `INTENT_RULES` / `FLOW_NAMES` en `lib/analyticsBetty.js`.
  - Nueva fuente de log → implementar la interfaz de `lib/logSource.js`.
  - Nuevo conjunto CSV → `lib/exporters.js`.

---

## Solución de problemas

| Síntoma | Causa probable / solución |
|---|---|
| `LOG_SOURCE=ssh requiere la dependencia "ssh2"` | `npm install ssh2`. |
| `All configured authentication methods failed` | Usuario o contraseña/clave incorrectos, o `PermitRootLogin prohibit-password` (usa un usuario no-root). |
| Health `degraded`, `connected:false` | SSH inalcanzable o credenciales malas; el panel reintenta cada 5 s. Revisa firewall del puerto 22. |
| El navegador no recibe actualizaciones en vivo | Falta `proxy_buffering off;` y `proxy_set_header Connection '';` en Nginx. |
| Los gráficos no se dibujan | Sin salida a internet para el CDN de Chart.js. Servir los scripts localmente. |
| Betty no aparece | Faltan `LOG_SSH_BETTY_MESSAGES` **y** `LOG_SSH_BETTY_STATE` (o sus equivalentes locales). |
| Fechas de Betty en el futuro | Ajusta `BETTY_STATE_TTL_SEC` (ventana de expiración real del estado). |
| El histórico creció con datos de pruebas | Detener, borrar `./data/`, arrancar. |
| Windows / Git Bash reescribe rutas `/var/...` | Usa el archivo `.env` en vez de variables en la línea de comandos. |

---

## Notas y limitaciones

- **Sin base de datos**: el histórico se procesa completo en memoria en cada
  recálculo. Para volúmenes de años conviene añadir lectura incremental.
- **Sin autenticación** integrada (ver despliegue).
- **Clasificación por palabras clave**, no NLP: transparente y ajustable, pero un
  mensaje ambiguo puede quedar "Sin clasificar".
- **Betty** no registra timestamps reales de mensaje ni nombre/documento del
  cliente (no están en sus logs). Los cortes por hora salen de `state-manager.log`
  y son aproximados.
- **Contención del bot** (Oskitar) se mide como "no hubo escalamiento a un
  humano": es un *proxy*, no garantiza que la duda quedara resuelta.
