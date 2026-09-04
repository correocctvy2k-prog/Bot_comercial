# 🚀 Skylab Tareas MVP - Guía para Windows

Instrucciones paso a paso para ejecutar el MVP en tu PC Windows.

---

## 📁 ARCHIVOS EN DESCARGAS

Verifica que tienes todo descargado:

```
Descargas/
├── backend/                      ← Servidor Node.js
├── frontend/                     ← Dashboard React
├── LEER_PRIMERO_WINDOWS.md       ← Esta guía
├── START_HERE.md                 ← Guía rápida
├── DESARROLLO_LOCAL.md           ← Guía detallada
├── API.md                        ← Referencia endpoints
├── .env.example                  ← Template variables
├── start-dev.bat                 ← Script automático
└── ... otros archivos
```

---

## 🔑 PASO 1: OBTENER CREDENCIALES TRELLO

### 1.1 Ir a Trello

1. Abre navegador: **https://trello.com/app-key**
2. Verás tu página de API Key

### 1.2 Copiar credenciales

1. **API Key** - Copia el valor (está visible en la página)
2. **Token** - Haz clic en el botón "Token"
   - Se abrirá un diálogo
   - Haz clic en "Create a new token"
   - Selecciona permisos: `read, write`
   - Copia el token generado

**Guardas ambos valores - los usarás en 5 minutos** ✅

---

## 📁 PASO 2: PREPARAR CARPETA EN TU PC

### 2.1 Copiar archivos

1. Ve a tu carpeta **Descargas**
2. Selecciona TODO (Ctrl+A)
3. Copia a una carpeta en tu PC
   - Ejemplo: `C:\proyectos\skylab-tareas`
   - O donde prefieras

### 2.2 Estructura final

Debería quedar así:

```
C:\proyectos\skylab-tareas\
├── backend/
│   ├── src/
│   ├── package.json
│   └── ... (otros archivos)
├── frontend/
│   ├── src/
│   ├── package.json
│   └── ... (otros archivos)
├── LEER_PRIMERO_WINDOWS.md
├── START_HERE.md
├── .env.example
├── start-dev.bat
└── ... otros archivos
```

---

## 🔑 PASO 3: CREAR `backend/.env`

Este es el archivo IMPORTANTE con tus credenciales.

### 3.1 Crear el archivo

