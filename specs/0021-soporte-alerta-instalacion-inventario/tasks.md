# TASKS 0021 — Soporte: alerta de instalación nueva + actualización de inventario

Referencia: `spec.md` y `plan.md` en esta misma carpeta.

## Implementación

- [x] `schema.sql`: tabla `support_installation_alert_dismissals`.
- [x] `platform/support-installation-alerts.js` (nuevo): `pendingAlerts`,
      `dismissAlert`, `reopenAlert`.
- [x] `api/server.js`: `installationAlerts` en `supportData()`; rutas
      `POST /api/cctv/support/installation-alerts/dismiss` y `/reopen`.
- [x] `CctvModule.jsx`: `InstallationWizard` acepta `initialForm`;
      `InstallationAlertTray` nuevo; wiring en `Overview`.

## Verificación

- [x] `tests/support-installation-alerts.test.js` nuevo (6 casos), en verde.
- [x] `cctv-automation-final`: `npm test` completo en verde (117/117).
- [x] `CRM_Frontend`: `npm run build` verde; `npm run lint` sin errores
      nuevos (mismos 8 preexistentes de spec 0020).
- [x] Docker local: `cctv-api` + `crm-frontend` reconstruidos, `restart
      crm-frontend`; `/api/cctv/support` (con `installationAlerts`),
      `/api/cctv/overview`, `/api/cctv/project`, bundle `/` — 200, sin
      regresión.
