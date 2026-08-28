# Seguridad Electrónica en Skylab — estado y hoja de ruta

**Corte:** 25 de agosto de 2026  
**Dominio padre:** Seguridad Perimetral  
**Rama activa:** Seguridad Electrónica

## 1. Objetivo del producto

Seguridad Electrónica debe convertirse en la capa inteligente de administración
de la infraestructura física de seguridad. No reemplaza DSS, ZK, SIIS ni
Trello: los integra, les añade contexto empresarial y convierte sus señales en
decisiones, trazabilidad y acciones proactivas.

El resultado esperado es poder responder, desde una identidad única del punto:

- qué sistemas y activos tiene instalados;
- si se encuentran disponibles y correctamente configurados;
- qué ocurrió durante la jornada y qué evidencia lo demuestra;
- qué mantenimientos, soportes o modernizaciones están pendientes;
- qué riesgos requieren intervención y con qué prioridad;
- cuál es el historial técnico, operativo y financiero de la ubicación.

```text
Seguridad Perimetral
├── Ciberseguridad                    [integración futura]
├── Seguridad Electrónica             [rama activa]
│   ├── CCTV / DSS / Dahua
│   ├── Intrusión y alarmas
│   ├── Control de acceso y visitantes ZK
│   ├── ANPR, MVR y analíticas
│   └── Mantenimiento, soporte y proyectos
└── Seguridad de la Información       [integración futura]
```

## 2. Arquitectura funcional consolidada

```text
CRM / SIIS / Operación de Puntos
  Identidad, código, zona, tipo, horario y estado del punto
                         │
                         ▼
              Catálogo canónico de ubicaciones
                         │
       ┌─────────────────┼──────────────────┐
       ▼                 ▼                  ▼
 DATOS CCTV / DSS   Correo Dahua / ZK   Trello / Proyecto
 Activos y red      Eventos y evidencia  Trabajo y ejecución
       └─────────────────┼──────────────────┘
                         ▼
        API Seguridad Electrónica + SQLite de integración
                         ▼
     Skylab: operación, inventario, eventos, visitantes,
             mantenimiento, proyecto y soporte
```

La identidad empresarial proviene de SIIS/Operación de Puntos. Los nombres de
correo, DSS, Trello y archivos son alias de esa identidad; no crean una nueva
ubicación por sí solos.

## 3. Estado implementado

### 3.1 Catálogo e infraestructura

| Indicador | Estado al corte |
|---|---:|
| Puntos CRM/SIIS observados | 375 |
| Ubicaciones canónicas | 357 |
| Ubicaciones con cobertura conciliada o reportada | 102 |
| Ubicaciones sin CCTV | 255 |
| Nodos vinculados | 360 |
| Dispositivos DSS | 111 |
| Modelos DSS registrados | 111 |
| Canales declarados en la fuente actual | 423 |

La infraestructura empresarial conocida continúa siendo aproximadamente 111
grabadores y más de 3.070 canales. La diferencia frente a los 423 canales
declarados confirma que el catálogo técnico todavía no representa la totalidad
de canales del DSS y debe tratarse como cobertura parcial, no como inventario
final.

### 3.2 Proyecto de modernización

| Indicador | Estado |
|---|---:|
| Objetivos financiados | 58 |
| Destinos de reutilización | 24 |
| Intervenciones auditadas | 82 |
| Identidades revisadas | 82 de 82 |
| Fases | 4 |
| Acciones ejecutables | 25 |
| Ejecuciones verificadas | 16 |
| Avance oficial | 64 % |
| Inversión registrada | $167.625.898 COP |

Los dos desmontados permanecen como trazabilidad histórica y no participan en
el denominador. La cobertura observada no se utiliza como sustituto de una
ejecución confirmada.

### 3.3 Eventos diarios y comportamiento del punto

Se encuentra operativo el pipeline IMAP de solo lectura para:

- apertura y cierre;
- alarma local y cable trampa;
- movimiento agrupado por ubicación y ventana temporal;
- deduplicación entre dispositivo y notificación DSS;
- descarte auditable de finales de evento y pruebas;
- primera apertura, último cierre y evidencia representativa;
- correlación con horarios de Operación de Puntos;
- primera y última observación SIIS/ping;
- conciliación de identidad por código, alias y evidencia auditada.

Al corte del 25 de agosto se observan 35 eventos y cero identidades operativas
pendientes de conciliación.

### 3.4 Visitantes ZK

| Indicador 2026 | Estado |
|---|---:|
| Visitas importadas | 1.772 |
| Visitantes únicos | 754 |
| Días con actividad | 141 |
| Periodo histórico disponible | marzo–agosto |

El importador admite mensajes directos, varias tablas HTML y lotes de correos
`.eml`. Los documentos se protegen mediante huella SHA-256 y referencia
enmascarada. La importación diaria está programada a las 20:00, una hora
después de la generación del consolidado ZK.

