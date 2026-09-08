# SPEC 0005 — Módulo "Bots Gane Palmira": detalle, consistencia y CRM por bot

- **Estado:** Aprobada
- **Autor:** equipo Skylab (@jbeltran)
- **Fecha:** 2026-09-08
- **Módulos afectados:** CRM_Frontend / Analítica de Agentes (`Dashboard.jsx`, `ChatbotAnalyticsPanel.jsx`,
  `Layout.jsx`, `App.jsx`); servicio `chatbot-analytics` (endpoint de transcripción).
- **Rama:** `feat/0005-bots-gane-palmira`
- **PR:** _pendiente_

## 1. Problema / oportunidad

Tras la integración de Oskitar y Betty (spec 0004), el módulo quedó funcional pero con
inconsistencias y espacio desaprovechado. El usuario aportó 8 propuestas concretas.

## 2. Objetivo

El módulo "Bots Gane Palmira" presenta los 3 bots (Comercial, Oskitar, Betty) con un mismo
lenguaje visual, navegación por submenú, cabecera compacta, un resumen narrativo por bot, y
una **ficha de contacto con historial de conversación** por bot.

## 3. Alcance (por tandas)

### Tanda 1 — Nombre, espacio y narrativa
1. **Renombrar** el módulo a **"Bots Gane Palmira"** (nav lateral + cabecera de página + `<h2>`).
3. **Cabecera compacta:** quitar el título duplicado (cabecera del layout + tarjeta interna).
   Subir el conmutador de bot y la barra de herramientas/periodo a la zona superior.
4. **Quitar el KPI "Cobertura SIISS"** de la vista Bot Comercial.
8. **Resumen en lenguaje natural** al inicio de cada una de las 3 vistas: 1-2 frases generadas
   de los KPIs del periodo ("En los últimos 7 días, Oskitar atendió N conversaciones de M
   personas y contuvo el X% sin escalar…").

### Tanda 2 — Consistencia de KPIs y periodo
5. Oskitar y Betty usan **el mismo componente de KPI** que Bot Comercial (`KpiCard` de
   `Dashboard.jsx`, con degradado tenue e icono arriba). Se exporta y reutiliza.
6. Oskitar y Betty usan **el mismo selector de periodo** que Bot Comercial (`<select>` con
   `Hoy (Últimas 24h)` / `Últimos 7 días` / `Último mes` / `Último año`), mapeado a `from/to`.

### Tanda 3 — Submenú por bot
2. El ítem "Bots Gane Palmira" del sidebar pasa a **grupo desplegable** con:
   `Bot Comercial` → `/bots/comercial`, `Oskitar` → `/bots/oskitar`, `Betty` → `/bots/betty`.
   `/` redirige a `/bots/comercial`. La vista lee el bot de la ruta; el conmutador de pestañas
   dentro de la ventana sigue funcionando y sincroniza la URL.

### Tanda 4 — CRM por bot (ficha de contacto + historial)
7. Por cada bot, una vista de **contactos** (estilo CRM moderno): lista de personas que
   escribieron + panel de detalle con **transcripción de la conversación**, categorías/intención,
   estado (resuelto / escalado / no disponible), y datos del contacto (teléfono, documento,
   primera/última interacción, nº de conversaciones). **Solo lectura** en esta spec.
   - Servicio: nuevo endpoint `GET /api/:bot/contact?id=<phone>` (o `/messages`) que devuelve la
     transcripción del contacto desde los eventos/logs ya cargados.
   - Front: se accede desde la tabla de personas/clientes existente (fila → abre la ficha) y/o
     una sub-pestaña "Contactos".

## 4. No-objetivos

- **No** se edita nada del contacto (tags, notas, estado, asignación) — es solo lectura.
- **No** se unifican los CRM de los 3 bots en uno (queda como idea futura).
- **No** se cambia el cálculo analítico de `chatbot-analytics` (solo se añade el endpoint de
  transcripción, que lee lo ya cargado).
- **No** se toca el Bot Comercial más allá de: quitar KPI SIISS, añadir resumen narrativo,
  y su ficha de contacto (lee Supabase, no el servicio).
- **No** se añade autenticación a `chatbot-analytics`.

## 5. Criterios de aceptación

- [ ] El módulo se llama "Bots Gane Palmira" en el sidebar y la cabecera; no hay título duplicado.
- [ ] El conmutador de bot y el selector de periodo están en la zona superior; se gana alto útil.
- [ ] Bot Comercial ya no muestra "Cobertura SIISS".
- [ ] Las 3 vistas abren con un párrafo de resumen coherente con los KPIs del periodo.
- [ ] Oskitar y Betty usan el `KpiCard` y el `<select>` de periodo idénticos a Bot Comercial.
- [ ] Sidebar: grupo "Bots Gane Palmira" con 3 sub-ítems; rutas `/bots/*`; `/` redirige.
      El deep-link y el conmutador de pestañas mantienen la URL sincronizada.
- [ ] Cada bot tiene una ficha de contacto con transcripción real (Oskitar/Betty vía servicio;
      Comercial vía Supabase), estado y datos del contacto.
- [ ] `npm run lint` (sin errores nuevos) + `npm run build` verdes; verificado en Docker local,
      tema claro y oscuro.

## 6. Restricciones de arquitectura y diseño

- `CRM_Frontend/docs/design-system.md` obligatorio.
- El endpoint nuevo de `chatbot-analytics` respeta `MASK_PHONES` y el CORS ya abierto.
- Rutas `/bots/*` bajo el `ProtectedRoute` con el `module` que hoy usa `/` (`bot-activity`).
- Reutilizar (`KpiCard`, selector de periodo) en vez de duplicar; extraer a componente si hace falta.

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| El resumen narrativo "miente" si un KPI viene raro (p. ej. tasa 200%) | Bajo | Frases defensivas; se omite el dato si es `null`/absurdo |
| La transcripción por contacto puede ser larga | Medio | Paginar/limitar en el endpoint; virtualizar o "cargar más" en el front |
| Cambiar `/` por `/bots/comercial` rompe enlaces guardados | Bajo | `/` redirige a `/bots/comercial` de forma permanente |
| `KpiCard` de Bot Comercial no encaja con los KPIs de Oskitar (más densos) | Bajo | Ajustar `accent`/`icon` por KPI; el layout de grid es el mismo |

## 8. Impacto en producción

- **Usuario:** el módulo se llama distinto, ocupa mejor el espacio, se navega por submenú y
  cada bot gana un resumen y una ficha de contacto. Sin pérdida de funciones.
- **Despliegue:** rebuild de `crm-frontend` y de `chatbot-analytics` (endpoint nuevo).
- **Rollback:** `git revert` del merge + rebuild. Sin migraciones (todo lectura).
