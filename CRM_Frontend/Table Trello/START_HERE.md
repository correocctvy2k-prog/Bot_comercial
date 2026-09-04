# 🚀 START HERE - Desarrollo Local

**Guía súper rápida para ejecutar el MVP localmente en tu máquina.**

---

## ✅ Checklist Pre-requisitos

- [ ] Tengo **Node.js v18+** instalado (verificar: `node --version`)
- [ ] Tengo **npm** instalado (verificar: `npm --version`)
- [ ] Tengo las **credenciales Trello** (API Key + Token) de https://trello.com/app-key
- [ ] Los archivos están descargados/copiados en una carpeta local

---

## 🔑 Paso 1: Configurar credenciales Trello

### 1.1 Obtener credenciales

1. Ve a: https://trello.com/app-key
2. Copia tu **API Key** (está visible en la página)
3. Haz clic en **"Token"** → Genera uno nuevo
4. Copia el **Token**

### 1.2 Crear archivo `backend/.env`

En la carpeta **`backend/`** crea un archivo llamado `.env` con esto:

```env
TRELLO_API_KEY=tu_api_key_aqui
TRELLO_TOKEN=tu_token_aqui
NODE_ENV=development
PORT=3003
HOST=localhost
DATABASE_PATH=./data/skylab-tareas.db
VITE_API_URL=http://localhost:3003
```

**Reemplaza:**
- `tu_api_key_aqui` con tu API Key real
- `tu_token_aqui` con tu Token real

---

## 🚀 Paso 2: Instalar y ejecutar

### Opción A: Script automático (Recomendado)

**Linux / Mac:**
```bash
chmod +x start-dev.sh
./start-dev.sh
```

**Windows:**
```bash
start-dev.bat
```

Esto instalará dependencias automáticamente.

### Opción B: Manual

#### Terminal 1 (Backend):
```bash
cd backend
npm install
npm run dev
```

**Esperado:**
```
🚀 Servidor Skylab Tareas corriendo en http://localhost:3003
```

#### Terminal 2 (Frontend):
```bash
cd frontend
npm install
npm run dev
```

**Esperado:**
```
➜  Local:   http://localhost:5173/
```

---

## 🌐 Paso 3: Acceder a la aplicación

Abre tu navegador en:

### **http://localhost:5173**

Debería ver:
- Selector de tableros (con tus tableros Trello)
- Vista Kanban cuando selecciones uno
- Botones para crear/editar/eliminar tarjetas

---

## ✅ Verificación rápida

### ¿Ves los tableros Trello?
- ✅ SÍ → Conexión funcionando
- ❌ NO → Revisa credenciales en `.env`

### ¿Puedes crear una tarjeta?
- ✅ SÍ → CRUD funcionando
- ❌ NO → Revisa logs en Terminal 1

### ¿Se actualiza en tiempo real?
- Crea una tarjeta en Trello app → Debería aparecer en dashboard
- ✅ SÍ → WebSocket funcionando
- ❌ NO → Verifica F12 → Console

---

## 📁 Estructura (simplificada)

```
skylab-tareas/
├── backend/                 ← Servidor Node.js
│   ├── src/
│   ├── .env                 ← ⚠️ Crear este archivo
│   └── package.json
├── frontend/                ← Dashboard React
│   ├── src/
│   └── package.json
├── DESARROLLO_LOCAL.md      ← Guía detallada
├── start-dev.sh             ← Script Linux/Mac
├── start-dev.bat            ← Script Windows
└── README.md                ← Documentación
```

---

## 🛠️ Comandos útiles

### Backend
```bash
cd backend

npm run dev      # Iniciar en desarrollo (con auto-reload)
npm start        # Iniciar normal
```

### Frontend
```bash
cd frontend

npm run dev      # Iniciar servidor desarrollo
npm run build    # Build para producción
npm run preview  # Ver build localmente
```

---

## 🐛 Errores comunes

### "Cannot find module 'express'"
```bash
cd backend
rm -rf node_modules
npm install
```

### "Port 3003 already in use"
Cambia en `backend/.env`:
```env
PORT=3004
```

### "TRELLO_API_KEY is undefined"
Asegúrate que `backend/.env` existe y tiene credenciales.

### Tableros no aparecen
```bash
# Verifica que backend responde:
curl http://localhost:3003/api/tableros

# Abre DevTools (F12) → Console para ver errores
```

---

## 📚 Documentación disponible

| Archivo | Para qué |
|---------|----------|
| **DESARROLLO_LOCAL.md** | Guía completa de desarrollo local |
| **README.md** | Documentación general del proyecto |
| **API.md** | Referencia de endpoints con ejemplos |
| **docker-compose.yml** | Para cuando migres a VPS (próximo) |

---

## 🔄 Workflow típico

1. **Terminal 1:** `cd backend && npm run dev`
   - Backend corriendo en http://localhost:3003

2. **Terminal 2:** `cd frontend && npm run dev`
   - Frontend corriendo en http://localhost:5173

3. **Navegador:** Abre http://localhost:5173

4. **Desarrollo:**
   - Haz cambios en código
   - Se refrescan automáticamente (hot reload)
   - Testa, itera, repite

5. **Cuando esté estable:**
   - Documenta cambios
   - Prepara para migración a Docker/VPS

---

## ✨ Qué puedes hacer ahora

✅ Ver todos tus tableros Trello
✅ Ver tarjetas en vista Kanban
✅ Crear nuevas tarjetas desde el dashboard
✅ Editar tarjetas (nombre, descripción, etc)
✅ Mover tarjetas entre listas
✅ Eliminar/archivar tarjetas
✅ Ver actualizaciones en tiempo real

---

## 🎯 Próximos pasos (después de validar)

1. ✅ Prueba intensiva local
2. ✅ Feedback y ajustes
3. 📊 Integración con Excel (nueva fase)
4. 🐳 Migración a Docker/VPS (cuando esté listo)
5. 🔗 Integración con Skylab dashboard

---

## 📞 Si tienes problemas

1. Verifica que **ambas terminales** muestran "✅ listo"
2. Revisa **credenciales en backend/.env**
3. Abre **DevTools (F12)** → Console para ver errores
4. Lee **DESARROLLO_LOCAL.md** para soluciones completas

---

## 🔐 Importante

**NUNCA hagas commit de:**
- `backend/.env` (contiene credenciales)
- `node_modules/` (carpetas grandes)
- `backend/data/` (BD local)

Usa `.gitignore` para ignorarlos.

---

## 💡 Quick tip

Si quieres ver los tableros que tienes en Trello desde línea de comandos:

```bash
curl http://localhost:3003/api/tableros
```

Debería devolver un JSON con todos tus tableros.

---

**¡Listo para comenzar! 🚀**

Abre 2 terminales y sigue los pasos de arriba.

Si algo no funciona, lee **DESARROLLO_LOCAL.md** para debugging.

---

Created with ❤️ para Ganepal IT
