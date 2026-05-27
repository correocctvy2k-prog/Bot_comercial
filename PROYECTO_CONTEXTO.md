# 📋 CONTEXTO MAESTRO DEL ECOSISTEMA SKYLAB
> **Última actualización:** 2026-05-27  
> **Propósito:** Referencia rápida para el asistente IA antes de cualquier intervención en los proyectos. Actualizar al finalizar cada sesión de trabajo.

---

## 🏗️ ESTRUCTURA GENERAL DEL REPOSITORIO

**Ruta local:** `C:\Users\johnathan.beltran\.gemini\antigravity\playground\final-skylab\`  
**GitHub:** `correocctvy2k-prog/Bot_comercial` (rama: `main`)  
**VPS Ubuntu con Docker:** Red privada `192.168.8.65` (usuario: `skylab`)

### Carpetas principales:
```
final-skylab/
├── src/                   ← Bot Comercial (raíz del proyecto)
├── Asamblea/              ← Bot Asamblea (subproyecto)
├── CRM_Frontend/          ← Frontend React (local, próximamente en VPS)
├── monitor_puntos_wpp.py  ← Script Python que genera reportes de puntos
├── docker-compose.yml     ← Orquesta los 4 contenedores del VPS
├── package.json           ← bot-comercial v12.0.0
├── .env                   ← Variables del Bot Comercial (NO subir a GitHub)
└── PROYECTO_CONTEXTO.md   ← Este archivo
```

---

## 🏛️ RAZÓN DE LA ARQUITECTURA (SISTEMA MONOREPO)

Se ha decidido mantener los tres componentes (**Bot Comercial**, **Bot Asamblea** y **CRM**) dentro del mismo repositorio y servidor por las siguientes razones:

1.  **Integración Directa:** El CRM utiliza WebSockets para conectarse al backend del Bot Comercial para la terminal SSH. Compartir el mismo host facilita esta conexión.
2.  **Base de Datos Compartida:** Todos los servicios consumen la misma instancia de Supabase.
3.  **Despliegue Atómico:** Al usar un único `docker-compose.yml`, podemos asegurar que las actualizaciones de los bots y el frontend se sincronicen correctamente.
4.  **Simplicidad para el Equipo:** Se reduce la sobrecarga de gestionar múltiples repositorios y credenciales de acceso al VPS.

---

## 🔄 FLUJO DE TRABAJO / DESPLIEGUE

```
[Cambios locales en Windows]
        ↓
  git push → GitHub (main)
        ↓
 [Notificar al usuario]
        ↓
  Pull manual en VPS Ubuntu:
  cd ~/Bot_comercial/Bot_comercial
  sudo git pull origin main
        ↓
  Reiniciar contenedores (si aplica):
  sudo docker compose restart        ← Comercial (bot + worker)
  cd Asamblea && sudo docker compose restart  ← Asamblea (bot + worker)