### 3.5 Trello, mantenimiento y soporte

| Flujo | Total | Estado relevante |
|---|---:|---:|
| Programa de mantenimiento | 263 | 168 ejecutadas |
| Actividades de soporte | 296 | 26 pendientes |

Las tarjetas se presentan dentro de Skylab con fecha, tipo, estado, ubicación,
evidencia y detalle emergente. Las actividades del proyecto solo se relacionan
cuando coinciden en ubicación y naturaleza de intervención CCTV; no todo Trello
se considera avance del proyecto.

### 3.6 Interfaz

La navegación fue reorganizada bajo **Seguridad Perimetral** con tres ramas:
Ciberseguridad, Seguridad Electrónica y Seguridad de la Información. Solo
Seguridad Electrónica está activa. El módulo dispone de:

1. Centro operativo.
2. Inventario.
3. Zonas.
4. Visitantes.
5. Eventos diarios.
6. Mantenimiento.
7. Proyecto.
8. Soporte.

Existe soporte visual para modo oscuro y claro, jerarquía tipográfica común,
búsqueda transversal y filtros por zona y estado.

## 4. Automatizaciones actuales

| Proceso | Mecanismo | Frecuencia/ventana |
|---|---|---|
| Correo Dahua | `npm run cycle:operational` | Ciclo operativo periódico |
| Observación SIIS | Política de ventanas horarias | 5 min en ventanas críticas; 30 min fuera de ellas |
| Visitantes ZK | Tarea `Skylab CCTV - Visitantes ZK 20h` | Diaria, 20:00 |
| Mantenimiento Trello | Importación canónica | Dentro del ciclo operativo |
| Soporte Trello | Importación canónica | Dentro del ciclo operativo |

Todas las lecturas de correo son de solo lectura. El procesamiento es
idempotente por fuente y referencia de origen, y los cambios de identidad o
ejecución generan auditoría.

## 5. Decisiones de confiabilidad vigentes

1. SIIS define la identidad empresarial; las demás fuentes aportan alias.
2. Una coincidencia aproximada nunca se promueve sin evidencia suficiente.
3. El evento crudo se conserva antes de derivar KPI o agrupaciones.
4. Un correo de fin de evento no se presenta como una nueva incidencia.
5. Eventos simultáneos del dispositivo y DSS se agrupan por ubicación, tipo y
   ventana temporal, conservando ambas referencias.
6. Ausencia de correo CCTV no equivale por sí sola a incumplimiento.
7. El ping es una ventana de observación, no la hora exacta de encendido.
8. Cobertura, ejecución de proyecto y salud técnica son conceptos distintos.
9. Los costos solo se asignan cuando existe correspondencia demostrable.
10. Las credenciales permanecen fuera del código y de la documentación.

## 6. Brechas y riesgos pendientes

### Operación

- El ciclo depende todavía de procesos y tareas locales de Windows.
- No existe un tablero único de salud de jobs con alertamiento por falla.
- La bandeja IMAP aún no tiene una política segura de archivo y retención.
- Falta un cierre diario firmado que indique completitud de fuentes.

### Datos

- El inventario de canales DSS es parcial respecto de los más de 3.070 canales
  reales.
- Modelos, firmware, EOL, seriales, AF e IP siguen incompletos en parte de la
  red.
- SQLite es adecuado para integración local, no para concurrencia corporativa.
- Falta una taxonomía canónica completa para alarmas, acceso, ANPR y MVR.

### Producto

- Las alertas todavía son principalmente informativas; no existe gestión de
  casos con responsable, SLA, escalamiento y cierre.
- No hay una ficha histórica única del activo con movimientos y cambios.
- Ciberseguridad y Seguridad de la Información están preparadas en navegación,
  pero todavía no tienen modelo ni fuentes.

### Seguridad y gobierno

- Deben formalizarse roles y permisos específicos del dominio.
- Falta definir retención de evidencias, visitantes y datos personales.
- Se requiere separar ambientes de desarrollo, pruebas y producción.

## 7. Siguientes pasos lógicos

### Fase 1 — Cerrar la operación diaria confiable

**Prioridad inmediata.** Antes de sumar nuevas fuentes, debemos garantizar que
las actuales producen un corte completo y verificable.

1. Crear un **orquestador único** para correo CCTV, SIIS, visitantes y Trello.
2. Guardar por cada ejecución: inicio, fin, fuente, registros recibidos,
   insertados, omitidos, errores y antigüedad del último éxito.
3. Construir un panel de **Salud de integraciones** con estados saludable,
   atrasada y fallida.
4. Generar el cierre operativo diario a las **22:00 (America/Bogota)**, dos
   horas después de la importación ZK y con margen para validar las demás
   fuentes.
