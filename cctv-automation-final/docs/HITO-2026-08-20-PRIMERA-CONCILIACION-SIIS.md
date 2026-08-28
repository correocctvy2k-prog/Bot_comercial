# Primera conciliación real SIIS–CCTV

- Fecha de captura: 2026-08-20
- Fuente SIIS: `estacionesByPing`
- Alcance: solo código, nombre y estado de ping
- Resultado: importación exitosa, sin registros inválidos

## Resultados

| Indicador | Resultado |
|---|---:|
| Estaciones recibidas de SIIS | 373 |
| Estaciones válidas | 373 |
| En línea en el momento de captura | 294 |
| Fuera de línea en el momento de captura | 79 |
| Puntos de mantenimiento con código SIIS | 91 |
| Códigos encontrados exactamente en SIIS | 85 |
| Cadena exacta SIIS–mantenimiento–inventario | 46 |
| Código exacto, alias de inventario por revisar | 39 |
| Códigos de mantenimiento ausentes en SIIS | 6 |
| Estaciones SIIS fuera del alcance CCTV actual | 288 |
| Códigos duplicados en mantenimiento | 0 |

De los 85 puntos CCTV encontrados por código, 76 estaban en línea y 9 fuera de
línea en el momento de la captura. Este dato es una fotografía operativa, no una
declaración permanente sobre el estado del punto o del CCTV.

### Puntos conciliados que estaban fuera de línea

| Código | Nombre SIIS | Nombre en mantenimiento |
|---|---|---|
| 1729 | CALLE PRINCIPAL CABUYAL | Cabuyal |
| 2249 | COLOMBIA CABINAS | Colombia cabinas (IPC-K35) |
| 2283 | LICORES I | Licores I |
| 2387 | SUPER MARDEN LA 47 | Marden la 47 |
| 3054 | ANTIGUA PPAL II | Antigua principal |
| 3717 | LA ESMERALDA FLORIDA | Esmeralda |
| 3763 | CASA ALAMEDA | Casa Alameda |
| 4114 | LA COSECHA III | La Cosecha III |
| 4139 | OLIMPICO III | Olimpico III |

Estos nueve registros deben observarse en nuevas capturas antes de generar una
alerta. Un único `estaping=0` no prueba una falla persistente.

## Seis códigos que requieren verificación de vigencia

| Código | Punto de mantenimiento |
|---|---|
| 1975 | Ofi ppa Amaime |
| 1978 | Oficina Rozo |
| 1979 | Oficina Candelaria |
| 1981 | Ofippal Florida - La octava |
| 3087 | Caja Agraria |
| 3739 | Galeria |

La ausencia puede significar cambio de código, cierre, exclusión de la respuesta o
desactualización del archivo anual. No se modificará el maestro hasta verificarlo.

## Próxima decisión

1. Promover las 46 cadenas exactas a una propuesta de catálogo, no directamente a
   producción.
2. Revisar los 39 alias con código confirmado; el código resuelve la identidad y el
   nombre define la presentación y trazabilidad.
3. Consultar en SIIS o con el área responsable la vigencia de los seis códigos
   ausentes.
4. Mantener las 288 estaciones restantes como universo SIIS disponible; no
   clasificarlas automáticamente como faltantes de CCTV.

## Evidencia

- Instantánea local protegida: `data/siis-snapshot-latest.json`.
- Base staging: `data/cctv-staging.db`.
- Reporte detallado: `reports/siis-reconciliation-latest.md`.
