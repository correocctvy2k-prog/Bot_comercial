# Diccionario de datos CCTV

## Entidades canónicas

| Entidad | Propósito | Identificador recomendado |
|---|---|---|
| `locations` | Punto, oficina, parqueadero, edificio o base vehicular | UUID + código SIIS |
| `location_aliases` | Nombres alternativos por fuente | fuente + alias normalizado |
| `assets` | NVR, DVR, MVR, cámara, alarma, sensor, ANPR o servidor | UUID + serial/DSS ID |
| `channels` | Canal de video, alarma, audio o analítica | UUID + activo + número |
| `cctv_events` | Señales normalizadas de todas las fuentes | fuente + ID de evento |
| `maintenance_plan` | Programación anual por ubicación y periodo | ubicación + año + periodo |
| `maintenance_execution` | Evidencia de ejecución y vínculo Trello | UUID + IDs Trello |

## Campos críticos de ubicación

| Campo | Tipo | Regla |
|---|---|---|
| `siis_code` | texto | Único cuando exista; nunca derivarlo del nombre |
| `canonical_name` | texto | Nombre aprobado para presentar al usuario |
| `zone` | texto | Zona operativa; catálogo controlado |
| `location_type` | texto | POINT_OF_SALE, OFFICE, BUILDING, PARKING, VEHICLE_BASE u OTHER |
| `cctv_coverage_status` | texto | NONE, PLANNED, PARTIAL, ACTIVE, SUSPENDED o UNKNOWN |
| `criticality` | texto | LOW, MEDIUM, HIGH o CRITICAL |

## Campos críticos de activo

| Campo | Tipo | Ejemplos/regla |
|---|---|---|
| `asset_type` | texto | NVR, DVR, MVR, CAMERA, ALARM_PANEL, PIR, PANIC_BUTTON, MAGNETIC_SENSOR, ANPR |
| `parent_asset_id` | UUID | Cámara o sensor conectado a grabador/panel |
| `serial_number` | texto | Identificador físico; restringido |
| `dss_identifier` | texto | Identificador proveniente de DSS |
| `firmware` | texto | Separar versión de fecha de actualización |
| `ip_address` | texto | Dato restringido, no credencial |
| `lifecycle_status` | texto | PLANNED, STOCK, ACTIVE, DEGRADED, RETIRED, LOST o UNKNOWN |

## Fuentes actuales

| Fuente | Staging | Uso |
|---|---|---|
| `DATOS CCTV.xlsx/cctv` | `stg_inventory_locations` | Inventario de ubicaciones y grabadores |
| `Alarmas OSZFORD` | `stg_alarm_panels` | Paneles y comunicaciones |
| `Vehiculos` | `stg_vehicles` | MVR, cámaras y conectividad móvil |
| `Proyecto Actualizacion` | `stg_upgrade_projects` | Renovación, traslados e inversión |
| Programación `Total` | `stg_maintenance_points` | Código SIIS y cumplimiento R1/R2/R3 |
| Correo Dahua | `cctv_events` en fase posterior | Aperturas, cierres, movimiento y alarmas |
| Trello | `maintenance_execution` | Ejecución, evidencia y responsable |
| SIIS `estacionesByPing` | `stg_siis_locations` | Identidad externa, nombre y señal operativa |

## Campos SIIS de staging

| Campo | Propósito |
|---|---|
| `sync_run_id` | Ejecución auditada que recibió el registro |
| `siis_code` | Código `estacodi`, almacenado como texto |
| `name_raw` / `name_key` | Nombre original y clave normalizada |
| `online` | Estado derivado de `estaping`; admite desconocido |
| `source_index` | Posición dentro de la respuesta original |
| `payload_json` | Registro crudo sin token ni credenciales |
| `quality_flags` | Errores o advertencias detectados |

## Calidad y procedencia

Cada fila de staging conserva:

- `import_run_id`.
- Hoja y fila de origen.
- Valor crudo.
- Clave normalizada.
- `quality_flags` para campos faltantes.

Ningún `quality_flag` debe rellenarse automáticamente con una suposición.
