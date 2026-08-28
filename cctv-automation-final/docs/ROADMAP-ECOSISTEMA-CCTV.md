# Hoja de ruta del ecosistema CCTV

> Esta hoja conserva las decisiones iniciales. La priorización vigente está en
> [Seguridad Electrónica — estado y hoja de ruta 2026-08-25](ESTADO-Y-ROADMAP-SEGURIDAD-ELECTRONICA-2026-08-25.md).

## Objetivo siguiente

Completar el ciclo operativo uniendo eventos diarios, mantenimiento y activos
con la misma identidad canónica de Puntos de Venta.

## Etapa A — Eventos diarios de correo

**Estado al 2026-08-21: primera capa implementada.** Se creó persistencia
idempotente en `cctv_events`, backfill IMAP de solo lectura, API diaria y la
pestaña **Eventos diarios**. La siguiente tarea es conciliar los alias de
correo y separar eventos operativos de ráfagas técnicas antes de calcular
indicadores de cumplimiento.

### Resultado esperado

Una pestaña de eventos que muestre aperturas, cierres, movimientos, anomalías,
fuente, confianza y relación con el horario SIIS, sin depender del Excel como
base primaria.

### Trabajo propuesto

1. ✅ Auditar nuevamente la bandeja posterior a su limpieza manual.
2. ✅ Definir identificador idempotente por mensaje y evento Dahua.
3. ✅ Persistir referencia de mensaje y evento normalizado en SQLite.
4. Relacionar remitente, asunto, NVR y canal con ubicación y activo canónicos.
5. Separar claramente:
   - apertura y cierre del punto;
   - movimiento operativo;
   - ráfaga/ruido;
   - anomalía técnica;
   - mensaje no reconocido.
6. Comparar apertura y cierre contra horario SIIS.
7. 🟡 Construir resumen diario y bandeja de excepciones. Resumen implementado;
   gestión de excepciones pendiente.
8. ✅ Mantener IMAP en solo lectura durante la estabilización.
9. Diseñar limpieza posterior mediante archivo/movimiento controlado, con
   retención, auditoría y simulación previa.

### Criterios de aceptación

- Ningún correo relevante se descarta silenciosamente.
- Todo descarte conserva motivo y conteo.
- Una reejecución no duplica eventos.
- Es posible rastrear un evento hasta el UID y mensaje fuente.
- El usuario puede revisar los no reconocidos antes de ajustar reglas.

## Etapa B — Mantenimiento y Trello

### Resultado esperado

Una pestaña de mantenimiento integrada con la programación anual, capaz de
mostrar plan, ejecución, evidencias, técnicos, activos afectados y retrasos.

### Modelo objetivo

```text
maintenance_plan
  └─ maintenance_visit
       ├─ maintenance_task
       ├─ maintenance_finding
       ├─ maintenance_evidence
       └─ affected_asset / affected_channel
```

Trello será inicialmente un canal de interacción, no la fuente maestra de
identidad. Cada tarjeta deberá conservar su `trello_card_id`, pero apuntará a
la ubicación canónica y al periodo de mantenimiento.

### Trabajo propuesto

1. Auditar el backend de `CRM_Frontend/Table Trello` y su base SQLite.
2. Documentar listas, estados, checklists, etiquetas y reglas de sincronización.
3. Mapear filas de `2026 programacion anual CCTV.xlsx` a planes canónicos.
4. Resolver identidades mediante `locations.id`, no mediante título de tarjeta.
5. Importar Trello y Excel a staging con idempotencia.
6. Diseñar estados comunes: planificado, programado, en ejecución, bloqueado,
   completado, reprogramado y cancelado.
7. Vincular hallazgos con activos y canales del inventario CCTV.
8. Incorporar calendario, tablero, cumplimiento por zona y vencimientos.
9. Mantener compatibilidad temporal con el flujo actual de Trello/Excel.

### Criterios de aceptación

- Un mantenimiento aparece una sola vez aunque exista en Excel y Trello.
- Cambios en Operación de Puntos se reflejan sin duplicar ubicaciones.
- Completar una visita exige checklist y evidencia mínima configurable.
- Los hallazgos generan acciones y pueden afectar la salud del activo.
- Toda sincronización registra origen, fecha, resultado y errores.

## Etapa C — Inteligencia operativa

Una vez estabilizadas A y B:

- correlacionar eventos de correo, horarios SIIS y mantenimientos;
- detectar cámaras ruidosas, silenciosas o con degradación;
- priorizar mantenimiento por criticidad y reincidencia;
- advertir aperturas tardías, cierres faltantes y comportamiento atípico;
- estimar renovación por EOL, capacidades y costo;
- incorporar DSS como fuente técnica principal y conservar correo como respaldo.

## Orden recomendado de ejecución

1. Persistencia canónica de eventos de correo.
2. Vista diaria y auditoría de descartes.
3. Auditoría técnica de Table Trello.
4. Modelo canónico de mantenimiento.
5. Sincronización controlada Trello/Excel.
6. Correlaciones e inteligencia proactiva.
