# PLAN 0022 — InstallationWizard: autocompletado de modelo + feedback de guardado

Referencia: `spec.md` en esta misma carpeta.

## Enfoque

1. **Backend**: `knownModelsData()` en `api/server.js` — agrega
   `SELECT asset_type, model, channel_capacity, COUNT(*) FROM assets
   WHERE model IS NOT NULL GROUP BY asset_type, model ORDER BY asset_type,
   count DESC`, agrupado en JS por `asset_type`. Ruta `GET /api/cctv/
   known-models`, mismo estilo que las demás rutas de solo lectura.
2. **Frontend**: `InstallationWizard` — nuevo estado `knownModels`, cargado
   una vez al montar (`useEffect` sin dependencias). El campo "Modelo" de
   cada activo usa `list={`known-models-${asset.assetType}`}` + un
   `<datalist>` con los modelos de ese tipo — HTML nativo, sin librería
   nueva, mantiene la edición libre.
3. **Feedback de guardado**: reutiliza el patrón ya existente en el mismo
   archivo (`RefreshCw` + `animate-spin`, visto en el panel de
   sincronización DSS) para el botón "Confirmar instalación"; deshabilita
   "Atrás" y el botón de cerrar (×) mientras `saving` es true.

## Verificación

- `cd cctv-automation-final && npm test` — suite completa en verde.
- `cd CRM_Frontend && npm run build` — verde.
- Docker local: rebuild `cctv-api`+`crm-frontend`; verificar `/api/cctv/
  known-models` contra datos reales, sin regresión en `/api/cctv/support`,
  `/api/cctv/overview`.
- Revisión visual del usuario (no hay navegador automatizado en este
  entorno).
