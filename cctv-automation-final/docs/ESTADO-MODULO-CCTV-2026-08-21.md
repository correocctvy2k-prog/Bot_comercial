# Estado del módulo CCTV en Skylab — corte 2026-08-21

> Documento histórico. El corte vigente y la hoja de ruta consolidada están en
> [Seguridad Electrónica — estado y hoja de ruta 2026-08-25](ESTADO-Y-ROADMAP-SEGURIDAD-ELECTRONICA-2026-08-25.md).

## Propósito

Este documento registra el estado implementado del ecosistema CCTV y las
reglas funcionales acordadas. Es el punto de partida para continuar con el
análisis diario de correos y la integración del proyecto de mantenimiento
basado en Trello.

## Visión del producto

CCTV Inteligente es un submódulo de **Puntos de Venta** en Skylab. Comparte
con Operación de Puntos la identidad, nombre, código SIIS, zona y tipo de cada
ubicación. Su objetivo no es reemplazar DSS, sino complementar su operación
con inventario empresarial, costos, mantenimiento, eventos, trazabilidad y
automatización proactiva.

```text
Operación de Puntos / SIIS ──> identidad y contexto empresarial
DATOS CCTV + DSS ────────────> infraestructura, activos y capacidades
Proyecto 2026 ───────────────> inversión, fases y modernización
Correo Dahua ────────────────> eventos operativos y evidencia redundante
Trello / Programación anual ─> mantenimiento planificado y ejecutado
                                  │
                                  v
                         CCTV Inteligente / Skylab
```

## Infraestructura conocida

- Aproximadamente 111 grabadores y más de 3.070 canales de video.
- Marca predominante: Dahua.
- Administración centralizada mediante DSS7116S, versión 8.5.0.
- Soluciones heterogéneas: NVR, cámaras autónomas con microSD, MVR, ANPR,
  alarmas, analíticas avanzadas, IA y sistemas complejos de oficina.
- Una ubicación con `1` canal representa normalmente una cámara autónoma con
  microSD y no requiere grabador.
- `K35` identifica una cámara antigua en proceso gradual de modernización.
- La denominación empresarial aprobada es **Zona**, no Región.

## Fuentes actualmente incorporadas

| Fuente | Función | Estado |
|---|---|---|
| SIIS / Operación de Puntos | Catálogo canónico de ubicaciones | Integrado y conciliado |
| `DATOS_CCTV_v2.xlsx` | Inventario y proyecto de modernización | Importado a staging |
| `DeviceInfo.xlsx` y capturas DSS | Identidad técnica y modelos disponibles | Integración parcial |
| `2026 programacion anual CCTV.xlsx` | Fuente operativa de mantenimiento | Disponible; integración siguiente |
| Correo IMAP Dahua | Apertura, cierre, movimiento y anomalías | Motor standalone funcional; falta persistencia Skylab |
| Table Trello | Programación y ejecución de mantenimiento | Proyecto paralelo; falta integración canónica |

## Estado funcional del frontend

Ruta local: `http://127.0.0.1:5174/points/cctv`.

Pestañas disponibles:

1. **Centro operativo:** panorama de cobertura, tecnologías, alertas y puntos.
2. **Inventario:** tarjetas por ubicación, estado de calidad y activos.
3. **Zonas:** distribución territorial.
4. **Alertas:** inconsistencias y acciones de conciliación.
5. **Proyecto:** alcance, inversión, líneas, fases, costos y ejecución confirmada.

La interfaz usa iconografía funcional por tipo de ubicación y tecnología. Las
imágenes reales se reservan para modelos de dispositivos.

## Proyecto de modernización 2026

### Datos conciliados

- Alcance presupuestal: **58 puntos**.
- Identidad canónica: **58 de 58 vinculados**.
- Fases detectadas: **4**.
- Registros de ejecución: **27**.
- Acciones vigentes: **25**.
- Desmontados históricos: **2**, excluidos de pendientes y avance.
- Inversión total registrada en la fuente: **$167.625.898 COP**.

Los encabezados `PUNTO A INSTALAR...` se interpretan como separadores de fase,
no como ubicaciones.

### Costos asociados por fase

| Fase | Valor conciliado | Regla |
|---|---:|---|
| 1 | $13.931.984 | 4 puntos con valor fuente relacionado |
| 2 | $0 | Reutilización sin valor fuente directamente asignable |
| 3 | $16.593.984 | 5 puntos con valor fuente relacionado |
| 4 | $14.957.986 | 5 puntos con valor fuente relacionado |

Estos valores son **presupuesto asociado verificable**, no una distribución
forzada del total. El sistema no reparte el saldo entre fases cuando la fuente
no permite demostrar la correspondencia.

### Avance oficial

El avance oficial se calcula así:

```text
acciones vigentes registradas como realizadas / 25 acciones vigentes
```

- Los desmontados no forman parte del denominador.
- Tener cobertura CCTV no equivale a tener ejecutado el proyecto.
- Una acción solo se completa al guardar una instalación desde su tarjeta.
- El alta genera instalación, activos, canales y trazabilidad de auditoría.
- Las acciones nuevas, cambios tecnológicos y reutilizaciones son registrables.
- Una acción completada queda visualmente confirmada y no vuelve a ofrecer el
  botón de alta.