```

> ⚠️ **REGLA CRÍTICA:** Después de cada cambio de código que funcione, siempre hay que hacer `git push` e **indicar al usuario que ejecute `git pull` en el VPS**. El CRM_Frontend NO necesita pull en el VPS (por ahora corre local).

---

## 🤖 PROYECTO 1: BOT COMERCIAL (`src/` en la raíz)

### Propósito
Bot de WhatsApp y Telegram para el área **comercial** de Gane Palmira. Permite a usuarios autorizados solicitar reportes de estado de puntos de venta por zona geográfica.

### Contenedores Docker (VPS)
| Contenedor | Puerto | Comando |
|---|---|---|
| `comercial-bot` | `3001` | `node src/index.js` |
| `comercial-worker` | — | `node src/worker.js` |

### Arquitectura
```
WhatsApp/Meta API → Webhook POST /webhook → bot_queue (Supabase) → Worker → bot.service.js
Telegram API → Webhook POST /webhook/telegram → bot_queue → Worker → bot.service.js
```

### Flujo del Bot Comercial
1. **Nuevo usuario:** Pregunta nombre → solicita consentimiento de datos
2. **Estado `READY`:** Muestra menú de reportes según rol (`RBAC`)
3. **Selección de zona:** Ejecuta `monitor_puntos_wpp.py` (Python) → devuelve JSON con mensajes
4. **Roles:** `SUPERADMIN` (acceso total), `ADMIN` (acceso multi-zona), `USER` (zonas asignadas), `pending` (espera aprobación), `BLOCKED`
5. **Sesiones:** Se cierran automáticamente por inactividad (20 min por defecto, controlado por `IDLE_CLOSE_MS`)

### Zonas configuradas
`PALMIRA`, `AMAIME Y EL PLACER`, `ROZO`, `CANDELARIA`, `PRADERA`, `FLORIDA`, `OCCIDENTE`

### Servicios clave (`src/services/`)
| Archivo | Función |
|---|---|
| `bot.service.js` | Lógica principal del flujo conversacional (39KB) |
| `monitor.service.js` | Lanza Python, parsea JSON y envía mensajes |
| `socket.service.js` | WebSocket + SSH bridge + Autopilot + logs en tiempo real |
| `whatsapp.service.js` | API Cloud de Meta (envío de textos, botones, imágenes, documentos, stickers) |
| `telegram.service.js` | Envío de mensajes y botones por Telegram |
| `messaging.service.js` | Capa unificada WA/Telegram (detecta canal por prefijo `tg_`) |
| `ai.service.js` | Gemini AI para NLU (clasificar intención del texto) |
| `session.service.js` | Lectura/escritura de sesiones en Supabase (`bot_sessions`) |
| `access.service.js` | RBAC: leer/escribir roles desde Supabase |
| `monitor.service.js` | Spawn Python, TTL 3 min, parseo seguro de JSON |
| `siiss.service.js` | Integración con SIISS para estado de estaciones (ping/activo) |
| `logger.service.js` | Log de interacciones CRM en Supabase |
| `consent.service.js` | Registro físico de consentimiento (archivo local) |

### Variables de entorno importantes (`.env` raíz)
```
PORT=3001
WPP_TOKEN=<Meta Bearer Token>
PHONE_NUMBER_ID=<ID Número WA>
WPP_VERSION=v22.0
TELEGRAM_BOT_TOKEN_COMERCIAL=<token>
SUPABASE_URL=https://fxlbqlzsbrgnkpcduzxt.supabase.co
SUPABASE_KEY=<service_role key>
GEMINI_API_KEY=<key>
IDLE_CLOSE_MS=1200000  (20 min)
MONITOR_SCRIPT=monitor_puntos_wpp.py
PYTHON_BIN=python
MONITOR_TIMEOUT_MS=180000
SIISS_URL=http://10.192.168.8:8101
```

### Script Python (`monitor_puntos_wpp.py`)
- Lee los puntos de venta desde Supabase (`puntos_venta`)
- Hace ping a cada IP
- Devuelve JSON con `{ ok, messages[], image?, summary }` al bot Node.js
- Parámetros: `--json --tipo standard [--zona PALMIRA]`

---

## 🎪 PROYECTO 2: BOT ASAMBLEA (`Asamblea/`)

### Propósito
Bot de WhatsApp y Telegram para el registro y gestión de la **Asamblea de Accionistas 2026** de Gane Palmira.

### Contenedores Docker (VPS)
| Contenedor | Puerto | Comando |
|---|---|---|
| `asamblea-bot` | `3002` | `node src/index.js` |
| `asamblea-worker` | — | `node src/worker.js` |

### Arquitectura
```
WhatsApp → /webhook → bot_queue → Worker → ai.service.js (processIncomingAsamblea)
Telegram → /webhook/telegram-asamblea → bot_queue → Worker → ai.service.js
```

### Flujo del Bot Asamblea
1. **Verificación de padrón:** Valida que el teléfono esté en `asamblea_padron` (Supabase)
2. **Registro ya existente:** Si está en `asamblea_registro` con status `SYNC_OK`, informa y finaliza
3. **Categorías de participantes:**
   - `ACCIONISTA`: Flujo completo (puede ser empresa o persona natural)
   - `REPRESENTANTE_LEGAL`: Registro directo con NIT de la empresa representada
   - `APODERADO`: Dirección a mesa presencial + registro automático
   - `INVITADO`: Registro de cortesía sin validación SIISS
4. **Sincronización SIISS:** Registra asistencia en `registraAsistencia` usando el NIT de la empresa (para REPRESENTANTES_LEGALES/APODERADOS) o el documento personal
5. **Panel Admin** (comando `admgane`):
   - Difusión de preguntas/votaciones a todos los registrados
   - Quiz SARLAFT masivo
   - Reenvío selectivo a teléfonos específicos (comando `reenvio`)
   - Votaciones predefinidas (aprobación de informes, elección de junta directiva)

### Tablas Supabase usadas (Asamblea)
| Tabla | Uso |
|---|---|
| `asamblea_padron` | Lista blanca de autorizados con `wa_id`, `nombre`, `documento`, `categoria`, `nit_representado` |
| `asamblea_registro` | Registro de asistencia confirmada (`SYNC_OK` o `SYNC_FAILED`) |
| `asamblea_encuestas` | Preguntas enviadas por difusión (`pregunta`, `opciones[]`) |
| `asamblea_votos` | Respuestas de accionistas a encuestas |
| `bot_sessions` | Sesiones activas del bot |
| `bot_queue` | Cola de mensajes entrantes |
| `interactions_log` | Log CRM de interacciones |

### Servicios clave (`Asamblea/src/services/`)
| Archivo | Función |
|---|---|
| `ai.service.js` | Toda la lógica de conversación Asamblea (processIncomingAsamblea) |
| `api.asamblea.service.js` | Llamadas a API SIISS para validación y registro de asistencia |
| `whatsapp.service.js` | Envío WA (con upload de media local para imágenes y documentos) |
| `telegram.service.js` | Envío Telegram |
| `messaging.service.js` | Capa unificada WA/Telegram (con token propio de Asamblea) |
| `siiss.service.js` | Sincronización de estado de estaciones (usado por el Worker) |
| `session.service.js` | Sesiones en Supabase |
| `logger.service.js` | Log CRM |

### Assets (`Asamblea/assets/`)
- `logo_asamblea.png` — Enviado en mensaje de bienvenida
- `logo_gane_sticker.webp` — Sticker enviado tras registro exitoso
- `ASAMBLEA DE ACCIONISTAS 2026.pdf` — Informe de gestión

### Variables de entorno importantes (`Asamblea/.env`)
```
PORT=3002
WPP_TOKEN=<Meta Bearer Token Asamblea>
PHONE_NUMBER_ID=1073623179160908
WPP_VERSION=v22.0
TELEGRAM_BOT_TOKEN=<token asamblea>
SUPABASE_URL=https://fxlbqlzsbrgnkpcduzxt.supabase.co
SUPABASE_KEY=<service_role key>
GEMINI_API_KEY=<key>
```

### Integración SIISS (API interna red privada)
- **URL base:** `http://10.192.168.8:8101`
- **Empresa:** `EMPRCODI=8150006772`, `ASAMCODI=10`
- **Credenciales:** `123123123` / `CP123`
- **Endpoints usados:**
  - `POST /siiss-login/api/v1/qvaccesosys/login` → obtener JWT
  - `POST /siiss-quorum/api/v1/qoAccionistas/getAccionistasLst` → lista accionistas
  - `POST /siiss-quorum/api/v1/qoAsistencias/registraAsistencia` → registrar asistencia
  - `GET /siiss-basicas/api/v1/qvestaciones/estacionesByPing` → estado puntos (para monitor)