1. Abre carpeta: `C:\proyectos\skylab-tareas\backend\`
2. **Clic derecho** en espacio vacío
3. **Nuevo → Documento de texto**
4. Llámalo: `env` (SIN extensión .txt)

> **Nota:** Si Windows agrega `.txt`, renómbralo manualmente a `.env`

### 3.2 Editar el archivo

1. Abre el archivo `backend/.env` con Notepad (clic derecho → Editar)
2. Pega esto:

```env
TRELLO_API_KEY=tu_api_key_aqui
TRELLO_TOKEN=tu_token_aqui
NODE_ENV=development
PORT=3003
HOST=localhost
DATABASE_PATH=./data/skylab-tareas.db
VITE_API_URL=http://localhost:3003
```

### 3.3 Reemplazar valores

Reemplaza:
- `tu_api_key_aqui` → Tu API Key de Trello (paso 1)
- `tu_token_aqui` → Tu Token de Trello (paso 1)

**Ejemplo:**
```env
TRELLO_API_KEY=a1b2c3d4e5f6g7h8
TRELLO_TOKEN=xyz123abc456def789
NODE_ENV=development
...
```

### 3.4 Guardar

- **Ctrl + S** para guardar
- Cierra Notepad

✅ Archivo `backend/.env` creado correctamente

---

## ✅ PASO 4: VERIFICAR NODE.JS

### 4.1 ¿Ya tienes Node.js?

1. Abre **CMD** (Windows + R → escribe "cmd" → Enter)
2. Escribe: `node --version`
3. Presiona Enter

**Resultado esperado:** `v18.x.x` o superior

### 4.2 Si no tienes Node.js

1. Descarga desde: https://nodejs.org (versión LTS)
2. Instala normalmente (siguiente, siguiente, siguiente...)
3. Reinicia Windows o al menos cierra y abre CMD de nuevo
4. Verifica nuevamente: `node --version`

---

## 🚀 PASO 5: EJECUTAR (OPCIÓN A - Automática)

### Opción A: Script automático (MÁS FÁCIL)

1. Ve a carpeta: `C:\proyectos\skylab-tareas\`
2. **Doble clic** en archivo: `start-dev.bat`
3. Se abrirá una ventana CMD
4. Sigue las instrucciones en la ventana

Esto instalará dependencias automáticamente. Luego sigue **Paso 5 Opción B**.

---

## 🚀 PASO 5: EJECUTAR (OPCIÓN B - Manual)

### 🖥️ Terminal 1: BACKEND

1. **Abre CMD** (Windows + R → cmd → Enter)

2. **Navega a carpeta backend:**
   ```
   cd C:\proyectos\skylab-tareas\backend
   ```
   > Ajusta la ruta si guardaste en otro lugar

3. **Primera vez - instalar dependencias:**
   ```
   npm install
   ```
   > Espera a que termine (1-2 minutos)

4. **Iniciar servidor:**
   ```
   npm run dev
   ```

5. **Esperado - Verás:**
   ```
   🚀 Servidor Skylab Tareas corriendo en http://localhost:3003
   📊 API: http://localhost:3003/api
   ⚡ WebSocket: ws://localhost:3003
   🏥 Health: http://localhost:3003/health
   ```

✅ Backend está LISTO

### 🖥️ Terminal 2: FRONTEND

1. **Abre OTRO CMD nuevo** (Windows + R → cmd → Enter)

2. **Navega a carpeta frontend:**
   ```
   cd C:\proyectos\skylab-tareas\frontend
   ```

3. **Primera vez - instalar dependencias:**
   ```
   npm install
   ```
   > Espera a que termine (1-2 minutos)

4. **Iniciar servidor:**
   ```
   npm run dev
   ```

5. **Esperado - Verás:**
   ```
   ➜  Local:   http://localhost:5173/
   press h to show help
   ```

✅ Frontend está LISTO

---

## 🌐 PASO 6: ACCEDER A LA APLICACIÓN

### 6.1 Abrir navegador

1. Abre tu navegador favorito (Chrome, Edge, Firefox)
2. Ve a: **http://localhost:5173**

### 6.2 ¿Qué debería ver?

- ✅ Selector de tableros Trello
- ✅ Mis tableros listados (ej: "Soporte 2026", "Mantenimientos")
- ✅ Botón "Actualizar" en la parte superior

### 6.3 Seleccionar un tablero

1. Haz clic en uno de los tableros
2. Debería mostrar vista **Kanban** con las tarjetas
3. Verás listas (columnas) y tarjetas

✅ **¡FUNCIONA!**

---

## ✅ VERIFICAR QUE TODO FUNCIONA

### ✓ Prueba 1: ¿Ves los tableros?

- **SÍ** → Backend conectado a Trello ✅
- **NO** → Revisa credenciales en `backend/.env`

### ✓ Prueba 2: ¿Puedes crear una tarjeta?

1. Selecciona un tablero
2. En una lista, haz clic en **"+ Agregar tarjeta"**
3. Escribe título y descripción
4. Haz clic en **"✅ Crear"**
5. La tarjeta debería aparecer

- **SÍ** → CRUD funcionando ✅
- **NO** → Revisa logs en Terminal 1 (backend)

### ✓ Prueba 3: Sincronización en tiempo real

1. Abre Trello en otra pestaña del navegador
2. Crea una tarjeta directamente en Trello
3. Vuelve al dashboard (sin refrescar)
4. La tarjeta debería aparecer automáticamente en 30 segundos

- **SÍ** → WebSocket funcionando ✅
- **NO** → Abre F12 (DevTools) → Console y revisa errores

---

## 🛠️ COMANDOS ÚTILES

### Backend

```bash
# Iniciar en desarrollo (con auto-reload)
npm run dev

# Iniciar normal
npm start
```

### Frontend

```bash
# Iniciar servidor desarrollo
npm run dev

# Crear build para producción
npm run build

