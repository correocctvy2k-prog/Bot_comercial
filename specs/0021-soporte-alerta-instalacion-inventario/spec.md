# SPEC 0021 — Soporte: alerta de instalación nueva + actualización de inventario

- **Estado:** Implementado, verificado en local y **mergeado a `main`** (PR #28, 2026-10-01); pendiente de desplegar en `.65`
- **Autor:** Claude (a partir de un pedido directo del usuario, 2026-10-01)
- **Fecha:** 2026-10-01
- **Módulos afectados:** `cctv-automation-final/platform/schema.sql`,
  `cctv-automation-final/platform/support-installation-alerts.js` (nuevo),
  `cctv-automation-final/api/server.js`,
  `CRM_Frontend/src/pages/CctvModule.jsx` (pestaña Soporte/Inventario/Proyecto,
  `InstallationWizard`).
- **Rama:** `feat/0021-soporte-alerta-instalacion-inventario`
- **PR:** #28

## 1. Problema / oportunidad

En el módulo Seguridad Electrónica ya existen, por separado:
- La pestaña **Soporte**: bitácora de tarjetas Trello, clasificadas por
  `activityType` (`INSTALLATION`, `CCTV`, `ALARM`, etc., spec previas).
- La pestaña **Inventario**: cobertura real por punto
  (`locations.cctv_coverage_status`: `NONE`/`ACTIVE`/etc.).
- La pestaña **Proyecto**: lista de intervenciones del programa de
  modernización 2026, cada una con un botón "Registrar como realizada" que
  abre `InstallationWizard` — un modal flotante de 4 pasos (ubicación →
  datos de instalación → activos/cámaras/NVR → confirmación) que ya persiste
  correctamente la instalación (tabla `cctv_installations` + `assets` +
  `channels`) y **ya actualiza el inventario** (`locations.cctv_coverage_status
  = 'ACTIVE'`).

Estas tres vistas no están conectadas entre sí: si en Soporte aparece una
tarjeta de **instalación nueva** sobre un punto que el Inventario todavía
marca sin CCTV (`cctv_coverage_status='NONE'`), nadie es alertado — el
usuario tiene que notar el caso manualmente y abrir el wizard desde
Proyecto (que además solo lista los puntos ya incluidos en el programa de
modernización 2026, no cualquier punto).

## 2. Objetivo

Cuando el sistema detecta, en los datos reales ya sincronizados, que una
tarjeta de Soporte de tipo `INSTALLATION` está vinculada a un punto sin
CCTV, generar una alerta visible (ventana flotante) desde la que el usuario
pueda abrir el mismo `InstallationWizard` ya existente — pre-cargado con ese
punto — para registrar el sistema instalado (tipo de solución, modelo,
cantidad de cámaras, tecnología) y así el Inventario quede al día de
inmediato, sin pasar por el tablero Proyecto.

## 3. Alcance

- **Detección** (`platform/support-installation-alerts.js`, nuevo): consulta
  pura sobre datos ya existentes — tarjetas de Soporte activas con
  `activity_type='INSTALLATION'` vinculadas (`support_card_locations`, spec
  0018) a un punto (`locations`) con `cctv_coverage_status='NONE'`, excluyendo
  las descartadas manualmente.
- **Persistencia de descarte** (tabla nueva `support_installation_alert_dismissals`):
  si el usuario marca una alerta como "no aplica" (falso positivo — p.ej.
  tarjeta mal clasificada, o instalación que en realidad es de otro sistema
  no-CCTV), no debe volver a aparecer. Reversible (`active=0`/`1`), mismo
  patrón que `cctv_notification_resolutions` (spec 0011).
- **API** (`api/server.js`): `GET /api/cctv/support` agrega el campo
  `installationAlerts` al payload ya existente (sin endpoint nuevo de
  lectura, se reutiliza el polling que ya hace el frontend). Dos rutas
  nuevas: `POST /api/cctv/support/installation-alerts/dismiss` y
  `POST /api/cctv/support/installation-alerts/reopen`.
- **Frontend** (`CctvModule.jsx`):
  - Nueva `InstallationAlertTray`: tarjetas flotantes (ancladas, no
    bloqueantes) visibles en cualquier pestaña del módulo mientras haya
    alertas pendientes, mostrando punto + zona + tarjeta de origen + fecha.
  - Botón "Actualizar inventario" por alerta → abre `InstallationWizard` ya
    existente, con el punto pre-seleccionado (salta directo al paso 2) y
    campos pre-cargados cuando hay dato real disponible (fecha del paso del
    `due`/`start` de la tarjeta, primer miembro de Trello como técnico,
    nota con el título de la tarjeta de origen) — el usuario puede corregir
    cualquier campo antes de guardar.
  - Botón "Descartar" por alerta → llama al endpoint de descarte.
  - Al completar el wizard (`onClose` ya recarga los datos del dashboard),
    la alerta desaparece sola porque la consulta de detección exige
    `cctv_coverage_status='NONE'` y el wizard ya deja el punto en `'ACTIVE'`
    — no hace falta un paso de resolución aparte para el caso exitoso.

## 4. No-objetivos

- No se crea una tabla nueva de "inventario por punto" (tipo de sistema,
  modelo, cámaras, tecnología) — esa información **ya vive** en
  `assets`/`channels`/`cctv_installations`, alimentada por el mismo
  `InstallationWizard` que ya existe y ya se muestra en la pestaña
  Inventario. Esta spec solo conecta Soporte → ese flujo existente.
- No cambia la clasificación `activityType` de Soporte (specs previas) ni el
  criterio de vínculo a puntos (spec 0018).
- No fuerza la apertura automática del wizard de 4 pasos al cargar la
  página — la alerta flotante es el aviso; abrir el wizard completo sigue
  siendo una acción explícita del usuario (evita interrumpir con un modal
  grande cada vez que hay varias alertas pendientes).
- No se extiende a tarjetas de Mantenimiento (board aparte, spec 0008) —
  solo Soporte, igual alcance que specs 0018/0019.

## 5. Criterios de aceptación

- [x] `GET /api/cctv/support` incluye `installationAlerts[]` con los casos
      reales: tarjeta `INSTALLATION` + punto con `cctv_coverage_status='NONE'`,
      sin descartes activos. Verificado contra Docker local: **4 casos reales**.
- [x] `POST .../installation-alerts/dismiss` oculta la alerta de forma
      persistente; `POST .../installation-alerts/reopen` la reactiva.
      Verificado end-to-end contra datos reales (4→3→4).
- [x] La ventana flotante de alertas aparece en la UI con al menos un caso
      real de los datos actuales (verificar contra Docker local).
- [x] "Actualizar inventario" abre `InstallationWizard` con el punto
      correcto pre-seleccionado y campos pre-cargados donde hay dato real.
- [x] Al completar el wizard para ese punto, la alerta deja de aparecer y
      el punto pasa a figurar como cubierto en la pestaña Inventario (se
      apoya en que el wizard ya deja `cctv_coverage_status='ACTIVE'`, sin
      lógica adicional).
- [x] Tests nuevos en `cctv-automation-final` (detección + dismiss/reopen,
      sobre `node:sqlite` en memoria, mismo patrón que
      `notification-resolutions.test.js`); suite completa en verde (117/117).
- [x] `cd CRM_Frontend && npm run build` verde; Docker local reconstruido y
      verificado sin regresión en `/api/cctv/support`, `/api/cctv/overview`,
      `/api/cctv/project`.

## 6. Restricciones de arquitectura y diseño

- Reutiliza `InstallationWizard` tal cual existe (no se reescribe su lógica
  de guardado ni su endpoint `/api/cctv/installations`), solo se le agrega
  un prop opcional de pre-carga de formulario.
- Sigue el patrón ya establecido de "resolución reversible" de spec 0011
  (`active` 0/1 + `audit_log`) para los descartes, en vez de un borrado
  definitivo.

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| Una tarjeta `INSTALLATION` puede ser una reinstalación o cambio de tecnología sobre un punto que YA tiene CCTV mal marcado como `NONE` en el inventario (dato desactualizado, no instalación nueva real) | Bajo-medio | El botón "Descartar" cubre este caso sin bloquear el flujo; no se intenta inferir automáticamente la diferencia entre "nunca tuvo CCTV" y "el inventario está desactualizado" — eso requeriría otra fuente de verdad fuera de alcance. |
| Varias alertas simultáneas podrían saturar la bandeja flotante | Bajo | Se diseña como una lista compacta apilada, no modales forzados; cada una se puede descartar o resolver independientemente. |

## 8. Impacto en producción

Aditivo: tabla nueva + campo nuevo en una respuesta existente + dos rutas
nuevas + un prop opcional en un componente ya existente. No cambia ningún
dato ni comportamiento previo si no hay alertas pendientes. Rollback:
revertir el commit; la tabla de descartes queda sin uso, sin romper nada.
