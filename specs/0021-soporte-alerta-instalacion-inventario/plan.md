# PLAN 0021 — Soporte: alerta de instalación nueva + actualización de inventario

Referencia: `spec.md` en esta misma carpeta.

## Enfoque

1. **Schema**: tabla `support_installation_alert_dismissals` en
   `platform/schema.sql`, mismo patrón que `cctv_notification_resolutions`
   (PK compuesta `card_id,location_id`, `active` 0/1, FKs a `support_cards`
   y `locations`).
2. **Módulo nuevo `platform/support-installation-alerts.js`** (puro,
   testeable con `node:sqlite` en memoria, mismo patrón que
   `notification-resolutions.js`):
   - `pendingAlerts(db)` — JOIN `support_cards` × `support_card_locations` ×
     `locations`, filtro `activity_type='INSTALLATION'` + `cctv_coverage_
     status='NONE'`, excluye descartes activos.
   - `dismissAlert(db,{cardId,locationId,reason,actor})` — upsert
     `ON CONFLICT(card_id,location_id) DO UPDATE ... active=1` + `audit_log`.
   - `reopenAlert(db,{cardId,locationId,actor})` — `active=0` + `audit_log`.
3. **`api/server.js`**:
   - `require('../platform/support-installation-alerts')`.
   - `supportData()` agrega `installationAlerts: pendingAlerts(db)`.
   - Dos rutas nuevas (`POST .../dismiss`, `POST .../reopen`), mismo estilo
     que las rutas existentes (actor desde `X-Actor`, validación básica,
     `send(res,...)`).
4. **`CctvModule.jsx`**:
   - `InstallationWizard`: nuevo prop opcional `initialForm` (objeto),
     mezclado sobre el `form` por defecto en el `useState` inicial.
   - `Overview`: nuevo estado `installationPrefill`; nueva función
     `openInstallationAlert(alert)` que arma `installationTarget` (forma
     compatible con `onRegister`) + `installationPrefill` (fecha/técnico/nota
     desde la alerta) y abre el wizard.
   - Nuevo componente `InstallationAlertTray({alerts,onOpen,onDismiss})`,
     renderizado junto a `{showWizard && ...}` (fuera de `<Tabs>`, visible en
     cualquier pestaña).
   - Handler de descarte: `POST .../dismiss` + `load()` para refrescar.

## Verificación

- Tests nuevos: `tests/support-installation-alerts.test.js` (detección,
  exclusión de descartados, dismiss idempotente, reopen).
- `cd cctv-automation-final && npm test` — suite completa en verde.
- `cd CRM_Frontend && npm run build` — verde.
- Docker local: rebuild `cctv-api` + `crm-frontend`, `docker restart
  crm-frontend`; verificar `/api/cctv/support` (campo `installationAlerts`
  presente), `/api/cctv/overview`, `/api/cctv/project`, bundle `/`.
- Revisión visual del usuario (no hay navegador automatizado en este
  entorno).
