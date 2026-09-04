# SDD - Inventario de activos de Ciberseguridad

- Estado: propuesta para revision
- Version: 0.1.0
- Fecha: 2026-08-29
- Propietario funcional: Seguridad / TI
- Sistema propietario: Skylab

## 1. Problema

Skylab necesita conocer que activos existen, que evidencia respalda su vigencia,
quien los administra, en que segmento operan y si estan autorizados para ser
escaneados. FortiGate aporta una primera fotografia, pero sus registros pueden
ser transitorios, antiguos o contradictorios. La solucion debe preservar el
dato original y evitar promociones automaticas no auditadas.

## 2. Objetivos

- Construir identidad estable aunque cambien IP o hostname.
- Conservar cada observacion con procedencia y tiempo.
- Explicar por que un activo se considera vigente, incierto o inactivo.
- Distinguir activo corporativo, infraestructura, IoT/CCTV, movil y visitante.
- Correlacionar hallazgos Greenbone sin depender de su base interna.
- Impedir que el inventario amplie implicitamente el alcance de escaneo.
- Producir XLSX sanitizados y reproducibles para revision humana.

## 3. No objetivos de esta fase

- Inventariar automaticamente todos los segmentos enrutados por FortiGate.
- Ejecutar escaneos sin una autorizacion versionada.
- Dar de baja activos solo porque dejaron de aparecer.
- Resolver automaticamente conflictos fuertes de identidad.
- Guardar credenciales, llaves o configuraciones completas de dispositivos.

## 4. Conceptos y entidades

### 4.1 Fuente y captura

`source_system` describe el productor: `FORTIGATE`, `KASPERSKY`, `ACTIVE_DIRECTORY`,
`GREENBONE` o `MANUAL`. `source_snapshot` representa una captura concreta e
incluye:

- UUID.
- Fecha de captura e importacion.
- Tipo y version del productor cuando se conozcan.
- Hash SHA-256 del archivo original.
- Referencia opaca de custodia, nunca una ruta publica.
- Clasificacion y estado de procesamiento.
- Conteos y resumen de calidad.

Una reimportacion con el mismo hash debe ser idempotente.

### 4.2 Observacion

Una observacion afirma que una fuente vio un identificador o atributo en un
instante. No equivale a una identidad canonica. Debe conservar:

- Fuente y captura.
- Tiempo observado y tiempo ingerido.
- Interfaz o segmento de origen.
- IP, MAC, hostname, usuario, fabricante, clase y sistema operativo observados.
- Valor bruto normalizado de forma no destructiva.
- Confianza por atributo.
- Indicadores de calidad o contradiccion.

### 4.3 Activo canonico

`asset` representa una identidad aprobada. Campos minimos:

- UUID inmutable, no derivado de IP, MAC ni hostname.
- Nombre canonico.
- Clase, subtipo, criticidad y estado de ciclo de vida.
- Area propietaria y custodio tecnico, si se conocen.
- Fechas de creacion, actualizacion y revision.
- Estado de conciliacion y justificacion.

### 4.4 Identificadores

Los identificadores se modelan por separado porque cambian y pueden ser
reutilizados:

- `MAC`, normalizada y con indicador de direccion local/aleatoria.
- `IPV4` o `IPV6`, siempre asociada a segmento y ventana temporal.
- `HOSTNAME`, conservando valor original y clave normalizada.
- Serial, UUID de agente, ID de Kaspersky, objeto AD u otro identificador fuerte.

Cada vinculacion tiene `valid_from`, `valid_to`, fuente, confianza y estado de
verificacion. Una IP no es unica globalmente a traves del tiempo.

### 4.5 Segmentos

`network_segment` incluye CIDR, nombre, zona de seguridad, propietario,
criticidad, tratamiento de datos y politica de escaneo. La tabla de rutas del
FortiGate no constituye por si sola autorizacion.

El CIDR confirmado de `VLANInformatica` debe registrarse en configuracion
operacional restringida y respaldarse con evidencia del equipo de red; no debe
inferirse desde la mascara configurada en un host ni publicarse en documentos
versionados de alcance general.

### 4.6 Autorizacion de escaneo

`scan_authorization` define de forma versionada:

- Activo o segmento incluido.
- Ventana y fecha de expiracion.
- Tipo de escaneo permitido.
- Exclusiones de hosts y puertos.
- Limites de concurrencia y tasa.
- Pruebas disruptivas permitidas o prohibidas.
- Aprobador, motivo y referencia de cambio.

La ausencia de una autorizacion vigente significa `DENY`.

## 5. Identidad y conciliacion

### 5.1 Evidencia fuerte

