# ✅ FASE 2 COMPLETADA - Integración Excel

Toda la integración con Excel está implementada y lista para usar.

---

## 📊 ¿Qué se generó?

### Backend Services
- ✅ `excel.service.js` - Lectura/escritura de Excel
  - 7 métodos para interactuar con archivo
  - Determinación automática de zona y período
  - Validaciones y manejo de errores

### Backend Controllers
- ✅ `excel.controller.js` - Endpoints REST
  - 7 endpoints para operaciones con Excel
  - Estadísticas por zona
  - Historial de sincronizaciones

### Backend Routes
- ✅ `excel.js` - Rutas configuradas
  - POST /api/excel/marcar
  - GET /api/excel/estadisticas
  - GET /api/excel/puntos/:zona
  - POST /api/excel/sincronizar
  - GET /api/excel/resumen
  - GET /api/excel/historial
  - GET /api/excel/periodo/:periodo/resumen

### Webhooks
- ✅ Actualizado `webhooks.controller.js`
  - Nuevo procesamiento de `updateCheckItem`
  - Sincronización automática al marcar checklist
  - Determinación dinámica de período por nombre de tarjeta

### Frontend Component
- ✅ `ExcelStats.jsx` - Dashboard de estadísticas
  - Muestra cumplimiento por zona
  - Visualización de 3 períodos
  - Actualización automática cada 30 segundos
  - Selector de zonas

### Database
- ✅ Nueva tabla `sincronizacion_excel`
  - Registra cada sincronización
  - Auditoría completa

---

## 🚀 Cómo activar Fase 2

### Paso 1: Actualizar dependencias

```bash
cd backend
npm install openpyxl
```

**Nota:** `openpyxl` es la librería Node.js para Excel. Si da error, instala:
```bash
npm install exceljs
```

### Paso 2: Verificar conexión a Excel

El archivo debe estar accesible desde tu máquina en:
```
\\ganepalmir\dpto.informatica\Director.Informatica\...
```

Si no está accesible, pide al área de red que configure la ruta.

### Paso 3: Actualizar Trello con puntos 2026

Necesitas tener en Trello la estructura correcta:

**Tablero:** `Mantenimientos`

**Listas por mes:**
```
- Enero       (Items: todos los puntos de PALMIRA)
- Febrero     (Items: todos los puntos de PALMIRA)
- Marzo       (Items: todos los puntos de PALMIRA)
- ... etc
```

**Items en checklist:** Nombres exactos de los puntos
```
Ejemplo para Enero (PALMIRA):
☐ OfiPpalPalmira
☐ Empresarios
☐ Parqueadero Ganador
☐ Cigarra
... (resto de puntos)
```

### Paso 4: Registrar Webhook de Trello

Para que los cambios se sincronicen automáticamente:

```bash
# 1. Obtener ID del tablero
curl -X GET "https://api.trello.com/1/members/me/boards?key=TU_API_KEY&token=TU_TOKEN"

# 2. Crear webhook
curl -X POST "https://api.trello.com/1/webhooks?key=TU_API_KEY&token=TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "callbackURL": "http://192.168.8.65:3003/webhooks/trello",
    "idModel": "ID_TABLERO_MANTENIMIENTOS",
    "description": "Skylab Excel Sync"
  }'
```

Debería retornar:
```json
{
  "id": "webhook_id",
  "idModel": "...",
  "callbackURL": "http://192.168.8.65:3003/webhooks/trello",
  "active": true,
  ...
}
```

### Paso 5: Probar Webhook

```bash
# Enviar evento de prueba
curl -X POST http://localhost:3003/webhooks/trello \
  -H "Content-Type: application/json" \
  -d '{
    "action": {
      "type": "updateCheckItem",
      "data": {
        "checkItem": {
          "id": "test123",
          "name": "OfiPpalPalmira",
          "state": "complete"
        },
        "card": {
          "id": "card123",
          "name": "Mantenimientos CCTV Enero"
        }
      }
    }
  }'
```

**Esperado en logs:**
```
🔄 Item actualizado: OfiPpalPalmira → complete
📍 Sincronizando: OfiPpalPalmira [PALMIRA] R1
✅ Sincronizado con Excel: OfiPpalPalmira
```

---

## 📋 Endpoints disponibles

### 1. Marcar mantenimiento (Manual)

```bash
POST /api/excel/marcar
{
  "nombrePunto": "OfiPpalPalmira",
  "zona": "PALMIRA",
  "periodo": "R1",
  "fecha": "2026-01-15T10:30:00Z"
}
```

### 2. Ver estadísticas

```bash
GET /api/excel/estadisticas
GET /api/excel/estadisticas?zona=PALMIRA
```

### 3. Listar puntos de una zona

```bash
GET /api/excel/puntos/PALMIRA
```

### 4. Ver resumen completo

```bash
GET /api/excel/resumen
```

### 5. Sincronizar múltiples items

```bash
POST /api/excel/sincronizar
{
  "mes": "2026-01",
  "items": [
    { "nombre": "OfiPpalPalmira", "zona": "PALMIRA" },
    { "nombre": "Empresarios", "zona": "PALMIRA" }
  ]
}
```

### 6. Ver historial

```bash
GET /api/excel/historial?limite=50
```

### 7. Resumen por período

```bash
GET /api/excel/periodo/R1/resumen
```

---

## 💻 Agregar componente al frontend

En **`App.jsx`**, agregar:

