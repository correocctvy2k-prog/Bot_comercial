# SPEC 0022 — InstallationWizard: autocompletado de modelo + feedback de guardado

- **Estado:** Implementado y verificado en local (build + Docker + datos reales)
- **Autor:** Claude (a partir de feedback directo del usuario tras usar el
  `InstallationWizard` por primera vez en producción, 2026-10-02)
- **Fecha:** 2026-10-02
- **Módulos afectados:** `cctv-automation-final/api/server.js`,
  `CRM_Frontend/src/pages/CctvModule.jsx` (`InstallationWizard`).
- **Rama:** `feat/0022-wizard-autocompletado-y-feedback-guardado`
- **PR:** —

## 1. Problema / oportunidad

Tras desplegar y corregir el `InstallationWizard` (reutilizado por spec
0021), el usuario reportó dos fricciones de uso real al registrar una
instalación nueva:

1. El campo "Modelo" de cada activo (NVR, cámara, etc.) es texto libre —
   el operario tiene que escribir a mano información técnica que
   normalmente no tiene a la mano (referencia exacta del modelo), cuando
   en la mayoría de los casos el modelo ya se usó antes en otra
   instalación.
2. Al guardar, la operación tardó varios segundos sin ninguna señal visual
   de que algo estaba pasando — el botón solo cambiaba el texto a
   "Guardando…", poco perceptible — al punto que el usuario estuvo a punto
   de abortar pensando que la página se había congelado.

## 2. Objetivo

Reducir la cantidad de datos que el operario tiene que escribir a mano
reutilizando el historial real de instalaciones ya registradas, y dar una
señal visual clara durante el guardado para que no se perciba como un
congelamiento.

## 3. Alcance

- **Backend** (`GET /api/cctv/known-models`, nuevo): agrupa por
  `asset_type` los `model` distintos ya guardados en la tabla `assets`
  (alimentada por cada instalación confirmada), con su `channelCapacity` y
  cuántas veces se usó cada uno (`count`) — fuente real de "qué modelos ya
  usamos", no un catálogo estático.
- **Frontend**: el campo "Modelo" de cada activo pasa de `<Input>` libre a
  un `<input list>` con `<datalist>` por tipo de activo, poblado con los
  modelos reales ya usados para ESE tipo — sigue siendo editable
  libremente (el operario puede escribir un modelo nuevo si no está en la
  lista, no se fuerza a elegir de un catálogo cerrado).
- **Feedback de guardado**: ícono `RefreshCw` girando (mismo patrón ya
  usado en otra parte del archivo) junto al texto "Guardando…" en el botón
  de confirmar, más un aviso debajo ("puede tardar unos segundos... no
  cierres ni recargues la página"); el botón "Atrás" y el botón de cerrar
  (×) del modal también se deshabilitan mientras se guarda, para que no se
  pueda interrumpir una operación en curso pensando que está colgada.

## 4. No-objetivos (y por qué)

- No se implementa autocompletado de `manufacturer` — ese campo nunca fue
  editable en la UI (siempre "Dahua" por defecto, fijo en el estado
  inicial), no hay nada que autocompletar ahí.
- No se auto-rellena "Canales utilizados" a partir de la capacidad
  (`channelCapacity`) del modelo elegido — son conceptos distintos
  (capacidad total del equipo vs. canales realmente cableados/en uso en
  ESTA instalación); auto-rellenar ahí podría meter un valor incorrecto
  sin que el operario lo note. El dato de capacidad queda disponible en la
  respuesta de `known-models` por si se quiere mostrar como referencia en
  el futuro, pero no se usa para rellenar nada automáticamente.
- No se investigó a fondo ni se intentó "arreglar" la causa de la demora en
  el guardado (ver sección 6) — el fix de esta spec es dar feedback visual
  honesto mientras dura, no eliminar la demora en sí.
- Otras ideas de autocompletado sugeridas pero NO implementadas (fuera de
  alcance explícito, para no sobre-construir sin pedido concreto): recordar
  el último técnico usado (localStorage) para prellenarlo la próxima vez;
  mostrar la capacidad de canales del modelo elegido como referencia visual
  (no como valor prellenado). Quedan como ideas para si el usuario las pide.

## 5. Criterios de aceptación

- [x] `GET /api/cctv/known-models` devuelve modelos reales agrupados por
      tipo de activo, verificado contra datos reales (30 combinaciones
      reales en 5 tipos de activo).
- [x] El campo "Modelo" del wizard ofrece esos modelos reales como
      sugerencias por tipo de activo, sin impedir escribir uno nuevo.
- [x] El botón de confirmar muestra un ícono girando + "Guardando…", con
      aviso de que puede tardar; "Atrás" y "×" se deshabilitan mientras
      dura el guardado.
- [x] `cctv-automation-final`: 120/120 en verde (sin tests nuevos — la
      función es una consulta de agregación simple, mismo patrón que
      `candidateRows`, tampoco testeada aparte).
- [x] `CRM_Frontend`: build verde, lint sin errores nuevos.
- [x] Docker local: `cctv-api`+`crm-frontend` reconstruidos; `/api/cctv/
      known-models`, `/api/cctv/support`, `/api/cctv/overview` — 200, sin
      regresión.

## 6. Hipótesis sobre la demora real del guardado (investigado, no resuelto)

`POST /api/cctv/installations` en sí mismo es una transacción SQLite
simple (`BEGIN IMMEDIATE` + unos pocos `INSERT`), sin I/O externo ni de
red — no debería tardar segundos por sí sola. La base SQLite la comparten
varios procesos escribiendo a la vez (`cctv-api`, `cctv-operational-worker`,
`cctv-visitor-worker`, sincronizaciones periódicas de Trello/SIIS) sobre el
mismo archivo, y el servidor ya tiene configurado
`PRAGMA busy_timeout=15000` (spec previas, incidente real de "database is
locked" documentado) — si el guardado coincide con una escritura
concurrente de otro proceso, SQLite reintenta en silencio hasta 15
segundos antes de fallar o completar, lo cual coincide con el síntoma
descrito ("se demoró mucho tiempo... después de un momento apareció el
mensaje de guardado correctamente"). Es la explicación más probable dado
el historial real de este código, pero no se instrumentó para confirmarlo
con certeza total — fuera de alcance de esta spec, que se limita a dar
feedback honesto durante la espera en vez de eliminarla.

## 7. Impacto en producción

Aditivo: una ruta nueva de solo lectura + cambios de UI en un componente ya
existente. No cambia ningún dato ni comportamiento de guardado. Rollback:
revertir el commit, sin efectos secundarios.