- Serial o UUID de hardware confiable.
- UUID de agente Kaspersky.
- Objeto estable de Active Directory.
- Identificador manual verificado.

### 5.2 Evidencia media

- MAC universal observada consistentemente.
- Combinacion MAC, fabricante, hostname y segmento.
- Coincidencia estable entre dos fuentes independientes.

### 5.3 Evidencia debil

- IP sin historial.
- Hostname generico.
- Usuario visto en una sesion.
- Sistema operativo inferido por fingerprint.
- MAC local o aleatoria de un movil.

### 5.4 Reglas

1. Una coincidencia fuerte puede proponer una vinculacion automatica, pero debe
   quedar auditada.
2. Una MAC universal no puede fusionar activos si hay solapamiento temporal en
   segmentos incompatibles.
3. Una IP nunca fusiona por si sola.
4. Hostnames reutilizados generan conflicto, no reemplazo silencioso.
5. MAC aleatorias se tratan como identificadores efimeros.
6. Los conflictos fuertes entran en `identity_review_queue`.
7. Fusionar o separar activos conserva los IDs previos como alias auditables.

## 6. Vigencia

La vigencia es explicable y se calcula por politica de clase. Registra:

- `first_seen_at` y `last_seen_at`.
- Numero de capturas y dias distintos observados.
- Regularidad de presencia.
- Cantidad y autoridad de fuentes.
- Ultimo escaneo satisfactorio.
- Contradicciones y evidencia de retiro.

Estados propuestos:

| Estado | Significado |
| --- | --- |
| `CONFIRMED_ACTIVE` | Evidencia reciente autoritativa o multiples fuentes |
| `PROBABLE_ACTIVE` | Evidencia reciente de una sola fuente operacional |
| `INTERMITTENT` | Presencia discontinua coherente con su clase |
| `STALE_CANDIDATE` | Supero el umbral de ausencia; requiere revision |
| `OBSOLETE_REVIEW` | Ausencia prolongada o identidad contradictoria |
| `RETIRED` | Baja confirmada por una decision auditable |
| `UNKNOWN` | Evidencia insuficiente |

Umbrales iniciales, configurables y no universales:

| Clase | Fresco | Candidato inactivo | Revision de obsolescencia |
| --- | ---: | ---: | ---: |
| Servidor / red / seguridad | 1 dia | 3 dias | 14 dias |
| Escritorio corporativo | 7 dias | 30 dias | 90 dias |
| Portatil corporativo | 14 dias | 45 dias | 120 dias |
| Impresora / IoT / CCTV | 7 dias | 30 dias | 90 dias |
| Movil corporativo | 14 dias | 30 dias | 60 dias |
| Invitado / BYOD | 1 dia | 7 dias | 30 dias |

Estos umbrales generan recomendaciones; solo evidencia de baja cambia a
`RETIRED`.

### 6.1 Puntuacion explicable

La puntuacion de 0 a 100 se guarda junto con sus componentes, no como caja
negra:

```text
score = recencia + frecuencia + diversidad_fuentes + autoridad_fuentes
        + escaneo_reciente - contradicciones - ausencia_prolongada
```

La clasificacion final aplica primero reglas de retiro y conflicto, despues la
puntuacion. Ningun score autoriza un escaneo.

## 7. Flujo de ingestion FortiGate

1. Recibir una copia restringida y calcular SHA-256.
2. Crear `source_snapshot` sin guardar contenido bruto en Git o la base.
3. Parsear cada bloque como observacion de staging.
4. Normalizar IP, MAC, hostname, interfaz y tiempos sin sobrescribir valores
   brutos.
5. Rechazar credenciales y secretos si aparecieran accidentalmente.
6. Calcular indicadores de calidad.
7. Proponer coincidencias contra activos existentes.
8. Promover solo coincidencias deterministas permitidas por politica.
9. Enviar conflictos y activos nuevos a revision humana.
10. Generar reporte de conciliacion y exportacion XLSX sanitizada.

El primer archivo FortiGate se considera linea base historica, no inventario
confirmado completo.

## 8. Esquema logico propuesto

Tablas de primera fase:

- `cyber_source_systems`
- `cyber_source_snapshots`
- `cyber_asset_observations`
- `cyber_assets`
- `cyber_asset_identifiers`
- `cyber_asset_observation_links`
- `cyber_network_segments`
- `cyber_asset_owners`
- `cyber_identity_reviews`
- `cyber_lifecycle_assessments`
- `cyber_scan_authorizations`
- `cyber_scan_authorization_targets`

Tablas posteriores:

- `cyber_scan_runs`
- `cyber_vulnerability_findings`
- `cyber_finding_asset_links`
- `cyber_risk_acceptances`
- `cyber_remediation_actions`

