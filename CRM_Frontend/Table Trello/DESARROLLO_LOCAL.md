# 💻 Desarrollo Local - Skylab Tareas MVP

Guía para ejecutar **backend + frontend localmente** sin Docker.

---

## 📋 Requisitos

Verifica que tengas instalado:

```bash
# Node.js v18 o superior
node --version
# Esperado: v18.x.x o superior

# npm
npm --version
# Esperado: 9.x.x o superior
```

**Si no tienes Node.js:**
- Descárgalo de: https://nodejs.org (LTS)
- Instala Node (npm viene incluido)
- Reinicia la terminal

---

## 📁 Paso 1: Estructura de carpetas

Crea esta estructura en tu máquina local:

```
skylab-tareas/
├── backend/
│   ├── src/
│   │   ├── server.js
│   │   ├── config/
│   │   │   └── trello.js
│   │   ├── routes/
│   │   │   ├── tableros.js
│   │   │   └── webhooks.js
│   │   ├── controllers/
│   │   │   ├── tableros.controller.js
│   │   │   └── webhooks.controller.js
│   │   ├── services/
│   │   │   └── trello.service.js
│   │   ├── db/
│   │   │   └── init.js
│   │   └── middleware/
│   │       └── errorHandler.js
│   ├── package.json
│   └── .env
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── index.jsx
│   │   ├── index.css
│   │   ├── App.css
│   │   └── components/
│   │       ├── SelectorTablero.jsx
│   │       ├── TareasKanban.jsx
│   │       ├── TareaCard.jsx
│   │       └── Loader.jsx
│   ├── package.json
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── .env.local
│
└── .gitignore
```

Todos estos archivos ya están generados, solo cópialos a tu máquina local.

---

## 🔑 Paso 2: Configurar credenciales Trello

### 2.1 Obtener credenciales

1. Ve a: https://trello.com/app-key
2. Copia tu **API Key**
3. Haz clic en **"Token"** → Genera uno nuevo
4. Copia el **Token**

### 2.2 Configurar `.env` en backend

En **`backend/.env`** (crear si no existe):

```env
# TRELLO API
TRELLO_API_KEY=tu_nueva_api_key
TRELLO_TOKEN=tu_nuevo_token

# SERVIDOR BACKEND
NODE_ENV=development
PORT=3003
HOST=localhost

# BASE DE DATOS (local)
DATABASE_PATH=./data/skylab-tareas.db

# FRONTEND URL (para desarrollo)
VITE_API_URL=http://localhost:3003
```

**Reemplaza:**
- `tu_nueva_api_key` → Tu API Key real
- `tu_nuevo_token` → Tu Token real

### 2.3 Configurar `.env.local` en frontend

En **`frontend/.env.local`** (crear si no existe):

```env
# URL del backend local
VITE_API_URL=http://localhost:3003
```

---

## 🚀 Paso 3: Instalar dependencias

Abre **dos terminales** (una para backend, otra para frontend).

### Terminal 1: Backend

```bash
# Ir a carpeta backend
cd skylab-tareas/backend

# Instalar dependencias
npm install

# Debería instalar:
# - express
# - axios
# - dotenv
# - sqlite3
# - cors
# - helmet
# - morgan
# - socket.io
```

Espera a que termine (puede tardar 1-2 minutos).

### Terminal 2: Frontend

```bash
# Ir a carpeta frontend
cd skylab-tareas/frontend

# Instalar dependencias
npm install

# Debería instalar:
# - react
# - react-dom
# - axios
# - socket.io-client
# - vite
# - tailwindcss
```

Espera a que termine.

---

## ⚙️ Paso 4: Ejecutar servicios

### Iniciar Backend (Terminal 1)

```bash
cd skylab-tareas/backend

# Iniciar en modo desarrollo
npm run dev
```

**Esperado:**
```
🚀 Servidor Skylab Tareas corriendo en http://localhost:3003
📊 API: http://localhost:3003/api
⚡ WebSocket: ws://localhost:3003
🏥 Health: http://localhost:3003/health
```

✅ Backend está **LISTO** cuando ves este mensaje.

### Iniciar Frontend (Terminal 2)

```bash
cd skylab-tareas/frontend

# Iniciar servidor de desarrollo
npm run dev
```

**Esperado:**
```
VITE v5.0.8  ready in XXX ms

➜  Local:   http://localhost:5173/
➜  press h to show help
```

✅ Frontend está **LISTO** cuando ves este mensaje.

---

## 🌐 Paso 5: Acceder a la aplicación

Abre tu navegador:

- **Dashboard:** http://localhost:5173
- **API:** http://localhost:3003/api/tableros
- **Health:** http://localhost:3003/health

---

## ✅ Verificar que funciona

### Test 1: ¿Ves los tableros?

1. Abre http://localhost:5173
2. Debería mostrar un selector de tableros con tus tableros Trello
3. Si ves "Soporte 2026", "Mantenimientos", etc. → ✅ Funciona

### Test 2: Crear una tarjeta

1. Selecciona un tablero
2. Haz clic en "+ Agregar tarjeta"
3. Escribe título y descripción
4. Haz clic en "✅ Crear"
5. La tarjeta debería aparecer en el tablero

### Test 3: Actualización en tiempo real