# Ver el build localmente
npm run preview
```

### Detener servicios

En cualquier terminal: **Ctrl + C**

---

## 🐛 PROBLEMAS COMUNES

### ❌ "npm: comando no reconocido"

**Problema:** Node.js no está instalado

**Solución:**
1. Descarga Node.js: https://nodejs.org (LTS)
2. Instala
3. Reinicia Windows
4. Vuelve a intentar

### ❌ "Port 3003 already in use"

**Problema:** Otro programa usa el puerto

**Solución:** En `backend/.env` cambia:
```env
PORT=3004
```

Luego actualiza también:
```env
VITE_API_URL=http://localhost:3004
```

### ❌ "Cannot find module 'express'"

**Problema:** Las dependencias no se instalaron correctamente

**Solución:**
```bash
cd backend
rm -r node_modules
npm install
```

### ❌ Tableros no aparecen en el dashboard

**Problema:** Credenciales Trello inválidas

**Solución:**
1. Verifica `backend/.env`
2. Confirma que copiaste bien:
   - `TRELLO_API_KEY`
   - `TRELLO_TOKEN`
3. Abre DevTools (F12) → Console y busca errores rojos

### ❌ Puerta 5173 en uso

**Problema:** Otro programa usa el puerto frontend

**Solución:**
```bash
cd frontend
npm run dev -- --port 5174
```

### ❌ "Cannot find module sqlite3"

**Problema:** Las dependencias de backend no se instalaron

**Solución:**
```bash
cd backend
npm install sqlite3
npm install
```

---

## 📚 DOCUMENTACIÓN DISPONIBLE

Dentro de tu carpeta tienes:

| Archivo | Para qué |
|---------|----------|
| **LEER_PRIMERO_WINDOWS.md** | Esta guía (para Windows) |
| **START_HERE.md** | Quick start universal (5 min) |
| **DESARROLLO_LOCAL.md** | Guía detallada + troubleshooting avanzado |
| **API.md** | Referencia de todos los endpoints REST |
| **RESUMEN_EJECUTIVO.md** | Resumen técnico del proyecto |
| **README.md** | Documentación general |

---

## 🔐 IMPORTANTE - SEGURIDAD

### ⚠️ NO COMPARTAS ni publiques:

- ❌ El archivo `backend/.env` (contiene credenciales)
- ❌ La carpeta `node_modules/` (demasiado grande)
- ❌ La carpeta `backend/data/` (BD local)

Estos archivos están en `.gitignore` automáticamente ✅

### ⚠️ Si expones accidentalmente credenciales:

1. Ve a https://trello.com/app-key
2. Haz clic en "Revoke"
3. Genera un **nuevo Token**
4. Actualiza tu `backend/.env`

---

## ✨ CHECKLIST ANTES DE EMPEZAR

- [ ] Descargué todos los archivos de Descargas
- [ ] Copié a carpeta local (ej: C:\proyectos\skylab-tareas)
- [ ] Tengo Node.js v18+ instalado
- [ ] Obtuve credenciales Trello (API Key + Token)
- [ ] Creé archivo `backend/.env` con credenciales
- [ ] Tengo 2 CMD listas para abrir

---

## 🚀 RESUMEN RÁPIDO

```
1. Descargar archivos de Descargas
2. Crear backend/.env con credenciales Trello
3. Terminal 1: cd backend → npm install → npm run dev
4. Terminal 2: cd frontend → npm install → npm run dev
5. Abre http://localhost:5173
```

**¡Eso es todo! Ya funciona.** 🎉

---

## 📞 SI TIENES PROBLEMAS

1. **Lee DESARROLLO_LOCAL.md** - Tiene sección completa de troubleshooting
2. **Revisa logs en las terminales** - Busca mensajes de error rojos
3. **Abre DevTools (F12)** en navegador → Console tab
4. **Verifica credenciales** en backend/.env

---

## 💡 TIPS ÚTILES

### Ver los tableros desde CMD

```bash
curl http://localhost:3003/api/tableros
```

Debería devolver un JSON con tus tableros.

### Verificar que backend responde

```bash
curl http://localhost:3003/health
```

Debería devolver: `{"status":"ok"}`

### Próximas fases

Cuando tengas esto funcionando y validado:
1. Integración con Excel (sincronizar progreso)
2. WebHooks completamente funcionales
3. Migración a Docker/VPS (192.168.8.65:3003)

---

## 🎊 ¡FELICIDADES!

Ya tienes un **MVP profesional de Trello Dashboard** funcionando localmente.

Ahora puedes:
- ✅ Ver tus tableros Trello
- ✅ Ver tarjetas en vista Kanban
- ✅ Crear/editar/eliminar tarjetas
- ✅ Ver actualizaciones en tiempo real
- ✅ Mover tarjetas entre listas

**¡Que disfrutes desarrollando! 🚀**

---

Creado con ❤️ para Ganepal IT
