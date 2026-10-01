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
- [ ] Desplegado y verificado en `.65`