---

## 🖥️ PROYECTO 3: CRM FRONTEND (`CRM_Frontend/`)

### Propósito
Aplicación React + Vite que actúa como **panel de control centralizado** para monitorear los bots y gestionar los puntos de venta y contactos. Incluye un terminal SSH embebido para controlar el VPS sin salir de la app.

### Estado de despliegue
- ✅ **Actualmente:** Solo local (`npm run dev` → `http://localhost:5173`)
- 🔜 **Próximamente:** Subir al VPS también

### Stack técnico
- **React 19** + **Vite 7** + **TailwindCSS 3**
- **Radix UI** (componentes UI accesibles)
- **Recharts** (gráficos)
- **React Leaflet** (mapas interactivos)
- **Framer Motion** (animaciones)
- **xterm.js** (terminal SSH embebido)
- **Socket.io-client** (conexión WebSocket al backend Comercial)
- **@tanstack/react-query** (caché y sincronización de datos)
- **Supabase JS** (acceso directo a BD)

### Rutas disponibles
| Ruta | Componente | Función |
|---|---|---|
| `/` | `Dashboard` | KPIs comerciales, charts de puntos online/offline |
| `/points` | `Points` | Gestión de puntos de venta (CRUD, alertas, mapa) |
| `/connections` | `Connections` | Estado de canales (WhatsApp, Telegram) y sus configuraciones |
| `/connections/:id/config` | `BotConfig` | Configuración detallada de cada canal/bot |
| `/contacts` | `Contacts` | Lista de contactos CRM |
| `/contacts/:id` | `ContactDetail` | Detalle de un contacto, historial de interacciones |
| `/command-center` | `CommandCenter` | Terminal SSH + Control DevOps de los servidores |
| `/asamblea` | `AsambleaDashboard` | Dashboard específico para el evento Asamblea |
| `/test-wa` | `PruebaWhatsApp` | Página de prueba de mensajería |

### Servicios Frontend (`CRM_Frontend/src/services/`)
| Archivo | Función |
|---|---|
| `supabase.js` | Cliente Supabase (URL hardcoded + service_role key, sin auth) |
| `crm.service.js` | Queries de contactos, interacciones, sesiones |
| `points.service.js` | Queries de puntos de venta, actividad, alertas |
| `asamblea.service.js` | Queries del dashboard de Asamblea |
| `channels.service.js` | Estado de canales de mensajería |

### Componentes clave (`CRM_Frontend/src/components/`)
| Componente | Función |
|---|---|
| `AlertsTab.jsx` | Panel de alertas en tiempo real de los puntos (69KB) |
| `SystemHealthPanel.jsx` | Estado del sistema (SSH, túnel, bots) con botones de acción rápida |
| `MapView.jsx` | Mapa Leaflet con ubicación y estado de cada punto |
| `GerenciaDashboard.jsx` | Sub-dashboard para vista gerencial |

### CommandCenter (Terminal SSH)
El `CommandCenter.jsx` conecta via WebSocket al backend del **Bot Comercial** (puerto 3001) que implementa el puente SSH (`socket.service.js`). Permite:
- Terminal SSH interactiva (shell completa en el VPS)
- Terminal secundaria para logs de túneles Cloudflare
- Espejo live de logs de Node.js del bot
- Autopilot para Comercial (mata túnel viejo, levanta nuevo, registra webhook en Telegram, escribe `.env`)
- Autopilot para Asamblea (similar pero puerto 3002)
- Macros de comandos predefinidas: git pull, docker restart, logs en tiempo real, diagnóstico

### Variable de entorno Frontend
```
VITE_BACKEND_URL=http://localhost:3001   ← URL del Bot Comercial para WebSocket
VITE_SUPABASE_URL=https://fxlbqlzsbrgnkpcduzxt.supabase.co
VITE_SUPABASE_KEY=<service_role key>
```

---

## 🗄️ BASE DE DATOS SUPABASE

