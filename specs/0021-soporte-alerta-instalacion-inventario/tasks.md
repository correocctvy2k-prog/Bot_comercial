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
- [ ] Desplegar este fix en `.65`
