# Modulo - Bot Comercial

## Proposito

Bot principal de WhatsApp y Telegram para el area comercial. Atiende usuarios autorizados, aplica RBAC y genera reportes de puntos de venta por zona.

## Ubicacion

```text
src/
monitor_puntos_wpp.py
docker-compose.yml
```

## Contenedores

| Contenedor | Rol |
| --- | --- |
| `comercial-bot` | API, webhooks, Socket.IO y servicios backend |
| `comercial-worker` | Procesamiento de cola del bot |

## Archivos clave

| Archivo | Responsabilidad |
| --- | --- |
| `src/app.js` | App Express, rutas y middlewares |
| `src/index.js` | Entrada del servicio |
| `src/services/bot.service.js` | Flujo conversacional principal |
| `src/services/worker.js` o `src/worker.js` | Procesamiento de cola, segun implementacion actual |
| `src/services/whatsapp.service.js` | Integracion Meta WhatsApp Cloud API |
| `src/services/telegram.service.js` | Integracion Telegram |
| `src/services/messaging.service.js` | Capa unificada de mensajeria |
| `src/services/access.service.js` | Roles y permisos |
| `src/services/socket.service.js` | Socket.IO, SSH bridge y eventos realtime |
| `src/services/ping.service.js` | Heartbeat del modulo Monitoreo IT |
| `monitor_puntos_wpp.py` | Generacion de reportes de puntos |

## Datos y dependencias

- Supabase para sesiones, usuarios, roles y logs.
- Meta WhatsApp Cloud API.
- Telegram Bot API.
- Python para reportes de puntos.
- Docker Compose para despliegue.

## Antes de modificar

- Revisar `PROYECTO_CONTEXTO.md` si el cambio toca flujo conversacional, RBAC o integraciones historicas.
- Revisar variables `.env` necesarias sin exponer secretos.
- Si se toca WhatsApp, usar la skill interna de WhatsApp cuando aplique.
- Probar que el worker y el bot sigan procesando la cola.

## Verificacion minima

```bash
npm run build
```

Si no existe build para este modulo, validar arranque o tests disponibles:

```bash
npm start
```

En VPS:

```bash
sudo docker compose up -d --build comercial-bot comercial-worker
```

