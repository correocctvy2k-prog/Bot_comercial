# SPEC 0020 — Soporte: interfaz compacta y bitácora horizontal

- **Estado:** Implementado y verificado en local (lint, build, Docker), pendiente de PR/merge y de desplegar en `.65`
- **Autor:** Claude (a partir de un pedido directo del usuario tras cerrar spec 0019, 2026-10-01)
- **Fecha:** 2026-10-01
- **Módulos afectados:** `CRM_Frontend/src/pages/CctvModule.jsx` (pestaña Soporte, función `RealSupport`).
- **Rama:** `feat/0020-soporte-ui-compacta`
- **PR:** —

## 1. Problema / oportunidad

Con las specs 0018 y 0019 ya cerradas, la pestaña Soporte de Seguridad
Electrónica quedó funcionalmente correcta (vínculo a múltiples puntos, fecha
de inicio de Trello), pero el usuario señaló tres problemas de usabilidad:

1. La barra "Centro de actividad técnica" ocupaba mucho espacio a lo ancho y,
   debajo, 5 tarjetas KPI pequeñas duplicaban esa franja horizontal.
2. La sección "Bitácora visual de soporte" no aprovechaba el ancho completo
   (compartía fila con el panel "Tipos de actividad"); las tarjetas eran
   verticales, dificultando ver imagen y texto a la vez.
3. El filtro "Tipos de actividad" era una lista lateral fija, sin relación
   visual con el período (día/mes/año) o estado que el usuario ya tenía
   seleccionado — los conteos no reflejaban el recorte vigente.

## 2. Objetivo

Reorganizar `RealSupport` para reducir el espacio ocupado por el encabezado,
dar ancho completo a la bitácora con tarjetas horizontales más grandes, y
convertir el filtro de tipos en una fila de píldoras minimalista cuyos
conteos se recalculan según el período/estado ya seleccionado por el usuario.

## 3. Alcance

- Los 5 KPI (`Actividades`, `Ejecutadas`, `Pendientes`, `Con evidencia`,
  `Puntos vinculados`) se integran como chips compactos dentro de la misma
  franja de "Centro de actividad técnica" (borde superior separador), en vez
  de una fila de tarjetas aparte debajo.
- La tarjeta "Bitácora visual de soporte" pasa de compartir fila
  (`xl:grid-cols-[.55fr_1.45fr]` con el panel de tipos) a ocupar el ancho
  completo.
- Las tarjetas de la bitácora cambian de layout vertical (imagen arriba,
  texto abajo) a horizontal (imagen a la izquierda, texto a la derecha),
  con tamaños de texto e imagen aumentados ~20%.
- El panel lateral "Tipos de actividad" se elimina como `Card` separada; se
  reemplaza por una fila de píldoras dentro del `CardHeader` de la bitácora,
  cada una con icono + etiqueta + conteo.
- Los conteos de las píldoras se calculan sobre `periodBaseItems` (los
  elementos ya filtrados por período y estado, pero sin aplicar aún el
  filtro de tipo) — para que reflejen siempre el recorte vigente del
  usuario, no el total global.

## 4. No-objetivos

- No cambia ninguna lógica de datos: ni el cálculo de `operationalAt`
  (spec 0019), ni el vínculo a puntos (spec 0018), ni la clasificación de
  actividad.
- No toca otras pestañas del módulo (`RealVisitors`, KPIs de `RealEvents`,
  etc.) ni otros módulos.
- No se adopta el sistema de diseño general de `CRM_Frontend/docs/
  design-system.md` — se mantiene la estética "cyber-ops" ya establecida en
  este archivo (colores crudos tipo `bg-slate-950`/`text-cyan-300`), por
  consistencia con el resto de `CctvModule.jsx`.

## 5. Criterios de aceptación

- [x] Los 5 KPI aparecen como chips dentro del encabezado "Centro de
      actividad técnica", sin una fila de tarjetas separada debajo.
- [x] "Bitácora visual de soporte" ocupa el ancho completo de la pestaña.
- [x] Las tarjetas de la bitácora son horizontales (imagen a la izquierda,
      contenido a la derecha) y ~20% más grandes en texto/imagen que la
      versión anterior.
- [x] El filtro de tipos es una fila de píldoras dentro del `CardHeader` de
      la bitácora, con conteos derivados del período/estado seleccionado.
- [x] `cd CRM_Frontend && npm run lint` — mismo patrón de error preexistente
      (ver sección 6), sin categorías nuevas de problema; `npm run build`
      verde.
- [x] Docker local: `crm-frontend` reconstruido, `restart` aplicado; `/api/
      cctv/support`, `/api/cctv/health`, `/api/cctv/maintenance`, `/api/
      cybersecurity/towers` y el bundle (`/`) responden 200, sin regresión.

## 6. Restricciones de arquitectura y diseño

- `npm run lint` pasa de 7 a 8 errores reportados, pero el nuevo error es el
  mismo falso positivo ya presente dos veces en este archivo (líneas 3506 y
  4875 antes del cambio): el `eslint.config.js` del proyecto solo define
  `varsIgnorePattern: '^[A-Z_]'` para `no-unused-vars`, que cubre
  declaraciones de variable simples pero no elementos de un destructuring de
  array (`.map(([label,value,Icon,tone])=>...)`) — hace falta
  `destructuredArrayIgnorePattern` (no configurado) para eso. El nuevo chip
  de KPIs reutiliza ese mismo patrón `Icon` dentro de un `.map` con
  destructuring de array, y por eso hereda el mismo falso positivo ya
  tolerado en el archivo, no una categoría nueva de problema. No se tocó
  `eslint.config.js` por quedar fuera de alcance de esta spec.

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| Tarjetas horizontales más altas podrían requerir más scroll vertical en la bitácora | Bajo | Se amplió `max-h` del contenedor de `780px` a `860px`; grid pasa de 2 columnas en `md` a 2 columnas en `lg` (tarjetas horizontales necesitan más ancho por tarjeta). |

## 8. Impacto en producción

Cambio puramente visual/estructural en una pestaña (Soporte); no toca datos,
endpoints ni esquema. Rollback: revertir el commit, sin efectos secundarios.
