# TASKS 0020 — Soporte: interfaz compacta y bitácora horizontal

Referencia: `spec.md` y `plan.md` en esta misma carpeta.

## Implementación

- [x] `CctvModule.jsx` (`RealSupport`): KPIs integrados como chips en el
      encabezado "Centro de actividad técnica"; fila de tarjetas KPI
      separada eliminada.
- [x] `CctvModule.jsx` (`RealSupport`): "Bitácora visual de soporte" a
      ancho completo; panel lateral "Tipos de actividad" eliminado.
- [x] `CctvModule.jsx` (`RealSupport`): tiles de la bitácora en layout
      horizontal (imagen izquierda, contenido derecha), tamaños ~20%
      mayores.
- [x] `CctvModule.jsx` (`RealSupport`): `periodBaseItems`/`typesForPeriod`
      nuevos; fila de píldoras de tipo dentro del `CardHeader` de la
      bitácora, conteos reactivos al período/estado seleccionado.

## Verificación

- [x] `cd CRM_Frontend && npx eslint src/pages/CctvModule.jsx` — 8 errores
      (antes 7); el nuevo es el mismo falso positivo ya presente dos veces
      en el archivo (`Icon` no reconocido por `no-unused-vars` en
      destructuring de array dentro de `.map`, ver spec.md sección 6).
- [x] `npm run build` — verde.
- [x] Docker local: `docker compose -f docker-compose.yml -f
      docker-compose.local.yml up -d --build crm-frontend` +
      `docker restart crm-frontend`. `/api/cctv/support`, `/api/cctv/
      health`, `/api/cctv/maintenance`, `/api/cybersecurity/towers` y `/`
      (bundle) responden 200.

## Documentación (Definition of Done)

- [ ] `CHANGELOG.md` — sección "No publicado"
- [ ] Lección aprendida — no se considera necesaria (cambio puramente de
      UI, sin datos ni endpoints nuevos; el hallazgo del falso positivo de
      lint queda documentado en spec.md, no es un patrón de riesgo nuevo)

## Cierre

- [x] PR abierto y enlazado en `spec.md` (PR #28)
- [x] Merge a `main` (2026-10-01, junto con spec 0021)
- [ ] Desplegado y verificado en `.65`
