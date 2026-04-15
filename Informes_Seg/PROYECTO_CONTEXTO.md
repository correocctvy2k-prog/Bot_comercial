# 📋 CONTEXTO MAESTRO: INFORMES_SEG — Sistema de Informes de Seguridad
> **Última actualización:** 2026-04-09  
> **Propósito:** Referencia rápida para el asistente IA. Leer antes de intervenir en este proyecto.

---

## 🗂️ UBICACIÓN DEL PROYECTO

**Ruta raíz:** `C:\Users\johnathan.beltran\.gemini\antigravity\playground\final-skylab\Informes_Seg\`

> ⚠️ **NOTA CRÍTICA DE RUTAS:** Este proyecto **no está en su propio repositorio separado**, sino dentro de la carpeta de **final-skylab**. Tener esto en cuenta antes de hacer cualquier `git` operation (el repositorio raíz es `Bot_comercial` en GitHub).

---

## 🎯 PROPÓSITO DEL PROYECTO

Sistema para la **automatización de informes de seguridad del sector privado** (parqueadero P. Bolívar / empresa Gane Palmira). Combina:
1. **Backend Python:** Extrae y procesa datos del sistema LPR para generar informes mensuales estructurados
2. **Frontend Next.js (Canvas):** Interfaz visual para composición y personalización del informe
3. **Integraciones IA:** Gemini, DeepSeek, OpenAI para análisis narrativo automático de datos de seguridad
4. **n8n MCP Bridge:** Conexión con flujos de automatización n8n para orquestar el pipeline

---

## 🏗️ ESTRUCTURA DEL PROYECTO

```
Informes_Seg/
├── 2025/                          ← Informes generados archivados
│   ├── Octubre/                   ← Reporte mensual Octubre 2025
│   └── Noviembre/                 ← Reporte mensual Noviembre 2025
├── informes_seguridad/            ← 🐍 Backend Python de generación de informes
│   ├── .env                       ← API Keys (Gemini, DeepSeek, OpenAI)
│   ├── error.log                  ← Log de errores
│   ├── n8n-mcp-bridge/            ← Puente WebSocket n8n ↔ Python
│   │   └── .env                   ← URL y token del servidor n8n
│   └── src/                       ← Módulos Python (actualmente solo __pycache__)
│       ├── analyzers/             ← (en desarrollo) Analizadores de datos
│       ├── extractors/            ← (en desarrollo) Extractores de fuentes
│       ├── generators/            ← (en desarrollo) Generadores de secciones
│       ├── processors/            ← (en desarrollo) Procesadores de datos
│       └── utils/                 ← (en desarrollo) Utilidades compartidas
└── security-report-canvas/        ← ⚛️ Frontend Next.js (informe visual)
    └── .next/                     ← Build de producción de Next.js
```

> **Nota arquitectónica:** El código fuente real del procesamiento Python se encuentra en el proyecto **LPR Pro** (`charged-gemini/parking_agent/` y `parking_desktop/core/`). Los módulos en `informes_seguridad/src/` son la arquitectura planificada para el módulo de generación de informes independiente.

---

## 🔑 VARIABLES DE ENTORNO

### `informes_seguridad/.env`
```
GEMINI_API_KEY=AIzaSyAwr7azXJWt47aofR3-yxYCo_0n_9v-lP0
OPENAI_API_KEY=<pendiente configurar>
DEEPSEEK_API_KEY=sk-8bee1349151349569e7a2e071ed18a79
```

### `informes_seguridad/n8n-mcp-bridge/.env`
```
MCP_URL=https://n8n.srv933145.hstgr.cloud/mcp-server/http
MCP_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  (token JWT del servidor n8n)
```

---

## 🏛️ ARQUITECTURA DEL PIPELINE

```
Datos LPR (Google Sheets / SQLite)
        ↓
  Python Backend (informes_seguridad/)
  - Extrae datos mensuales del consolidado
  - Calcula KPIs: precisión, diferencias, ingresos por tipo vehículo
  - Genera análisis narrativo via Gemini / DeepSeek
        ↓
  n8n MCP Bridge
  - Coordina el pipeline a través de flujos n8n
  - URL: https://n8n.srv933145.hstgr.cloud
        ↓
  security-report-canvas (Next.js)
  - Dashboard visual del informe mensual
  - Composición de secciones personalizables
  - Exportación a PDF
        ↓
  Informe archivado en Informes_Seg/2025/[Mes]/