**URL:** `https://fxlbqlzsbrgnkpcduzxt.supabase.co`  
**Key (service_role):** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4bGJxbHpzYnJnbmtwY2R1enh0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNzg3NiwiZXhwIjoyMDg1NzgzODc2fQ.odcV7pu9oD6l3UgFTY97AljC7lCxZskuxRrd4m2Nl5Y`

### Tablas principales del Bot Comercial
| Tabla | Uso |
|---|---|
| `puntos_venta` | Puntos de venta con IP, nombre, zona, estado SIISS (`siiss_active`), coordenadas |
| `bot_queue` | Cola FIFO de mensajes entrantes (status: `pending`, `completed`, `failed`, `expired`) |
| `bot_sessions` | Estado de sesión por `wa_id` (step, consent, name) |
| `interactions_log` | Log CRM de todos los mensajes INCOMING/OUTGOING |
| `contacts` | Directorio de contactos del CRM |
| `bot_access` | Roles y permisos del RBAC por `wa_id` |
| `point_activity_log` | Historial de eventos OPENED/CLOSED de puntos |
| `channels` | Configuración de canales de mensajería |

### Tablas de Asamblea
| Tabla | Uso |
|---|---|
| `asamblea_padron` | Lista blanca: `wa_id`, `nombre`, `documento`, `categoria`, `nit_representado` |
| `asamblea_registro` | Registro asistencia: `user_phone`, `documento`, `nombre`, `rol`, `categoria_oficial`, `status` |
| `asamblea_encuestas` | Preguntas enviadas: `pregunta`, `opciones[]` |
| `asamblea_votos` | Votos: `encuesta_id`, `user_phone`, `opcion_index`, `opcion_texto` |

---

## 🌐 INFRAESTRUCTURA VPS

### Red privada
- **IP del servidor:** `192.168.8.65`
- **Usuario SSH:** `skylab`
- **Ruta del proyecto en VPS:** `~/Bot_comercial/Bot_comercial/`

### Túneles Cloudflare (modo gratuito, URLs cambian con cada reinicio)
| Bot | Puerto | Túnel |
|---|---|---|
| Comercial | `3001` | URL temporal `*.trycloudflare.com` |
| Asamblea | `3002` | URL temporal `*.trycloudflare.com` |

> ⚠️ Cuando un túnel se reinicia, hay que actualizar el webhook en **Meta (WhatsApp)** y/o **Telegram**. El Autopilot del CommandCenter hace esto automáticamente para Telegram, pero Meta/WhatsApp hay que actualizarlo manualmente en el dashboard de Meta for Developers.

### Comandos frecuentes en VPS
```bash
# Ver estado de contenedores
sudo docker ps -a

# Logs en tiempo real
sudo docker logs -f comercial-bot
sudo docker logs -f asamblea-bot
sudo docker logs -f comercial-worker

# Git pull y reiniciar bots
cd ~/Bot_comercial/Bot_comercial && sudo git pull origin main
sudo docker compose restart   # Comercial bot + worker
cd Asamblea && sudo docker compose restart  # Asamblea bot + worker

# Reiniciar solo un contenedor
sudo docker restart comercial-bot comercial-worker
sudo docker restart asamblea-bot asamblea-worker

# Lanzar túnel manualmente
cloudflared tunnel --url http://localhost:3001
cloudflared tunnel --url http://localhost:3002
```

---

## 🔗 RELACIONES ENTRE PROYECTOS

```
CRM_Frontend (localhost:5173)
    │
    ├─ WebSocket → Bot Comercial (:3001) ← SSH Bridge al VPS
    │
    └─ Directo Supabase → BD compartida
                                 │
                     ┌───────────┴───────────┐
                     │                       │
             Bot Comercial               Bot Asamblea
            (VPS :3001)                  (VPS :3002)
                     │                       │
             supabase.co            supabase.co (misma BD)
                     │                       │
            monitor_puntos.py          API SIISS (:8101)
```

---

## 📝 CONVENCIONES DE CÓDIGO

### IDs de botones de WhatsApp (NO cambiar)
Los IDs de botones están hardcodeados y se usan para routing en el worker. Cambiarlos rompe el flujo de usuarios en sesión activa.

### Identificación de canal
- **WhatsApp:** `wa_id` es número puro (ej: `573001234567`)
- **Telegram:** `wa_id` lleva prefijo `tg_` (ej: `tg_7859763818`)
- La función `normWaId()` normaliza ambos formatos

### Queue (bot_queue)
TTL de 5 minutos: mensajes más antiguos se marcan como `expired` para evitar procesarlos tarde. El worker se suscribe a Supabase Realtime y también hace polling cada 15s.

### RBAC (access.service.js)
Roles: `SUPERADMIN` → `ADMIN` → `USER` → `pending` → `BLOCKED`  
Bypass hardcodeado para `573162892244` (acceso de emergencia).

---

## 🚨 PROBLEMAS CONOCIDOS / GOTCHAS

1. **DNS IPv6:** Tanto el bot comercial como el asamblea fuerzan `dns.setDefaultResultOrder('ipv4first')` al inicio para evitar timeouts de red en Linux.

2. **Circular dependencies:** Los servicios `messaging.service.js` y `bot.service.js` usan lazy requires (`get property()`) para evitar referencias circulares.

3. **Supabase Realtime:** Si el estado del canal es `CHANNEL_ERROR`, el worker hace `process.exit(1)` para que Docker lo reinicie automáticamente. Esto es intencional.

4. **Autopilot Asamblea:** El `socket.service.js` del bot Comercial contiene código para actualizar remotamente el `bot.service.js` del contenedor Asamblea inyectando código base64 vía SSH. Esto fue un fix de emergencia y puede necesitar actualización si el código del bot Asamblea cambia.

5. **Tokens Telegram en socket.service.js:** Hay tokens de Telegram hardcodeados en el socket.service.js (dentro del Autopilot de Asamblea). Si cambian los tokens, hay que actualizarlos ahí también.

6. **Meta Webhook:** Después de reiniciar el túnel Cloudflare del Bot Comercial, hay que actualizar manualmente la URL del webhook en Meta for Developers → WhatsApp → Configuración. El Telegram se actualiza automáticamente con el Autopilot.

7. **CRM Supabase key:** El frontend usa la `service_role key` hardcodeada directamente en el código. Esto es un riesgo de seguridad en producción — antes de desplegar públicamente debe moverse a variables de entorno y usar `anon key` + RLS.

---

## ✅ CHECKLIST PARA CAMBIOS

### Al modificar Bot Comercial o Asamblea:
- [ ] Hacer los cambios localmente en Windows
- [ ] Probar localmente si es posible
- [ ] `git add . && git commit -m "descripción" && git push`
- [ ] Notificar al usuario para que ejecute `git pull` en el VPS

---

## 🖥️ INFRAESTRUCTURE MONITORING (CRM_Frontend/Monitoreo)

### Propósito
Dashboard en tiempo real para monitorear 6 nodos de infraestructura (servidores AD, hosts Hyper-V, KSC):
- **ANFIGANE** (192.168.8.43) — Host Hyper-V 1
- **ANFI-SEG13798** (192.168.8.41) — Host Hyper-V 2
- **AD01** (192.168.8.44) — Master Domain Controller
- **AD02** (192.168.8.45) — Secondary BDC
- **AD03** (192.168.8.46) — Secondary BDC (añadido 2026-05-26)
- **KSC** (192.168.8.42) — Kaspersky Security Center

### Arquitectura de Heartbeat
```
Backend (src/services/ping.service.js):
  ├─ Cada 10s: ping a los 6 nodos (icmp probe con timeout 2s)
  ├─ Resultado: {status: 'UP'|'DOWN', time: <ms>, ip: <ip>, checkedAt: Date.now()}
  └─ Emit Socket.io: io.emit('monitoring:heartbeat', {AD: {...}, AD-DC02: {...}, ...})