1. Abre Trello en otra pestaña
2. Crea una tarjeta en Trello
3. Vuelve al dashboard sin refrescar
4. La tarjeta debería aparecer automáticamente (después de 30 segundos máximo)

### Test 4: Eliminar tarjeta

1. Pasa el mouse sobre una tarjeta
2. Haz clic en ⋮ (más opciones)
3. Haz clic en "🗑️ Eliminar"
4. Confirma
5. La tarjeta debería desaparecer

---

## 🛠️ Comandos útiles

### Backend

```bash
cd backend

# Iniciar en desarrollo (con auto-reload)
npm run dev

# Iniciar en producción
npm start
```

### Frontend

```bash
cd frontend

# Iniciar servidor de desarrollo
npm run dev

# Build para producción
npm run build

# Ver build en local
npm run preview
```

---

## 🐛 Troubleshooting Desarrollo Local

### Error: "Cannot find module 'express'"

```bash
# Solución: Reinstalar dependencias
cd backend
rm -rf node_modules package-lock.json
npm install
```

### Error: "Port 3003 already in use"

```bash
# Solución: Cambiar puerto en backend/.env
PORT=3004

# O matar proceso que usa 3003:
# En Linux/Mac:
lsof -ti:3003 | xargs kill -9

# En Windows:
netstat -ano | findstr :3003
taskkill /PID <PID> /F
```

### Error: "TRELLO_API_KEY is undefined"

```bash
# Solución: Verificar archivo .env existe en backend/
cat backend/.env

# Debería mostrar:
# TRELLO_API_KEY=tu_clave
# TRELLO_TOKEN=tu_token
```

### Tableros no aparecen en dashboard

```bash
# Verificar que backend está corriendo:
curl http://localhost:3003/api/tableros

# Si devuelve error, revisar logs en Terminal 1
# Si devuelve datos, problema es en frontend (Ver F12 → Console)
```

### WebSocket no conecta

1. Abre DevTools (F12)
2. Ve a Network → WS
3. Busca "socket.io"
4. Si dice "pending" rojo → Backend no está corriendo
5. Si dice "101" verde → ✅ Funciona

---

## 📂 Estructura de archivos generados

**Backend:**
- `server.js` → Punto de entrada Express
- `config/trello.js` → Configuración API Trello
- `services/trello.service.js` → Métodos para interactuar con Trello
- `controllers/tableros.controller.js` → Lógica de endpoints
- `routes/tableros.js` → Definición de rutas
- `db/init.js` → Inicialización SQLite
- `middleware/errorHandler.js` → Manejo de errores

**Frontend:**
- `App.jsx` → Componente principal
- `components/SelectorTablero.jsx` → Selector de tableros
- `components/TareasKanban.jsx` → Vista Kanban
- `components/TareaCard.jsx` → Tarjeta individual
- `components/Loader.jsx` → Loading state

---

## 🔄 Flujo de trabajo local

1. **Terminal 1:** Backend corriendo (`npm run dev`)
2. **Terminal 2:** Frontend corriendo (`npm run dev`)
3. Abre http://localhost:5173
4. Trabaja, itera, prueba
5. Los cambios se refrescan automáticamente (hot reload)

---

## 🔐 Archivos a NO compartir

Nunca hagas commit de:
- `backend/.env` (credenciales Trello)
- `frontend/.env.local`
- `node_modules/` (carpetas grandes)
- `backend/data/` (BD local)

Usa `.gitignore` para ignorarlos.

---

## ✨ Próximos pasos

Una vez que todo funcione localmente:

1. ✅ Prueба crear/editar/eliminar tarjetas
2. ✅ Verifica sincronización en tiempo real
3. ✅ Prueba con diferentes tableros (Soporte 2026, Mantenimientos)
4. ✅ Ajusta UI según tus necesidades
5. 📋 Documenta cambios para fase Excel
6. 🐳 Cuando esté estable → Migra a Docker/VPS

---

## 📞 Debugging

Si algo no funciona:

### 1. Verifica que ambos servidores corren

Terminal 1:
```
🚀 Servidor corriendo en http://localhost:3003
```

Terminal 2:
```
➜  Local:   http://localhost:5173/
```

### 2. Revisa logs en Terminal 1

Busca mensajes de error cuando hagas acciones.

### 3. Abre DevTools (F12) en navegador

- **Console:** Errores JavaScript
- **Network:** Requests a API
- **Application:** LocalStorage, Cookies

### 4. Prueba endpoint directamente

```bash
# En otra terminal:
curl http://localhost:3003/api/tableros

# Debería retornar JSON con tus tableros
```

---

## 🎯 Checklist de inicio

- [ ] Node.js v18+ instalado
- [ ] Credenciales Trello obtenidas
- [ ] `backend/.env` configurado con credenciales
- [ ] `frontend/.env.local` configurado
- [ ] `npm install` en backend ✅
- [ ] `npm install` en frontend ✅
- [ ] Backend corriendo en Terminal 1 ✅
- [ ] Frontend corriendo en Terminal 2 ✅
- [ ] Navegador abierto en http://localhost:5173
- [ ] Ves los tableros Trello en dashboard ✅

---

**¡Listo para desarrollar localmente!** 🚀

Una vez que todo funcione, haremos la migración a Docker y VPS.

---

Created with ❤️ para Ganepal IT