5. Alertar cuando ZK no entregue reporte, IMAP falle, SIIS quede sin captura o
   Trello supere su ventana de actualización.

**Criterio de salida:** siete días consecutivos con ejecuciones auditadas y sin
pérdida silenciosa de datos.

### Fase 2 — Archivo y limpieza segura del correo

Retoma el objetivo original de controlar el crecimiento de la bandeja.

1. Clasificar mensajes como procesado, pendiente, descartado auditable o error.
2. Crear un manifiesto que relacione carpeta, UID, hash, fecha y entidad creada.
3. Simular la limpieza en modo `dry-run` y producir un informe previo.
4. Mover —no eliminar— mensajes procesados a carpetas de archivo por fuente y
   año/mes.
5. Aplicar retención únicamente después de confirmar restauración y respaldo.

**Criterio de salida:** ningún mensaje se mueve sin persistencia, hash y
trazabilidad verificable; la primera ejecución debe requerir aprobación humana.

### Fase 3 — Actualización técnica DSS por mecanismos disponibles

La integración directa no se considera un supuesto del proyecto. Se evaluará,
pero el diseño debe funcionar aunque DSS 8.5.0 no ofrezca una API viable.

1. Evaluar de forma acotada la API/SDK disponible para DSS 8.5.0.
2. Priorizar alternativas soportables: reportes web programados, exportaciones
   periódicas, archivos CSV/XLSX y cargas controladas por el usuario.
3. Obtener, cuando la fuente lo permita, jerarquía de dispositivos y canales,
   modelo, serial, firmware, estado en línea, almacenamiento y capacidades.
4. Conciliar contra el catálogo de activos y generar diferencias auditables.
5. Implementar una ficha por activo y una topología por punto.
6. Incorporar EOL y recomendación técnica sin depender únicamente de enlaces
   comerciales externos.

**Criterio de salida:** conteo DSS conciliado con el universo real de canales y
estado técnico actualizado automáticamente.

### Fase 4 — Motor proactivo de incidentes

1. Definir reglas versionadas de tardanza, no apertura, pérdida de señal,
   cámara fuera de línea, almacenamiento, ráfaga, intrusión y visita abierta.
2. Correlacionar horario, ping, correo, DSS, mantenimiento y soporte.
3. Crear casos con severidad, evidencia, responsable, SLA y estado.
4. Evitar alertas duplicadas mediante correlación temporal y causal.
5. Notificar por los canales corporativos aprobados y medir resolución.

**Criterio de salida:** cada alerta accionable genera un único caso explicable,
con evidencia y recomendación.

### Fase 5 — Dominio completo de Seguridad Electrónica

1. Control de acceso ZK más allá de visitantes: puertas, dispositivos y salud.
2. Alarmas monitoreadas por OSZFORD: paneles, zonas, eventos y atención.
3. ANPR: entradas, salidas, listas y permanencias en parqueaderos.
4. MVR: vehículos, conectividad, almacenamiento y eventos.
5. Analíticas Dahua/IA: capacidades, reglas y efectividad por punto.

### Fase 6 — Plataforma corporativa

1. Migrar SQLite y API local al backend unificado de Skylab.
2. Implementar autenticación, autorización por zona y segregación de funciones.
3. Cifrado, copias de seguridad, observabilidad y recuperación.
4. Políticas de retención y tratamiento de datos personales.
5. Pruebas de carga, contrato de API y despliegue controlado.

## 8. Próximo incremento recomendado

El siguiente incremento debe combinar **Fase 1 y el diseño de Fase 2**:

> Implementar el cierre operativo de las 22:00 y el panel de salud de integraciones,
> mientras se construye el manifiesto auditable para una futura limpieza IMAP.

Este paso produce valor inmediato, reduce el riesgo de operar con información
incompleta y crea la condición necesaria para automatizar el archivo del correo
sin perder evidencia.

## 9. Indicadores de éxito

- porcentaje de fuentes recibidas dentro de su ventana;
- días con cierre operativo completo;
- eventos sin identidad o sin clasificación;
- puntos y activos conciliados contra DSS;
- alertas accionables frente a ruido descartado;
- tiempo medio de reconocimiento y resolución;
- porcentaje de mantenimiento ejecutado a tiempo;
- avance verificable del proyecto;
- mensajes archivados con trazabilidad y cero pérdida;
- adopción por administradores de zona.

## 10. Validación técnica del corte

- API local disponible en el puerto 3003.
- Frontend de producción compilado correctamente.
- 40 pruebas automatizadas aprobadas.
- Cero identidades operativas pendientes el 25 de agosto.
- Importación histórica ZK marzo–agosto conciliada.
- Tarea diaria ZK registrada y lista.

Los indicadores de este documento son una fotografía del corte. La interfaz y
la API son la fuente para cifras operativas posteriores.