Los nombres llevan prefijo `cyber_` para evitar colisiones con la tabla
`assets` de Seguridad Electronica mientras se define el catalogo corporativo
compartido.

## 9. XLSX de revision

El libro generado desde la base tendra:

- `Resumen`
- `Activos`
- `Identificadores`
- `Segmentos`
- `Pendientes identidad`
- `Vigencia`
- `Autorizaciones`
- `Fuentes`

Por defecto enmascara IP, MAC, usuarios y referencias restringidas. Una
exportacion completa exige rol y deja registro de auditoria.

## 10. Seguridad y confiabilidad

- SQLite con `foreign_keys=ON`, WAL, `busy_timeout` y transacciones atomicas.
- Copia consistente antes de migraciones y restauracion probada.
- Hash de capturas y manifiesto de importacion.
- Parametros SQL; nunca concatenacion de valores de fuente.
- Limites de tamano, filas y tiempo del importador.
- Logs sin payloads completos, credenciales ni PII innecesaria.
- Acceso por rol y enmascaramiento en API/UI.
- Auditoria append-only de promociones, fusiones, retiros y autorizaciones.
- Retencion diferenciada para bruto, observaciones, hallazgos y auditoria.

## 11. API futura minima

- `POST /api/cyber/inventory/imports` registra una importacion autorizada.
- `GET /api/cyber/assets` lista activos segun rol.
- `GET /api/cyber/assets/:id` retorna identidad, vigencia y procedencia.
- `GET /api/cyber/identity-reviews` lista conflictos.
- `POST /api/cyber/identity-reviews/:id/decision` registra una decision.
- `GET /api/cyber/network-segments` consulta alcance y clasificacion.
- `GET /api/cyber/scan-authorizations` consulta permisos vigentes.
- `GET /api/cyber/inventory/export.xlsx` genera una vista autorizada.

Las operaciones mutables requieren autenticacion, rol, actor y motivo. Los
endpoints de escaneo no pertenecen a esta primera fase.

## 12. Criterios de aceptacion

1. Reimportar la misma captura no duplica observaciones.
2. Cada dato mostrado permite llegar a su fuente y captura.
3. Una IP reutilizada no fusiona automaticamente dos activos.
4. Una MAC aleatoria no se usa como identidad fuerte.
5. La ausencia nunca produce una baja automatica.
6. Los umbrales de vigencia varian por clase de activo.
7. Ningun activo sin autorizacion puede convertirse en objetivo de escaneo.
8. El archivo bruto no aparece en Git, SQLite ni exportaciones ordinarias.
9. El XLSX se reproduce a partir de una version identificable de la base.
10. Las decisiones humanas registran actor, fecha, motivo y valores previos.
11. Las pruebas incluyen idempotencia, conflictos, timestamps y rollback.
12. Una copia de seguridad puede restaurarse y pasar controles de integridad.

## 13. Casos de prueba obligatorios

- Misma MAC e IP en dos capturas consecutivas.
- Misma IP con MAC diferente en tiempos no solapados.
- Misma IP con MAC diferente en el mismo instante.
- MAC local aleatoria observada en redes distintas.
- Hostname compartido o renombrado.
- Activo visto por FortiGate pero ausente en Kaspersky.
- Activo Kaspersky que no genero trafico en FortiGate.
- Activo intermitente que reaparece despues del umbral.
- Captura duplicada y captura parcialmente corrupta.
- Timestamp UTC frente a `America/Bogota`.
- Intento de escaneo sin autorizacion o con autorizacion expirada.
- Exportacion con y sin permisos para datos restringidos.

## 14. Plan de implementacion posterior a aprobacion

1. Aprobar esta especificacion y los umbrales iniciales.
2. Definir DDL SQLite y migracion versionada.
3. Construir parser FortiGate con fixtures anonimizados.
4. Implementar staging idempotente y reporte de calidad.
5. Implementar conciliacion y cola de revision.
6. Generar XLSX sanitizado desde SQLite.
7. Integrar API de solo lectura en Skylab.
8. Validar con la captura de 2026-08-29 sin versionarla.
9. Definir el piloto Greenbone en autorizaciones separadas.

## 15. Preguntas pendientes de decision humana

- Propietario funcional final del catalogo y responsables por area.
- Retencion del archivo bruto y ubicacion de custodia.
- Roles que pueden ver identificadores sin enmascarar.
- Umbrales definitivos por clase de activo.
- Quien puede aprobar, renovar y revocar alcances de escaneo.
- Fuente autoritativa para bajas: AD, Kaspersky, mesa de servicio o decision
  manual documentada.
