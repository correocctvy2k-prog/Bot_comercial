# Estado previo al despliegue — Seguridad Electrónica

**Corte:** 27 de agosto de 2026  
**Objetivo del corte:** congelar el contexto funcional y técnico antes de trasladar el proyecto al servidor.

## 1. Resultado alcanzado

Seguridad Electrónica ya funciona como una capa de integración de solo lectura y administración de metadatos sobre SIIS/CRM, correo Dahua, DSS, ZK, Trello, archivos técnicos y paneles de alarma. No reemplaza las plataformas de origen ni controla dispositivos.

La interfaz activa contiene:

1. Centro operativo.
2. Inventario, cobertura por zona y fichas integrales.
3. Visitantes ZK.
4. Eventos diarios y evidencias.
5. Alarmas.
6. Mantenimiento.
7. Proyecto CCTV 2026.
8. Soporte Trello.

## 2. Indicadores verificados por API

| Dominio | Estado al corte |
|---|---:|
| Puntos CRM/SIIS | 375 |
| Ubicaciones canónicas | 357 |
| Cobertura CCTV confirmada por DSS | 95 |
| Puntos sin CCTV | 262 |
| Nodos vinculados | 360 |
| Dispositivos DSS conciliados | 111 de 111 |
| Calidad de inventario DSS | 100 % |
| Canales declarados en DATOS CCTV | 423 |
| Intervenciones del proyecto | 82 |
| Ejecución confirmada del proyecto | 16 de 25 · 64 % |
| Programa de mantenimiento | 172 de 263 · 65 % |
| Soporte Trello | 298 actividades · 27 pendientes |
| Puntos de alarma clasificados | 23 |
| Paneles OSZFORD en fuente | 17 |
| Controladores Dahua dedicados | 3 |
| Alarmas reportadas desde NVR/cámara | 8 |

Los 423 canales no representan los más de 3.070 canales conocidos de la infraestructura completa; se conserva como dato parcial de la hoja, no como total corporativo.

## 3. Salud operativa del corte

| Fuente | Cadencia | Estado observado |
|---|---:|---|
| Correo CCTV | 5 minutos | Saludable |
| SIIS/ping | 5 minutos en ventana vigente | Saludable |
| Trello | 1 minuto | Saludable |
| Visitantes ZK | 20:00 diario | Tarea independiente |
| Cierre operativo | después de las 22:00 | Idempotente, una vez por día |

La tarea principal despierta cada minuto, pero correo y SIIS mantienen su propia cadencia de cinco minutos. Un lock evita ciclos simultáneos.

## 4. Reglas de confiabilidad vigentes

- SIIS/Operación de Puntos define la identidad empresarial.
- DSS confirma cobertura y dispositivos, pero una exportación no equivale a telemetría en vivo.
- El correo se abre en modo solo lectura; no se mueve, borra ni marca como leído.
- Los eventos conservan UID/referencia y payload auditable.
- Inicios y finales de alarma se distinguen; los finales no generan una incidencia nueva.
- Eventos simultáneos del dispositivo y DSS se agrupan sin eliminar las referencias originales.
- La primera llegada puede derivarse de CCTV o primer ping.
- La salida puede usar el último ping solo si cae dentro de la tolerancia del cierre esperado.
- Un ping es señal técnica, no evidencia visual.
- Una coincidencia incierta permanece pendiente; no se fuerza por similitud.
- Cobertura, ejecución del proyecto y disponibilidad técnica son métricas diferentes.

## 5. Alarmas y BabyWare

La taxonomía distingue:

- `OSZFORD_MONITORED`;
- `DAHUA_DEDICATED`;
- `DAHUA_DEVICE_IO`.

Las categorías pueden coexistir. La ficha BabyWare permite registrar abonado, panel, IP local, canal, receptores principal/secundario/respaldo, puertos, estados, política de fallo, fecha y observaciones. No almacena contraseñas ni códigos.

La captura examinada corresponde a reporte GPRS/IP hacia receptor central. Skylab conserva el dato como verificación manual; no lo presenta como telemetría continua.

## 6. Persistencia y trazabilidad

- Base principal: `data/cctv-staging.db`.
- Control incremental IMAP: `state.json`.
- Evidencias: `data/event-snapshots` y `data/support-images`.
- Auditoría operativa: `logs/operational-cycle.jsonl`.
- Cierres: `operational_daily_closures`.
- Cambios manuales: `audit_log`.
- Perfiles BabyWare: `alarm_communication_profiles`.

Las escrituras manuales relevantes usan transacción y auditoría. SQLite continúa siendo apropiado para el piloto local, no se asume como arquitectura definitiva para alta concurrencia.

## 7. Validación técnica

- 46 pruebas automatizadas aprobadas.
- `api/server.js` supera verificación de sintaxis.
- CRM_Frontend compila con Vite para producción.
- API de salud responde y la base está conectada.
- Las fuentes operativas se observaron saludables al corte.

La advertencia de tamaño de bundle de Vite no impide el despliegue, pero conviene dividir módulos con carga diferida en una fase de optimización.

## 8. Pendientes conocidos

- 20 referencias de alarma requieren revisión; incluyen nombres OSZFORD que no deben vincularse automáticamente por ser ambiguos.
- Solo 13 ubicaciones tienen señal OSZFORD vinculada mediante las fuentes combinadas actuales.
- 166 tarjetas de soporte Trello permanecen sin ubicación canónica; no impiden consultar soporte.
- La API carece aún de autenticación corporativa real.
- Vite de desarrollo no debe usarse como servidor productivo.
- Las tareas actuales dependen de sesión interactiva.
- Falta formalizar respaldo, retención, HTTPS y observabilidad externa.
- La integración con DSS continúa mediante catálogos/exportaciones, no API en vivo.
- BabyWare y los paneles Paradox permanecen en solo lectura documental; no hay integración directa.

## 9. Decisión recomendada

Proceder con un **piloto de servidor en intranet**, siguiendo [`RUNBOOK-DESPLIEGUE-SERVIDOR.md`](RUNBOOK-DESPLIEGUE-SERVIDOR.md). No declarar producción hasta cumplir los bloqueadores de seguridad y operación allí definidos.

## 10. Documentos de referencia

- [`ARQUITECTURA_DATOS_CCTV.md`](ARQUITECTURA_DATOS_CCTV.md)
- [`DICCIONARIO_DATOS_CCTV.md`](DICCIONARIO_DATOS_CCTV.md)
- [`MODULO-ALARMAS-Y-CIERRE-PING.md`](MODULO-ALARMAS-Y-CIERRE-PING.md)
- [`MODULO-VISITANTES-ZK.md`](MODULO-VISITANTES-ZK.md)
- [`MODELO-CANONICO-MANTENIMIENTO-TRELLO.md`](MODELO-CANONICO-MANTENIMIENTO-TRELLO.md)
- [`INTEGRACION-TRELLO-SOPORTE-2026.md`](INTEGRACION-TRELLO-SOPORTE-2026.md)
- [`RUNBOOK-SIIS.md`](RUNBOOK-SIIS.md)
- [`DSS_DATA_INTEGRATION.md`](DSS_DATA_INTEGRATION.md)
