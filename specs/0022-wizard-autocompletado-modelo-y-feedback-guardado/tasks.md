# TASKS 0022 — InstallationWizard: autocompletado de modelo + feedback de guardado

Referencia: `spec.md` en esta misma carpeta.

## Implementación

- [x] `api/server.js`: `knownModelsData()` + ruta `GET /api/cctv/known-models`.
- [x] `CctvModule.jsx`: `InstallationWizard` — fetch de modelos conocidos al
      montar; `<datalist>` por tipo de activo en el campo "Modelo".
- [x] `CctvModule.jsx`: spinner (`RefreshCw` girando) + aviso en el botón de
      confirmar; "Atrás" y "×" deshabilitados mientras `saving`.

## Verificación

- [x] `cctv-automation-final`: `npm test` 120/120 en verde.
- [x] `CRM_Frontend`: `npm run build` verde; `npm run lint` sin errores
      nuevos (mismos 8 preexistentes).
- [x] Docker local: `cctv-api`+`crm-frontend` reconstruidos; `/api/cctv/
      known-models` verificado contra datos reales (30 combinaciones en 5
      tipos de activo); `/api/cctv/support`, `/api/cctv/overview` sin
      regresión.

## Documentación (Definition of Done)

- [x] `CHANGELOG.md` — sección "No publicado"
- [ ] Lección aprendida — no se considera necesaria (mejora de UX aditiva,
      sin hallazgo de riesgo nuevo)

## Cierre

- [ ] PR abierto y enlazado en `spec.md`
- [ ] Merge a `main`
- [ ] Desplegado y verificado en `.65`