- [x] Verificado contra datos reales de producción: 4 alertas reales
      detectadas (ej. "Instalación Cámara con botón de pánico y sirena en
      el punto Cañaveral"); dismiss/reopen probados end-to-end contra la
      base real (4→3→4).

## Documentación (Definition of Done)

- [x] `CHANGELOG.md` — sección "No publicado"
- [x] Ficha de módulo — `cctv-automation-final/docs/
      INTEGRACION-TRELLO-SOPORTE-2026.md`
- [ ] Lección aprendida — no se considera necesaria (integración aditiva
      entre datos ya existentes, sin hallazgo de riesgo nuevo tipo LL-00xx)

## Cierre

- [x] PR abierto y enlazado en `spec.md` (PR #28)
- [x] Merge a `main` (2026-10-01)
- [x] Desplegado y verificado en `.65` (2026-10-02) — con un bug real
      encontrado por el usuario y corregido de inmediato, ver "Fix post-deploy"
      abajo.

## Fix post-deploy (2026-10-02)

- [x] `support-installation-alerts.js`: `pendingAlerts()` exige
      `sc.status='COMPLETED'`; nueva `scheduledAlerts()` para
      `status='PENDING'`.
- [x] `api/server.js`: `scheduledInstallations` agregado a `supportData()`.
- [x] `CctvModule.jsx`: `ScheduledInstallationsPanel` nuevo en la pestaña
      Soporte (tono azul, sin botón "Actualizar inventario", solo "Ver en
      Trello").
- [x] Tests nuevos (3): excluye `PENDING` de `pendingAlerts`,
      `scheduledAlerts` las detecta, `dismissAlert` aplica a ambas.
      `cctv-automation-final`: 120/120 en verde.
- [x] `CRM_Frontend`: build verde, lint sin errores nuevos.
- [x] Docker local: verificado contra datos reales — el caso real
      ("avenida la victoria", 2023, lista "tareas pendientes") pasó de
      `installationAlerts` a `scheduledInstallations` correctamente; además
      reveló que "Cañaveral" tenía el mismo problema.
- [x] Desplegado en `.65` (PR #29, 2026-10-02).

## Fix post-deploy #2 (2026-10-02) — alias Villagorgona + bandeja colapsable

- [x] `scripts/fix-villagorgona-alias-20261002.js` (nuevo, `--apply`):
      agrega alias "VILLAGORGONA" (palabra completa) a los 14 puntos reales
      que el catálogo abrevia de forma inconsistente ("V.GORG"/"V.GORGONA"/
      "GORG"). Bug propio encontrado y corregido antes de aplicar (dejaba
      "V." colgando en 4 de los 14 casos).
- [x] Re-procesado `import-trello-support.js` en local: la tarjeta real
      pasó de "LA VICTORIA"/FLORIDA a "AVENIDA LA VICTORIA V.GORG"/
      CANDELARIA (el punto correcto); capturó de regalo "BRISAS
      V.GORGONA", antes sin vincular.
- [x] `InstallationAlertTray`: de lista de tarjetas siempre visible a
      botón compacto colapsado por defecto (campana + contador), expande
      al clic.
- [x] Confirmado sin cambio de código: la propagación global a Inventario/
      Proyecto al guardar el wizard ya funcionaba (`load()` + `useMemo` de
      `points`) — el usuario lo pidió, se verificó que ya estaba resuelto.
- [x] `cctv-automation-final`: 120/120 en verde (sin tests nuevos, el
      script es una corrección de datos, no lógica de producto).
- [x] `CRM_Frontend`: build verde, lint sin errores nuevos.
- [x] Docker local: `crm-frontend` reconstruido, endpoints sin regresión.
- [x] Desplegado en `.65` (PR #30, 2026-10-02) — `.65` tenía cambios locales
      sin confirmar (contenido idéntico al fix post-deploy #1, verificado
      línea por línea antes de `git stash` + `git pull` + `git stash drop`,
      ver spec.md sección 10). Corrido `fix-villagorgona-alias-20261002.js
      --apply` (14 alias insertados) + reproceso del importador vía
      `docker exec cctv-operational-worker` (host sin salida a internet
      directa). Verificado contra `.65` en vivo: el caso real quedó
      vinculado al punto correcto.

## Fix post-deploy #3 (2026-10-02) — descarte accidental + botón "No aplica"

- [x] Investigado por qué `installationAlerts` apareció vacío tras el
      deploy del fix #2: 3 descartes reales (`support_installation_alert_
      dismissals`, actor `skylab-local-user`, mismo segundo) — el usuario
      confirmó que clicó "X" para dejar de obstruir la vista, sin saber que
      era un descarte permanente.
- [x] Reabiertas las 3 vía `POST .../reopen` directo contra `.65` en vivo
      (API propia de la app, acción reversible). Verificado: 2 volvieron a
      `installationAlerts`, 1 (Cañaveral) correctamente a
      `scheduledInstallations`.
- [x] Fix de causa raíz: el botón de descarte pasa de ícono `X` sin texto
      a "No aplica" + `title` explicando que oculta la alerta de forma
      permanente, no solo visualmente.
- [x] `CRM_Frontend`: build verde, lint sin errores nuevos.
- [x] Docker local: `crm-frontend` reconstruido, endpoints sin regresión.
- [x] Desplegado en `.65` (PR #31, 2026-10-02).

## Fix post-deploy #4 (2026-10-02) — `crypto.randomUUID` en HTTP plano

- [x] Diagnosticado: `InstallationWizard` (preexistente, reutilizado por
      esta spec) rompía todo el módulo con `TypeError: crypto.randomUUID
      is not a function` al usarlo contra `.65` (HTTP plano, no contexto
      seguro) — primera vez que alguien lo usaba de verdad en producción.
- [x] `safeRandomUUID()` nueva (usa `crypto.randomUUID` si existe, si no
      arma un UUID v4 con `crypto.getRandomValues`, respaldo final
      `Math.random`). Reemplaza los 2 usos de `crypto.randomUUID()`
      (`clientId` de activo, `idempotencyKey` del guardado).
- [x] Verificado en Node: UUIDs v4 con formato válido simulando la
      ausencia de `randomUUID`; confirmado que la lógica de respaldo
      quedó en el bundle servido localmente.
- [x] `CRM_Frontend`: build verde, lint sin errores nuevos.
- [x] Docker local: `crm-frontend` reconstruido, endpoints sin regresión.
- [ ] Desplegar este fix en `.65`.
