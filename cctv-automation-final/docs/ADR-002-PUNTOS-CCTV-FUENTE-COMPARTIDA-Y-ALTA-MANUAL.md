# ADR-002: Fuente compartida entre Operación de Puntos y CCTV

- Estado: aceptado para implementación
- Fecha: 2026-08-21
- Alcance: Skylab CRM / Operación de Puntos / CCTV Inteligente

## Contexto

Operación de Puntos ya administra identidad, zona, conectividad y atributos
comerciales. CCTV necesita extender esa ubicación con activos, canales,
alarmas, eventos, mantenimiento y modernización. Copiar los puntos a una tabla
independiente produciría diferencias de nombre, zona, tipo y estado.

## Decisión

Habrá una sola entidad maestra de ubicación. En PostgreSQL/Supabase será el
punto de Skylab y en la transición se enlazará con `locations` mediante el
código SIIS y un identificador interno estable.

```text
puntos_venta / location
  ├─ identidad, nombre, zona, tipo, estado comercial y SIIS
  ├─ location_capabilities
  ├─ cctv_assets
  │    └─ cctv_channels
  ├─ alarm_devices
  ├─ cctv_events
  ├─ maintenance_plan / execution
  └─ modernization_projects
```

`has_cctv` no será una segunda fuente editable: se calculará a partir de
activos CCTV activos. Durante la transición se actualizará en la misma
transacción por compatibilidad con Operación de Puntos.

### Ubicación física y nodos operativos

Una ubicación física puede contener varios nodos de Operación de Puntos. Un
punto doble, por ejemplo, puede tener dos asesores y dos PC independientes con
el mismo código SIIS, pero compartir local, sistema CCTV y alarmas. La relación
correcta es:

```text
ubicación física 1 ──< nodos operativos N
ubicación física 1 ──< instalaciones CCTV N
```

Un código repetido no se considera conflicto cuando todos los registros están
marcados explícitamente como `is_double`. Los duplicados sin esa justificación
sí quedan retenidos para revisión.

## Tipos de ubicación

El tipo debe ser un catálogo, no una combinación de booleanos:

- `PUNTO_VENTA`
- `OFICINA`
- `EDIFICIO_PRINCIPAL`
- `CENTRO_COMERCIAL`
- `SPORTBOOK`
- `PARQUEADERO`
- `VEHICULO`
- `BODEGA`
- `OTRO`

Características como doble jornada, alarma, CCTV, ANPR o analítica son
capacidades independientes y pueden coexistir con cualquier tipo.

## Alta manual de una instalación

El botón **Agregar instalación** abre un asistente transaccional:

1. **Buscar ubicación**
   - Por nombre, alias, código SIIS, zona o tipo.
   - Filtro inicial: `Sin CCTV`.
   - También permite ampliar una instalación existente.
2. **Elegir solución**
   - Cámara autónoma con MicroSD.
   - Kit NVR/DVR con cámaras.
   - MVR de vehículo.
   - Sistema ANPR.
   - Alarma o accesorios.
   - Kit reutilizado.
3. **Registrar activos**
   - Fabricante, modelo, serial, identificador DSS, capacidad y estado.
   - IP y puertos son opcionales, restringidos por rol y nunca se muestran en
     listados generales.
4. **Registrar canales y capacidades**
   - Video, audio, entrada/salida de alarma, PIR, magnético, pánico, ANPR y
     analíticas.
   - Una cámara MicroSD crea un activo de cámara y un canal; no crea grabador.
5. **Instalación y evidencia**
   - Fecha, técnico, procedencia nueva/reutilizada, observaciones y evidencia.
6. **Confirmación**
   - Vista previa de cambios.
   - Escritura atómica e historial de auditoría.

Si falla cualquier paso de persistencia, no se marca el punto como cubierto.

## Sincronización entre módulos

No se implementará sincronización bidireccional de registros duplicados.
Ambos módulos leerán la misma identidad y mutarán servicios compartidos:

- Cambio de nombre, zona, tipo o cierre en Operación de Puntos: CCTV lo refleja
  de inmediato.
- Alta/baja de activos en CCTV: Operación de Puntos recalcula sus insignias de
  CCTV, alarma y tecnologías.
- El estado online de SIIS no equivale al estado de salud CCTV; ambos se
  presentan separados.
- Las actualizaciones publican un evento de dominio y dejan auditoría.

Eventos previstos:

- `location.updated`
- `cctv.installation.created`
- `cctv.asset.updated`
- `cctv.asset.retired`
- `cctv.coverage.changed`
- `maintenance.completed`

## Contrato mínimo de interfaz

### Ubicación compartida

```json
{
  "id": "uuid",
  "siisCode": "string|null",
  "name": "string",
  "zone": "string",
  "locationType": "PUNTO_VENTA",
  "commercialActive": true,
  "siisOnline": true,
  "capabilities": ["CCTV", "ALARM", "SPORTBOOK"]
}
```

### Instalación CCTV

```json
{
  "locationId": "uuid",
  "solutionType": "STANDALONE_CAMERA|NVR_KIT|MVR|ANPR|ALARM",
  "provenance": "NEW|REUSED",
  "installedAt": "date",
  "assets": [],
  "channels": [],
  "evidence": [],
  "source": "MANUAL",
  "idempotencyKey": "uuid"
}
```

## Permisos

- `points.read`: consultar identidad compartida.
- `cctv.read`: consultar información técnica no sensible.
- `cctv.manage_assets`: instalar, editar o retirar activos.
- `cctv.view_network`: ver IP, puertos y topología.
- `cctv.audit`: consultar procedencia e historial.

Crear o retirar una instalación requiere confirmación y registro de usuario,
fecha, valores anteriores y valores nuevos.

## Orden de implementación

1. Resolver enlace estable entre `puntos_venta` y `locations`.
2. Promover inventario DSS a `assets` y capacidades a `channels`.
3. Crear endpoints compartidos de ubicaciones y cobertura.
4. Implementar buscador `Sin CCTV` y asistente de alta.
5. Sustituir `has_cctv` editable por valor derivado con compatibilidad temporal.
6. Añadir eventos de dominio, auditoría y actualización de cachés.
