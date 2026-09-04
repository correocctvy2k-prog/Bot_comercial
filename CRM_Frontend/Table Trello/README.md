# 🚀 Skylab Tareas MVP

Módulo de gestión de tareas (Kanban) conectado con Trello API, sincronización por WebSockets (Socket.IO) y base de datos SQLite como caché local.

Diseñado como un módulo independiente integrable en la aplicación **CRM_Frontend**.

## 📋 Estructura del Proyecto

*   **`backend/`**: API REST en Node.js + Express, Socket.IO para eventos en vivo, caché en SQLite, y cliente HTTP para Trello API.
*   **`frontend/`**: Aplicación SPA construida con React 19, Vite 5, Tailwind CSS y Framer Motion.

## 🛠️ Requisitos Previos

1.  **Node.js v18+** y npm.
2.  **Credenciales de Trello**:
    *   Ingresa a: [https://trello.com/app-key](https://trello.com/app-key)
    *   Copia tu **Developer API Key**.
    *   Genera un **Token** de acceso y cópialo.

## 🚀 Inicio Rápido (Desarrollo Local)

### En Windows:
1.  Crea un archivo llamado `.env` en la carpeta `backend/` copiando el contenido de `.env.example`.
2.  Coloca tu `TRELLO_API_KEY` y `TRELLO_TOKEN` en `backend/.env`.
3.  Ejecuta el archivo `start-dev.bat` (doble clic o desde la consola).
4.  Esto abrirá de forma automática las dos terminales necesarias e instalará las dependencias.
5.  Abre [http://localhost:5173](http://localhost:5173) en tu navegador.

### Manualmente (Cualquier SO):
1.  **Backend**:
    ```bash
    cd backend
    npm install
    npm run dev
    ```
2.  **Frontend**:
    ```bash
    cd frontend
    npm install
    npm run dev
    ```

## 🐳 Despliegue en VPS (Docker)

El proyecto incluye archivos Docker listos para producción. Para desplegar en local o en el servidor VPS usando Docker Compose:

```bash
# Definir variables de entorno en la raíz o en docker-compose
docker-compose up --build -d
```

---
Creado para Ganepal IT por Antigravity.
