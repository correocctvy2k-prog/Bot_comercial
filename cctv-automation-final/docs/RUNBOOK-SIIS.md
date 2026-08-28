# Runbook de integración SIIS

## Propósito

Importar y validar una instantánea de estaciones SIIS sin efectuar cambios en
`puntos_venta` ni en el catálogo canónico CCTV.

## Contrato mínimo de entrada

El archivo debe contener un arreglo JSON. Cada elemento puede incluir otros campos,
pero estos son los utilizados inicialmente:

| Campo SIIS | Destino | Regla |
|---|---|---|
| `estacodi` | `siis_code` | Obligatorio, texto, conserva ceros iniciales |
| `estanomb` | `name_raw` | Nombre recibido; se conserva y normaliza aparte |
| `estaping` | `online` | `1/true` = en línea, `0/false` = fuera de línea |

## Ejecución

### 1. Obtener una instantánea mínima

Configure `SIISS_URL`, `SIISS_USER` y `SIISS_PASS` en `.env`, usando
`.env.siis.example` como referencia. El cliente se detiene si falta alguna variable:

```powershell
npm run fetch:siis
```

El archivo resultante contiene solamente `estacodi`, `estanomb` y `estaping`. La
escritura utiliza un archivo temporal y un reemplazo atómico para no dejar una
instantánea parcial.

### 2. Importar a staging

```powershell
npm run import:siis -- --input .\ruta\estaciones.json --db .\data\cctv-staging.db
```

La salida informa recibidos, válidos, inválidos, en línea y fuera de línea. Cada
ejecución crea un registro en `siis_sync_runs`; la fuente original no se modifica.

Para capturar e importar la señal en una sola operación idempotente:

```bash
npm run sync:siis-live
```

Cada ejecución conserva una instantánea en `siis_sync_runs` y
`stg_siis_locations`. Programar este comando cada 5 minutos permitirá derivar
primera conexión, última actividad y transiciones del día. Una sola captura de
ping solo describe el instante observado y no debe presentarse como hora de
apertura o cierre.

### 3. Conciliar con mantenimiento e inventario

```powershell
npm run reconcile:siis -- --db .\data\cctv-staging.db
```

El reporte `reports/siis-reconciliation-latest.md` muestra la cadena:

```text
estacodi SIIS → Código SIIS de mantenimiento → candidato del inventario CCTV
```

El primer vínculo exige igualdad exacta del código. El segundo conserva la decisión
del proceso de conciliación del inventario.

## Reglas de rechazo

- Respuesta que no sea un arreglo.
- Código SIIS vacío.
- Código duplicado dentro de la misma instantánea.

Un estado de ping desconocido se conserva con una bandera de calidad y valor nulo.

## Promoción futura

La siguiente fase cruzará `stg_siis_locations.siis_code` con:

1. `locations.siis_code` ya aprobado.
2. Códigos presentes en la programación anual.
3. Alias revisados por una persona cuando el código aún no exista.

La promoción debe generar una decisión explícita en
`siis_location_reconciliation`; nunca debe sustituir nombres o ubicaciones por una
similitud aproximada.

## Incidente y recuperación

Si una importación falla, el `siis_sync_run` queda en estado `ERROR`. No se borra la
última ejecución exitosa. Se corrige la fuente o configuración y se crea una nueva
ejecución; no se edita el historial.