Frontend (CRM_Frontend/src/pages/Monitoring.jsx):
  ├─ Socket connect a URL del backend
  ├─ On 'monitoring:heartbeat': actualiza estado con receivedAt: Date.now()
  └─ Calcula frescura: FRESH (< 45s) | STALE (45-120s) | STALE_EXPIRED (> 120s)
        ├─ Verde (emerald) = fresh + UP
        ├─ Rojo (rose) = fresh + DOWN
        ├─ Ámbar (amber) = stale (> 45s sin actualización)
        └─ Gris (slate) = sin datos
```

### Commits Recientes (Sesión 2026-05-26/27)
| Commit | Descripción |
|---|---|
| `0c1ed3e` | Debug(ping): per-node logs to diagnose missing AD-DC03 |
| `bbee9ca` | Debug: log ping results and AD-DC03 for diagnosis |
| `6cecb26` | Use client receive time for heartbeat freshness; preserve server checkedAt |
| `f5faa5d` | Improve heartbeat freshness: server timestamps, stale state, and frontend handling |
| `19c3be1` | Validate monitoring heartbeat logic and push final changes |

### Estado Actual (2026-05-27)
**Problema:** LED de AD03 permanece gris aunque el servidor está encendido

**Investigación:**
- ✓ AD03 agregado a `nodesToMonitor` en backend
- ✓ Backend emite `checkedAt` para cada nodo
- ✓ Frontend calcula frescura correctamente
- ⚠️ AD-DC03 NO aparece en objeto de heartbeat recibido (falta diagnóstico)

**Próximos pasos:**
1. Reiniciar contenedor `comercial-bot` en VPS: `sudo docker restart comercial-bot`
2. Capturar logs del backend: `sudo docker logs -f comercial-bot 2>&1 | grep 'PING_SVC'`
3. Verificar si aparecen líneas: `pinging AD-DC03 @ 192.168.8.46` y `result AD-DC03: ...`
4. Si falta: revisar por qué no está en la lista de nodos
5. Si hay error: implementar fallback TCP probe (puertos 389/445 en lugar de ICMP)

### Archivos Modificados
```
src/services/ping.service.js
  - nodesToMonitor: + AD-DC03 @ 192.168.8.46
  - Per-node logging (pinging, result, error)
  - Alias keys: AD02/AD03 + IP + alt names
  - checkedAt timestamp por nodo

CRM_Frontend/src/pages/Monitoring.jsx
  - Thresholds: PING_FRESH_MS = 45s, PING_STALE_MS = 120s
  - LED states: green/red/amber/gray
  - Socket heartbeat handler: receivedAt + checkedAt preservation
```
- [ ] Reiniciar el(los) contenedor(es) afectado(s)
- [ ] Verificar logs para confirmar que no hay errores

### Al modificar CRM_Frontend:
- [ ] Hacer los cambios localmente
- [ ] Verificar en `http://localhost:5173`
- [ ] `git add . && git commit -m "descripción" && git push`
- [ ] (Sincronizar en VPS): Ejecutar `sudo docker compose up -d --build crm-frontend`

---

## 🔧 MONITOR-AD.PS1 — AUTOMATIZACIÓN MENSUAL DE INFORMES AD (2026-05-27)

### Objetivo
Script automatizado que se ejecuta mensualmente en **AD01** (vía Scheduled Task con usuario SYSTEM) para generar reportes de auditoría AD en formato TXT, HTML y PDF, cumpliendo ISO 27001:2022 e ISO 27002:2022.

### Cambios Realizados (Sesión 2026-05-27)
**Problema Principal:** Script estaba configurado solo para 2 controladores (AD01 + DA02); faltaba AD03 (192.168.8.46), y SYSTEM user no podía acceder a rutas de backup en `\\ganepalmi\Backup\...`.

**Soluciones Implementadas:**

