# Revisión humana de ubicaciones SIIS–CCTV

- Archivo revisado: `REVISION_CONCILIACION_SIIS_CCTV.xlsx`
- Decisiones importadas: 45
- Decisión seleccionada: `MISMO_PUNTO` en los 45 casos
- Regla aplicada: la decisión confirma identidad SIIS–mantenimiento; el vínculo
  técnico con inventario y DSS pasa controles adicionales.

## Resultado de validación

| Estado | Cantidad | Interpretación |
|---|---:|---|
| `VALIDATED` | 30 | Identidad y candidato técnico sin conflicto detectado |
| `REVIEW_LINK` | 6 | Identidad aceptada; falta candidato o hay múltiples activos DSS |
| `HOLD` | 9 | No promover vínculo técnico o vigencia sin verificación adicional |

Las seis referencias no devueltas por SIIS conservan la decisión humana, pero su
código queda retenido hasta confirmar vigencia. Tres candidatos del inventario
cruzan Zonas y no deben asociarse automáticamente.

## Separación de decisiones

```text
Identidad del punto: SIIS + mantenimiento + revisión humana
Vínculo técnico: inventario + Zona + DSS + controles de unicidad
```

Esto permite aceptar un nombre canónico sin trasladar accidentalmente dispositivos
de otro punto.

## Evidencia

- `reports/location-review-import-latest.md`
- `reports/canonical-location-proposal-latest.md`
- Tablas `location_review_runs` y `location_review_decisions` en staging

## Promoción ejecutada

- 85 ubicaciones canónicas promovidas.
- 246 alias creados con procedencia SIIS, mantenimiento o inventario heredado.
- 0 conflictos y 0 códigos retenidos promovidos accidentalmente.
- Campo canónico normalizado como `zone`; `region_raw` permanece solo en staging.