```

---

## 🤖 INTEGRACIÓN n8n

El proyecto usa **n8n** (alojado en `n8n.srv933145.hstgr.cloud`) como orquestador del pipeline de automatización. El puente `n8n-mcp-bridge` conecta el backend Python con los flujos n8n a través del protocolo MCP (Model Context Protocol).

- **Servidor n8n:** `https://n8n.srv933145.hstgr.cloud`
- **Endpoint MCP:** `/mcp-server/http`
- **Autenticación:** JWT en el header `Authorization: Bearer <MCP_TOKEN>`

---

## 🔗 RELACIÓN CON LPR PRO

Este proyecto está **estrechamente relacionado** con el proyecto LPR Pro (`charged-gemini/`):

| Aspecto | LPR Pro | Informes_Seg |
|---|---|---|
| **Fuente de datos** | Genera los datos (procesa imágenes, sube a Sheets) | Consume los datos para hacer informes |
| **Google Sheets** | Escribe datos diarios/mensuales en hojas | Lee el `Consolidado` mensual para análisis |
| **Foco** | Operativo: registro diario de vehículos | Estratégico: informes mensuales de seguridad |
| **Stack** | Python + pywebview + JS | Python + Next.js + n8n |
| **IA** | — | Gemini, DeepSeek, OpenAI para narrativas |

---

## ⚛️ FRONTEND (security-report-canvas)

Aplicación **Next.js** que renderiza el informe mensual de seguridad como un canvas interactivo.

- **Build:** Solo tiene `.next/` (producción) — el `src/` y archivos fuente no están presentes localmente
- **Estado:** Parece estar parcialmente integrado — en desarrollo activo

---

## 📂 INFORMES ARCHIVADOS

Los informes mensuales finalizados se guardan en `Informes_Seg/2025/[Mes]/`:
- `2025/Octubre/` — Informe Octubre 2025
- `2025/Noviembre/` — Informe Noviembre 2025

---

## ⚠️ ESTADO ACTUAL DEL PROYECTO

> **Proyecto en desarrollo activo.** La arquitectura modular (`src/analyzers`, `src/generators`, etc.) está planificada pero vacía. El código funcional actual está distribuido entre:
> 1. El proyecto LPR Pro (`charged-gemini/`) — fuente de datos
> 2. Los flujos n8n — orquestación
> 3. El frontend Next.js (`security-report-canvas/`) — visualización

---

## 🔄 FLUJO DE TRABAJO TÍPICO

```
1. Fim de mes: LPR Pro ha poblado el Google Sheet del mes (Consolidado)
2. Ejecutar pipeline Python de informes_seguridad/:
   - Lee datos del Sheet mensual
   - Calcula estadísticas de precisión, ingresos, anomalías
   - Envía datos a LLMs (Gemini/DeepSeek) para generar narrativa
3. n8n orquesta el pipeline y genera el informe
4. security-report-canvas muestra el informe en la UI
5. Exportar a PDF y guardar en Informes_Seg/2025/[Mes]/
```

---

## ✅ CHECKLIST PARA CAMBIOS

### Al modificar el backend Python (`informes_seguridad/`):
- [ ] Verificar que las API keys en `.env` están activas
- [ ] Confirmar que el servidor n8n está disponible antes de ejecutar el pipeline
- [ ] No hacer `git push` de `.env` (contiene keys privadas)

### Al modificar el frontend Next.js:
- [ ] El código fuente Next.js debería estar en otro directorio (solo `.next/` presente)
- [ ] Si hay cambios, rebuild con `npm run build`

---

## 📅 HISTORIAL DE CAMBIOS IMPORTANTES

| Fecha | Cambio |
|---|---|
| 2026-04-09 | Creación de este documento de contexto |
| 2025-11 | Informe Noviembre 2025 generado y archivado |
| 2025-10 | Informe Octubre 2025 generado y archivado |
| 2025-10 | Integración inicial n8n MCP Bridge |
| 2025-09 | Estructura inicial del proyecto Informes_Seg |
