# 🚀 Ecosistema Skylab - Bot Comercial & CRM

## 📚 Documentación

Punto de entrada recomendado para humanos y agentes:

- [DOCUMENTACION.md](./DOCUMENTACION.md)
- [Indice maestro](./docs/README.md)

Bienvenido al repositorio central del Ecosistema Skylab. Este proyecto está diseñado como un **monorepositorio de microservicios** que utiliza Docker para la orquestación de bots de mensajería (WhatsApp/Telegram) y un panel de control administrativo (CRM).

## 🏗️ Arquitectura del Proyecto

El proyecto se divide en tres componentes principales que coexisten en este repositorio para facilitar la integración y el despliegue mediante Docker Compose:

1.  **Bot Comercial (Raíz):** Bot principal de atención para Gane Palmira. Gestiona reportes de puntos de venta y estados de red.
2.  **Bot Asamblea (`/Asamblea`):** Módulo especializado para la gestión de la Asamblea de Accionistas 2026.
3.  **CRM Frontend (`/CRM_Frontend`):** Panel administrativo moderno construido con React + Vite.

## 🐳 Despliegue con Docker

Utilizamos Docker para asegurar que todos los servicios corran en un entorno aislado y controlado. El archivo `docker-compose.yml` en la raíz gestiona los siguientes contenedores:

- `comercial-bot` (Puerto 3001)
- `comercial-worker`
- `asamblea-bot` (Puerto 3002)
- `asamblea-worker`
- `crm-frontend` (Puerto 3003)

### Comandos de Despliegue (VPS)

```bash
# Sincronizar código
git pull origin main

# Levantar/Actualizar servicios
sudo docker compose up -d --build
```

## 📂 Estructura de Carpetas

- `/src`: Código fuente del Bot Comercial.
- `/Asamblea`: Código fuente del Bot Asamblea.
- `/CRM_Frontend`: Aplicación React (Panel de Control).
- `docker-compose.yml`: Orquestador de servicios.
- `PROYECTO_CONTEXTO.md`: Documentación técnica detallada para IA y desarrolladores.

---
*Desarrollado para el ecosistema de Gane Palmira.*