#### 1. Configuración de Credenciales (Líneas 29-31)
Se agregó una sección de configuración para credenciales de acceso a rutas de red:
```powershell
# === CREDENCIALES PARA ACCESO A BACKUPS ===
$BackupCredUsername = "GANEPAL\Administrator"  # O: "GANEPAL\AD01$"
$BackupCredPassword = ""                       # Vacío por defecto (usar SYSTEM)
$BackupUseCredentials = $false                 # Cambiar a $true si falla acceso sin credenciales
```
**Uso:** Si SYSTEM falla accediendo `\\ganepalmi\Backup\...`, cambiar `$BackupUseCredentials = $true` e inyectar la contraseña del Administrador en `$BackupCredPassword`.

#### 2. Actualización de listas `dcList` para incluir AD03
Se actualizaron 2 funciones que iteran sobre controladores:
- **Get-DCStatus()** (línea 100): `$dcList = @("AD01", "DA02", "AD03")`  
  - Verifica estado NTDS, DNS, KDC, W32Time, Netlogon, DFSR para cada DC
  - Captura Uptime, OS Version, Last Reboot, FSMO roles
  
- **Get-DiskSpace()** (línea 576): `$dcList = @("AD01", "DA02", "AD03")`  
  - Verifica espacio en disco en cada controlador
  - Alerta si disco < 15% libre (ISO 27001 A.8.6)

#### 3. Agregación de datos por DC (Get-ReplicationStatus)
Se agregó recolección de AD object count para AD03:
- Línea 256: `$dc3Objects = (Get-ADObject -Server "AD03" -Filter * ...)`
- Línea 265: Muestra "AD03 - $dc3Objects objetos" en reporte

#### 4. Rutas de Backup Actualizadas (Get-BackupStatus)
Se agregó AD03 a la lista de rutas:
```powershell
$rutas = @(
    "\\ganepalmi\Backup\ActiveBackupData\VM-BACKUP AD01",
    "\\ganepalmi\Backup\ActiveBackupData\VM-BACKUP AD02",
    "\\ganepalmi\Backup\ActiveBackupData\VM-BACKUP AD03"  # ← Nueva
)
```

#### 5. Fallback de Credenciales para Acceso a Rutas (Get-BackupStatus, líneas 306-312)
Lógica de acceso con reintentos:
```powershell
if ($BackupUseCredentials -and $BackupCredPassword) {
    $cred = New-Object PSCredential($BackupCredUsername, (ConvertTo-SecureString $BackupCredPassword -AsPlainText -Force))
    $testPath = Test-Path $ruta -Credential $cred -ErrorAction SilentlyContinue
} else {
    $testPath = Test-Path $ruta  # Usa SYSTEM por defecto
}
```
**Efecto:** Primero intenta con SYSTEM; si falla y está habilitado, usa credenciales Administrator.

### Reportes HTML Generados
El script genera un reporte HTML **dinámico** que incluye automáticamente todos los DCs de la lista:
- 3 tablas principales: Controladores, Replicación, Disco
- Estadísticas de usuarios (habilitados, deshabilitados, inactivos)
- Estado de backups
- Estado de GPOs
- Eventos de seguridad
- Cumplimiento ISO 27001

**Ubicaciones de salida:**
- Local: `C:\AD_Reports\Informe_AD_YYYY-MM-DD_HHMM.html`
- Red: `\\ganepalmir\dpto.informatica\Johnathan.Beltran\OTROS\Chequeos\Active Directory\` (si SYSTEM tiene acceso)

### Commits (Sesión 2026-05-27)
| Commit | Descripción |
|---|---|
| `6fae773` | Fix: Add AD03 to Get-DiskSpace function dcList (line 576) |

### Próximos Pasos (Si es Necesario)
1. **Prueba manual:** Ejecutar en AD01: `.\Monitor-AD.ps1` desde PowerShell como Administrador
2. **Verificar HTML:** Abrir el archivo generado en `C:\AD_Reports\` para confirmar que incluye datos de los 3 DCs
3. **Habilitar credenciales** (si es necesario): Si el acceso a backups falla en la ejecución via Scheduled Task:
   - Cambiar `$BackupUseCredentials = $true`
   - Inyectar contraseña: `$BackupCredPassword = "ContraseñaReal"`
   - Volver a ejecutar la Scheduled Task

---

### Al modificar CRM_Frontend:
- [ ] Hacer los cambios localmente
- [ ] Verificar en `http://localhost:5173`
- [ ] `git add . && git commit -m "descripción" && git push`
- [ ] (Sincronizar en VPS): Ejecutar `sudo docker compose up -d --build crm-frontend`

---

## 🔧 MONITOR-AD.PS1 — AUTOMATIZACIÓN MENSUAL DE INFORMES AD (2026-05-27)

### Objetivo
Script automatizado que se ejecuta mensualmente en **AD01** (vía Scheduled Task con usuario SYSTEM) para generar reportes de auditoría AD en formato TXT, HTML y PDF, cumpliendo ISO 27001:2022 e ISO 27002:2022.

### Cambios Realizados (Sesión 2026-05-27)
**Problema Principal:** Script estaba configurado solo para 2 controladores (AD01 + DA02); faltaba AD03 (192.168.8.46), y SYSTEM user no podía acceder a rutas de backup en `\\ganepalmi\Backup\...`.

**Soluciones Implementadas:**