Al corte de este documento el avance oficial inicia en **0 de 25 (0%)**. Este
valor debe consultarse en la API y no mantenerse manualmente en documentación.

## Alta de instalaciones y activos

El asistente permite seleccionar o recibir preseleccionada una ubicación y
registrar solución, procedencia, fecha, técnico, notas y activos.

Reglas actuales:

- Cada NVR, cámara, cámara autónoma, HapLite y UPS es un activo individual.
- NVR, cámaras y HapLite requieren código AF; UPS admite AF.
- NVR, cámara autónoma y HapLite requieren IP.
- En un kit, cada cámara posee su propio AF y serial.
- PIR, sirena, sensor magnético, botón de pánico, switch PoE y rack no exigen
  AF en esta primera versión.
- La procedencia puede ser nueva, reutilizada o mixta.
- El alta es transaccional y deja registro en `audit_log`.

## API local implementada

Base: `http://127.0.0.1:3003/api/cctv`.

| Ruta | Uso |
|---|---|
| `GET /health` | Estado de API y base de datos |
| `GET /overview` | Resumen operativo |
| `GET /inventory` | Inventario conciliado |
| `GET /technology` | Tecnologías y modelos |
| `GET /quality` | Calidad y pendientes |
| `GET /project` | Proyecto, fases, costos y avance |
| `GET /locations` | Búsqueda del catálogo canónico |
| `POST /project/identity/:id/link` | Vinculación manual auditable |
| `POST /installations` | Alta transaccional de instalación y activos |
| `GET /events/daily?date=AAAA-MM-DD` | Resumen y detalle diario de correo Dahua |

Cuando `POST /installations` recibe `projectItemId`, valida que el registro y
la ubicación correspondan y crea el evento de auditoría
`PROJECT_INSTALLATION_REGISTERED`. Ese evento alimenta el avance oficial.

## Reglas de confiabilidad

1. SIIS identifica la ubicación empresarial; los nombres son alias.
2. Ninguna coincidencia aproximada se promueve automáticamente.
3. Los archivos fuente entran a staging antes del catálogo canónico.
4. Los desmontados se preservan como historia y no generan tareas.
5. Cobertura observada y ejecución confirmada son indicadores diferentes.
6. No se inventan costos ni se distribuyen valores sin correspondencia.
7. Las credenciales permanecen únicamente en `.env` y no se documentan.
8. Todo cambio operativo debe ser idempotente y auditable.

## Limitaciones conocidas

- Los modelos DSS siguen incompletos porque el export no incluyó todos los
  datos; se complementaron parcialmente mediante capturas.
- Los costos de fase cubren solo puntos conciliables con valores fuente.
- La API y SQLite son una capa local de integración; deberán migrar al backend
  unificado de Skylab antes de producción corporativa.
- El análisis de correo todavía escribe principalmente a Excel y `state.json`.
- Trello y programación anual aún no comparten el modelo canónico de
  mantenimiento con CCTV.

## Persistencia diaria de correo

El pipeline guarda cada mensaje procesado en `cctv_events` antes de avanzar
`state.json`. La clave idempotente es `EMAIL_DAHUA + carpeta:UID`. Los correos
de prueba y eventos desconocidos también se conservan con su motivo para
auditoría; no se eliminan silenciosamente.

La reconstrucción controlada de los últimos 45 días se ejecuta con:

```bash
npm run events:backfill -- 45
```

Este comando abre IMAP en modo de solo lectura, no modifica `state.json`, no
escribe Excel y no mueve ni marca mensajes. El resumen de una fecha puede
consultarse con `npm run events:daily -- AAAA-MM-DD` o desde la pestaña
**Eventos diarios** de CCTV Inteligente.

La vista diaria deriva, sin alterar el evento crudo:

- primer evento de apertura y último cierre observado por punto;
- estado de par completo, solo apertura o solo cierre;
- actividad horaria separada en apertura, cierre y movimiento;
- ráfagas de movimiento por punto/canal con ventana de 8 minutos;
- alerta de ruido cuando una ráfaga supera 10 activaciones;
- porcentaje de identidad exacta y alias pendientes;
- trazabilidad hasta carpeta y UID del mensaje.
- visor bajo demanda para instantáneas JPEG, PNG o WebP adjuntas;
- caché local restringida por evento, con límite de 5 MB por imagen.

La ausencia de apertura o cierre se presenta como **evento no observado**, no
como incumplimiento. Para hablar de tardanza o incumplimiento será obligatorio
integrar primero el horario esperado proveniente de SIIS.

Las imágenes no se descargan masivamente durante el backfill. El visor solicita
un UID específico, abre IMAP en solo lectura, valida el tipo y tamaño del
adjunto y conserva únicamente la imagen aceptada en `data/event-snapshots`.

La vista incorpora además el último `estaping` de SIIS para todas las
ubicaciones canónicas, tengan o no CCTV. La señal muestra fecha de captura y
se separa de la salud CCTV. El comando `npm run sync:siis-live`, ejecutado de
forma periódica, construirá el historial necesario para primera/última
actividad y transiciones de conectividad.

## Validación técnica del corte

- `node --check api/server.js`: aprobado.
- Compilación de `CRM_Frontend`: aprobada.
- ESLint de `src/pages/CctvModule.jsx`: aprobado.
- API del proyecto: 25 acciones vigentes, 2 históricas, 0 completadas al corte.