```jsx
import ExcelStats from './components/ExcelStats'

function App() {
  // ... código existente

  return (
    <div>
      {/* ... contenido existente */}
      
      {/* NUEVO: Agregar después del dashboard de tareas */}
      <div className="mt-8">
        <ExcelStats apiUrl={API_URL} />
      </div>
    </div>
  )
}
```

---

## 🔄 Flujo de sincronización automática

```
1. Técnico abre Trello (app móvil o web)
2. Va a tablero Mantenimientos → mes (Ej: Enero)
3. Marca checklist item: "✓ OfiPpalPalmira"
4. Trello envía webhook POST a http://192.168.8.65:3003/webhooks/trello
5. Backend recibe evento updateCheckItem
6. Extrae: punto="OfiPpalPalmira", mes="Enero", zona="PALMIRA"
7. Determina período: Enero → R1
8. Abre Excel: \\ganepalmir\...
9. Busca fila con "OfiPpalPalmira" en columna H
10. Marca "1" en celda I4 (PALMIRA R1, fila 4)
11. Guarda Excel
12. Registra en BD
13. Emite WebSocket → Dashboard se actualiza
14. Fórmulas Excel calculan % automáticamente
```

---

## ✅ Checklist de validación

- [ ] Archivo Excel está accesible en ruta UNC
- [ ] Backend corriendo con dependencias instaladas
- [ ] Webhook de Trello registrado y activo
- [ ] Tablero Mantenimientos tiene estructura correcta
- [ ] Items en checklist tienen nombres exactos
- [ ] ExcelStats component agregado al frontend
- [ ] npm run dev ejecutándose en ambas carpetas

---

## 🐛 Troubleshooting

### "Excel file not found"
```
Problema: Ruta UNC no accesible
Solución:
1. Verifica que tienes acceso a \\ganepalmir\...
2. Revisa con IT que tienes permisos
3. Prueba abrir la ruta manualmente en Explorer
```

### "Point not found in Excel"
```
Problema: Nombre en Trello no coincide con Excel
Solución:
1. Abre Excel → Hoja Total → Columna H
2. Copia el nombre exacto
3. Pega ese nombre en el checklist de Trello
4. Debe ser idéntico (mayúsculas, espacios, etc)
```

### "Excel file is locked"
```
Problema: Excel está abierto en otra aplicación
Solución:
1. Cierra el archivo Excel
2. No mantenerlo abierto mientras sincronizas
3. La sincronización automática lo abre/cierra
```

### Webhook no recibe eventos
```
Problema: Webhook no está registrado o inactivo
Solución:
1. Verifica: curl https://api.trello.com/1/tokens/{TOKEN}/webhooks?key={KEY}
2. Crea uno nuevo si es necesario
3. Confirma URL: http://192.168.8.65:3003/webhooks/trello
4. Revisa logs del backend cuando marca un item
```

---

## 📊 Ejemplos de uso

### Caso 1: Sincronizar manualmente

```bash
# El técnico no está en Trello, pero quiero registrar un mantenimiento
curl -X POST http://localhost:3003/api/excel/marcar \
  -H "Content-Type: application/json" \
  -d '{
    "nombrePunto": "OfiPpalPalmira",
    "zona": "PALMIRA",
    "periodo": "R1",
    "fecha": "2026-01-15"
  }'
```

### Caso 2: Ver avance en una zona

```bash
curl http://localhost:3003/api/excel/estadisticas?zona=PALMIRA
# Respuesta: { "r1": "75%", "r2": "50%", "r3": "0%", "promedio": "41%" }
```

### Caso 3: Sincronizar mes completo al final del mes

```bash
curl -X POST http://localhost:3003/api/excel/sincronizar \
  -H "Content-Type: application/json" \
  -d '{
    "mes": "2026-01",
    "items": [
      { "nombre": "OfiPpalPalmira", "zona": "PALMIRA" },
      { "nombre": "Empresarios", "zona": "PALMIRA" },
      { "nombre": "Parqueadero Ganador", "zona": "PALMIRA" },
      ...
    ]
  }'
```

---

## 🎯 Próximas mejoras

- [ ] WebHook signing validation (HMAC)
- [ ] Sincronización bidireccional (cambios Excel → Trello)
- [ ] Alertas cuando % cae bajo
- [ ] Reportes automáticos
- [ ] Integración con Slack/Teams
- [ ] Backup automático de Excel

---

## 📝 Documentación generada

```
📚 Documentación disponible:
├── INTEGRACION_EXCEL.md       ← Referencia técnica
├── WEBHOOKS_TRELLO.md         ← Configuración webhooks
├── LEER_PRIMERO_WINDOWS.md    ← Guía rápida
├── API.md                     ← Endpoints REST
└── Este archivo               ← Resumen Fase 2
```

---

## ✨ Resumen

✅ **Backend:** Servicios y endpoints para Excel completamente implementados
✅ **Webhooks:** Procesamiento de updateCheckItem para sincronización automática
✅ **Frontend:** Componente de estadísticas listo
✅ **BD:** Tabla de auditoría para registrar cambios
✅ **Documentación:** Completa y con ejemplos

**Estado:** Listo para usar. Solo necesitas:
1. Tener el Excel accesible
2. Actualizar Trello con puntos 2026
3. Registrar webhook en Trello
4. Ejecutar npm install

---

Creado con ❤️ para Ganepal IT