#### 1. Configuración de Credenciales (Líneas 29-31)
Se agregó una sección de configuración para credenciales de acceso a rutas de red:
```powershell
# === CREDENCIALES PARA ACCESO A BACKUPS ===
$BackupCredUsername = "GANEPAL\Administrator"  # O: "GANEPAL\AD01$"
$BackupCredPassword = ""                       # Vacío por defecto (usar SYSTEM)
$BackupUseCredentials = $false                 # Cambiar a $true si falla acceso sin credenciales
```
**Uso:** Si SYSTEM falla accediendo `\\ganepalmi\Backup\...`, cambiar `$BackupUseCredentials = $true` e inyectar la contraseña del Administrador en `$BackupCredPassword`.

#### 2. Actualización de listas `dcList` para incluir AD03
Se actualizaron 2 funciones que iteran sobre controladores:
- **Get-DCStatus()** (línea 100): `$dcList = @("AD01", "DA02", "AD03")`  
  - Verifica estado NTDS, DNS, KDC, W32Time, Netlogon, DFSR para cada DC
  - Captura Uptime, OS Version, Last Reboot, FSMO roles
  
- **Get-DiskSpace()** (línea 576): `$dcList = @("AD01", "DA02", "AD03")`  
  - Verifica espacio en disco en cada controlador
  - Alerta si disco < 15% libre (ISO 27001 A.8.6)

#### 3. Agregación de datos por DC (Get-ReplicationStatus)
Se agregó recolección de AD object count para AD03:
- Línea 256: `$dc3Objects = (Get-ADObject -Server "AD03" -Filter * ...)`
- Línea 265: Muestra "AD03 - $dc3Objects objetos" en reporte

#### 4. Rutas de Backup Actualizadas (Get-BackupStatus)
Se agregó AD03 a la lista de rutas:
```powershell
$rutas = @(
    "\\ganepalmi\Backup\ActiveBackupData\VM-BACKUP AD01",
    "\\ganepalmi\Backup\ActiveBackupData\VM-BACKUP AD02",
    "\\ganepalmi\Backup\ActiveBackupData\VM-BACKUP AD03"  # ← Nueva
)
```

#### 5. Fallback de Credenciales para Acceso a Rutas (Get-BackupStatus, líneas 306-312)
Lógica de acceso con reintentos:
```powershell
if ($BackupUseCredentials -and $BackupCredPassword) {
    $cred = New-Object PSCredential($BackupCredUsername, (ConvertTo-SecureString $BackupCredPassword -AsPlainText -Force))
    $testPath = Test-Path $ruta -Credential $cred -ErrorAction SilentlyContinue
} else {
    $testPath = Test-Path $ruta  # Usa SYSTEM por defecto
}
```
**Efecto:** Primero intenta con SYSTEM; si falla y está habilitado, usa credenciales Administrator.

### Reportes HTML Generados
El script genera un reporte HTML **dinámico** que incluye automáticamente todos los DCs de la lista:
- 3 tablas principales: Controladores, Replicación, Disco
- Estadísticas de usuarios (habilitados, deshabilitados, inactivos)
- Estado de backups
- Estado de GPOs
- Eventos de seguridad
- Cumplimiento ISO 27001

**Ubicaciones de salida:**
- Local: `C:\AD_Reports\Informe_AD_YYYY-MM-DD_HHMM.html`
- Red: `\\ganepalmir\dpto.informatica\Johnathan.Beltran\OTROS\Chequeos\Active Directory\` (si SYSTEM tiene acceso)

### Commits (Sesión 2026-05-27)
| Commit | Descripción |
|---|---|
| `6fae773` | Fix: Add AD03 to Get-DiskSpace function dcList (line 576) |

### Próximos Pasos (Si es Necesario)
1. **Prueba manual:** Ejecutar en AD01: `.\Monitor-AD.ps1` desde PowerShell como Administrador
2. **Verificar HTML:** Abrir el archivo generado en `C:\AD_Reports\` para confirmar que incluye datos de los 3 DCs
3. **Habilitar credenciales** (si es necesario): Si el acceso a backups falla en la ejecución via Scheduled Task:
   - Cambiar `$BackupUseCredentials = $true`
   - Inyectar contraseña: `$BackupCredPassword = "ContraseñaReal"`
   - Volver a ejecutar la Scheduled Task

---

## 📅 HISTORIAL DE CAMBIOS IMPORTANTES

| Fecha | Cambio |
|---|---|
| 2026-04-15 | Migración a Docker y despliegue en VPS del CRM_Frontend |
| 2026-04-09 | Creación de este documento de contexto |
| 2026-03-25 | Asamblea: NIT de representados para SIISS (accionistas empresa) |
| 2026-03-25 | Asamblea: Reenvío selectivo de preguntas por teléfonos específicos |
| 2026-03-18 | CRM: Corrección del modal "Faltantes" en AsambleaDashboard |
| 2026-03-18 | Comercial: Exclusión de puntos permanentemente cerrados y unificación de IPs |
| 2026-03 | Asamblea: Panel Admin completo (votaciones, SARLAFT quiz, difusión masiva) |
| 2026-02 | CRM Frontend: Terminal SSH embebido (xterm.js + Socket.io) |
| 2026-02 | CRM Frontend: Autopilot Cloudflare para Comercial y Asamblea |
| 2026-01 | Comercial: Integración SIISS para estado de estaciones en tiempo real |
---

## 🖥️ PROYECTO 3: DASHBOARD DE MONITOREO DE INFRAESTRUCTURA (ISO 27001)

### Propósito
Visualización en tiempo real del estado de salud de la infraestructura crítica (Servidores Físicos y Virtuales) de Gane Palmira, alineado con controles de seguridad **ISO 27001:2022**.

### Arquitectura de Monitoreo
El sistema utiliza una arquitectura jerárquica de dos niveles:
1.  **Hosts Físicos (Anfitriones Hyper-V):** Monitoreo de hardware, RAM total, estado de replicación y salud de las VMs.
2.  **Nodos Virtuales (VMs):** Monitoreo profundo de servicios de Active Directory, seguridad, backups y almacenamiento.

### Inventario de Infraestructura
| ID Servicio | Nombre / Función | IP Local | Host Físico |
|---|---|---|---|
| `AD-HOST` | **ANFIGANE** (Master Host) | `192.168.8.43` | ProLiant DL360 |
| `AD` | **AD01** (Master DC) | `192.168.8.44` | ANFIGANE |
| `AD-DC02` | **DA02** (Secundario BDC) | `192.168.8.45` | ANFIGANE |
| `ANFI-SEG` | **ANFI-SEG13798** (Security Host) | `192.168.8.41` | ProLiant DL160 |
| `SERV-KSC` | **KSC** (Kaspersky Center) | `192.168.8.42` | ANFI-SEG13798 |
| `AD-DC03` | **AD03** (Próximamente) | - | ANFI-SEG13798 |

### Roles y Responsabilidades de Monitoreo
| Servidor | Rol de Monitoreo | Destino de Datos | Genera Reporte Red (HTML) |
|---|---|---|---|
| **AD01** | **Maestro de Monitoreo AD** | Backend (.65) + Red (\\ganepalmir) | **SÍ** (Único responsable) |
| **DA02** | Nodo de Salud BDC | Backend (.65) | No |
| **ANFIGANE** | Nodo de Salud Host Master | Backend (.65) | No |
| **ANFI-SEG** | Nodo de Salud Host Seguridad | Backend (.65) | No |
| **KSC** | Nodo de Salud Kaspersky | Backend (.65) | No |

### Flujo de Datos Técnico
1.  **Agentes PowerShell (`.ps1`):** Corren localmente en cada servidor mediante Tareas Programadas.
2.  **Upload API:** Envían un POST JSON a `http://192.168.8.65:3001/api/monitoring/upload`.
3.  **Procesamiento Backend:**
    - Guarda `latest.json` y un histórico con timestamp.
    - **Auto-generación de Reportes:** El servidor genera automáticamente un `latest.html` con diseño Dark Mode si el agente no lo envía, garantizando que el enlace de reporte siempre funcione.
4.  **Frontend (React):**
    - Consume `/api/monitoring/latest/:service`.
    - **Heartbeat:** Usa WebSockets (`monitoring:heartbeat`) para LEDs de estado en tiempo real (Ping).

### 💡 Lecciones Aprendidas y Soluciones (Knowledge Base)

#### 1. Variabilidad de Payloads (Mapeo Agresivo)
**Problema:** Diferentes versiones de PowerShell o diferentes roles de servidor envían datos de servicios o discos en estructuras distintas (ej. `LocalHealth.Services` vs `DCs.Status.Services`).
**Solución:** Implementar en el frontend un mapeo "agresivo" que busque el valor en múltiples rutas posibles usando encadenamiento opcional (`?.`) y fallbacks dinámicos.
```javascript
// Ejemplo de patrón exitoso:
uptime={nodes.dc01.LocalHealth?.Uptime ?? nodes.dc01.DCs?.Status?.find(d => d.Name?.includes('AD01'))?.Uptime ?? 'N/A'}
```

#### 2. Silenciamiento de Errores 404 (Console Cleanliness)
**Problema:** El frontend consulta servicios nuevos que aún no han reportado datos, generando spam de errores 404 en la consola del navegador.
**Solución:** El backend debe interceptar la falta de archivo y devolver `200 OK (null)` en lugar de `404`. El frontend maneja el `null` mostrando estados de "Iniciando..." o "Esperando Agente".

#### 3. LEDs de Estado Resilientes
**Problema:** El ping ICMP puede estar bloqueado por firewalls locales aunque el servidor esté operativo.
**Solución:** Lógica de LED híbrida. El LED se pone en verde si: (Ping es UP) **Ó** (Hay datos frescos del agente recibidos recientemente).

#### 4. Sincronización VPS (Critical Path)
**Problema:** Cambios en el mapeo del frontend no coinciden con la lógica del backend si no se reinicia el servicio.
**Regla:** Siempre que se actualice `monitoring.controller.js`, es obligatorio ejecutar `pm2 restart all` en el VPS para activar la auto-generación de reportes HTML.

#### 5. Exportación de HTML (Variable Typo y Fallbacks)
**Problema:** El reporte de Monitoreo generado por el script maestro de AD (84KB) se visualizaba en el CRM con un diseño "Dark Theme" básico (con datos RAW en JSON) en lugar del diseño estructurado y detallado original.
**Solución:** El backend en Node.js cuenta con una función de fallback (`generateHtmlReport`) que auto-genera un HTML si recibe el payload vacío. En el script de PowerShell existía un typo crítico (`html = $htmlContent` en lugar de `html = $htmlReport`), lo que provocaba que se descartara el reporte principal. Al enviar la variable correcta, el backend sirve el HTML de 84KB original.

---

## 🧠 MEMORIA CENTRALIZADA Y APRENDIZAJE AGÉNTICO
*Consulte `km_agent_memory` en Supabase para detalles técnicos específicos de implementación de controladores.*
 