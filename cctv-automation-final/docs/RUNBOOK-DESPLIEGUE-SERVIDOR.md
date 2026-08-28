# Runbook de despliegue — Seguridad Electrónica Skylab

**Corte documental:** 27 de agosto de 2026  
**Zona horaria operativa:** `America/Bogota`  
**Estado recomendado:** apto para piloto controlado en intranet; producción condicionada a los controles de la sección 3.

> Para el VPS Linux/Docker actual, aplicar también
> [`ARQUITECTURA-INTEGRACION-DOCKER-SKYLAB.md`](ARQUITECTURA-INTEGRACION-DOCKER-SKYLAB.md).
> El puerto `3003` del host pertenece al frontend Nginx; la API CCTV utiliza
> ese puerto únicamente dentro de la red Docker.

## 1. Alcance

Este documento cubre el traslado al servidor de:

1. `cctv-automation-final`: API, SQLite, correo Dahua/ZK, SIIS, Trello, inventario, cierres y tareas programadas.
2. `CRM_Frontend`: interfaz Skylab que contiene Seguridad Electrónica.
3. La caché de Trello utilizada por mantenimiento y el acceso API empleado por soporte.

No cubre la administración de DSS, paneles Paradox, BabyWare, ZK ni SIIS. Skylab consume señales y metadatos; no debe enviar comandos a estos sistemas.

## 2. Arquitectura de despliegue objetivo

```text
Usuarios intranet
      │ HTTPS
      ▼
Proxy/IIS autenticado
      ├── /                 → CRM_Frontend/dist
      └── /api/cctv/*       → 127.0.0.1:3003
                                  │
                         API Seguridad Electrónica
                                  │
         ┌────────────────────────┼────────────────────────┐
         ▼                        ▼                        ▼
 data/cctv-staging.db       IMAP / SIIS             Trello/caché
         │
 backups + logs + evidencias con ACL restringida
```

En producción no se debe publicar Vite (`npm run dev`) ni exponer directamente el puerto `3003` a toda la red.

## 3. Decisión de salida: piloto frente a producción

### Piloto intranet — autorizado cuando

- el servidor tiene acceso a IMAP, SIIS y Trello;
- la API escucha en `127.0.0.1` o está limitada por firewall;
- existe copia diaria de SQLite, `state.json`, evidencias y configuración;
- se utiliza una cuenta de servicio dedicada;
- el equipo operativo valida siete cierres diarios consecutivos.

### Producción corporativa — bloqueada hasta completar

- autenticación real de la API; actualmente `X-Actor` es trazabilidad declarativa, no autenticación;
- HTTPS y proxy inverso con control de acceso por rol/zona;
- ejecución persistente como servicio, sin depender de una sesión interactiva;
- gestión de secretos fuera de archivos accesibles por usuarios ordinarios;
- respaldo probado y ejercicio de restauración;
- política de retención para imágenes, visitantes, correo y auditoría;
- monitoreo externo del proceso y alertamiento cuando deje de ejecutar;
- evaluación de migración de SQLite si aumenta la concurrencia de escritura.

## 4. Requisitos del servidor

- Windows Server o Windows 10/11 administrado, mientras se conserven los scripts de Task Scheduler.
- Node.js 24 LTS recomendado para mantener compatibilidad con `node:sqlite`; verificar la versión usada en pruebas antes del corte.
- PowerShell 7 recomendado.
- Espacio separado para aplicación, datos, respaldos y logs.
- Acceso de red saliente a IMAP, SIIS y `api.trello.com`.
- Acceso de lectura a la caché Trello si se mantiene como base independiente.
- Resolución horaria correcta y sincronización NTP; zona `America/Bogota`.

## 5. Identidad de servicio y permisos

Crear una cuenta dedicada, por ejemplo `svc_skylab_security`, sin privilegios administrativos interactivos.

Permisos mínimos:

- lectura y ejecución sobre el código;
- lectura/escritura en `data`, `logs`, `reports`, `output`, `backups` y `state.json`;
- lectura del archivo Excel y la caché Trello;
- acceso de red únicamente a los destinos requeridos;
- permiso para ejecutar las tareas programadas.

Los demás usuarios no deben poder leer `.env`, bases SQLite, evidencias o adjuntos cacheados.

## 6. Artefactos que se despliegan

### Código

- código fuente de ambos proyectos;
- `package.json` y `package-lock.json`;
- `platform/schema.sql`;
- configuraciones revisadas de `config/`;
- catálogo Dahua y snapshot DSS aprobados.

### Estado y datos — traslado controlado

- `data/cctv-staging.db` y, si existen, sus archivos `-wal` y `-shm` tomados con los procesos detenidos;
- `state.json`, indispensable para continuar el UID IMAP sin reprocesamiento;
- `data/event-snapshots` y `data/support-images` si deben conservarse;
- Excel operativo configurado en `EXCEL_OUTPUT_PATH`;
- caché Trello si continúa siendo la fuente de mantenimiento.

### Nunca subir al repositorio

- `.env`;
- tokens, contraseñas o cookies;
- bases de datos operativas;
- `state.json`;
- logs y evidencias;
- archivos exportados con datos personales;
- códigos maestros, instalador o contraseñas BabyWare/Paradox.

## 7. Preparación del paquete

En desarrollo:

```powershell
npm ci
npm test
node --check .\api\server.js
```

En `CRM_Frontend`:

```powershell
npm ci
npm run build
```

Conservar el resultado de las pruebas y el hash/commit de la versión desplegada. No copiar `node_modules` desde el equipo de desarrollo.

## 8. Instalación en servidor

1. Crear las carpetas definitivas sin usar rutas personales.
2. Copiar el código y ejecutar `npm ci` en ambos proyectos.
3. Copiar `.env.example` como `.env` y completar los valores mediante la cuenta de servicio.
4. Copiar datos con API y tareas detenidas.
5. Ejecutar una vez la API; esta aplica de forma idempotente `platform/schema.sql`.
6. Verificar importaciones de staging solo si las fuentes Excel definitivas están presentes.
7. Construir y publicar `CRM_Frontend/dist` mediante IIS/proxy.
8. Configurar el proxy `/api/cctv` hacia `127.0.0.1:3003` antes de exponer el módulo.

No ejecutar `npm run import:staging` automáticamente en cada arranque: crea un nuevo corte de importación y debe corresponder a fuentes revisadas.

## 9. Variables de entorno

Usar [`.env.example`](../.env.example) como contrato. Las categorías son:

- IMAP: `IMAP_*`, `VISITORS_IMAP_FOLDER`;
- motor Dahua: ventanas, ráfaga, ruido y Excel;
- SIIS: `SIISS_*` y ventanas de observación;
- API: `CCTV_API_HOST`, `CCTV_API_PORT`, `CCTV_DB`;
- Trello: caché, archivo de entorno, tableros, API key y token;
- cadencia: `MAINTENANCE_SYNC_INTERVAL_MINUTES`.

Validar que las rutas relativas se resuelvan desde la carpeta raíz del servicio. En producción son preferibles rutas absolutas para bases externas, Excel y caché Trello.

## 10. Procesos persistentes

### API

Comando:

```powershell
npm run api
```

Debe ejecutarse como servicio de Windows o mediante el gestor corporativo aprobado, con:

- reinicio automático;
- salida estándar y errores a logs rotados;
- directorio de trabajo fijado al proyecto;
- cuenta de servicio dedicada;
- dependencia de red configurada.

### Frontend

Servir el contenido estático de `CRM_Frontend/dist`. `npm run dev` se limita a desarrollo.

## 11. Tareas programadas

### Ciclo operativo

`scripts/install-operational-schedule.ps1` registra una tarea cada minuto. El orquestador evita solapamientos y aplica internamente:

- correo CCTV: cada 5 minutos;
- SIIS/ping: cada 5 minutos dentro de la política vigente;
- Trello mantenimiento y soporte: cada minuto por defecto;
- cierre operativo: una vez después de las 22:00;
- visitantes: omitidos aquí porque tienen tarea exclusiva.

### Visitantes

`scripts/install-visitor-schedule.ps1` ejecuta la importación diaria a las 20:00.

Antes de producción deben adaptarse ambos instaladores para `LogonType Password` o cuenta administrada; la configuración actual usa sesión interactiva y no garantiza ejecución tras cerrar sesión.

## 12. Copias de seguridad

### Incluidos

- SQLite y archivos auxiliares;
- `state.json`;
- `.env` cifrado o respaldado en el almacén corporativo de secretos;
- imágenes/evidencias sujetas a retención;
- Excel operativo;
- configuración y catálogos manuales.

### Procedimiento seguro para SQLite

1. detener API y tareas o usar la API de backup de SQLite;
2. comprobar que no exista un escritor activo;
3. copiar `.db`, `-wal` y `-shm` como una unidad si no se hizo checkpoint;
4. calcular hash;
5. restaurar en un entorno aislado y ejecutar `/api/cctv/health`.

Frecuencia inicial recomendada: diaria, con una copia previa a cada despliegue. La retención definitiva debe aprobarla infraestructura.

## 13. Validación posterior

```powershell
Invoke-RestMethod http://127.0.0.1:3003/api/cctv/health
Invoke-RestMethod http://127.0.0.1:3003/api/cctv/sync-status
Invoke-RestMethod http://127.0.0.1:3003/api/cctv/overview
Invoke-RestMethod http://127.0.0.1:3003/api/cctv/alarms
npm run cycle:operational -- --dry-run
```

Comprobar en la interfaz:

- Centro operativo y salud de fuentes;
- inventario y ficha integral;
- eventos del día y evidencia bajo demanda;
- primera/última señal SIIS;
- visitantes del último reporte;
- mantenimiento y soporte Trello;
- proyecto;
- alarmas y perfiles BabyWare;
- tema claro y oscuro.

## 14. Criterios de aceptación del despliegue

- API y frontend disponibles por HTTPS;
- cero secretos expuestos en navegador, logs o repositorio;
- continuidad del `state.json` verificada;
- correo leído en modo `readOnly` y sin movimiento de mensajes;
- nueva captura SIIS almacenada;
- Trello actualizado dentro de dos minutos;
- cierre de las 22:00 generado;
- tarea ZK de las 20:00 exitosa;
- prueba de respaldo y restauración aprobada;
- siete días sin pérdida silenciosa de fuente.

## 15. Reversión

1. detener tareas y API de la versión nueva;
2. conservar logs y una copia forense de la base fallida;
3. restaurar código, SQLite, `state.json` y configuración del corte anterior;
4. iniciar API y validar salud;
5. publicar el `dist` anterior;
6. reactivar tareas;
7. documentar el intervalo sin procesamiento y ejecutar recuperación incremental.

Nunca borrar la base o `state.json` para “reiniciar” producción. Eso puede provocar reprocesamiento y pérdida de trazabilidad.

## 16. Evidencia de despliegue

Registrar por cada versión:

- fecha, responsable y servidor;
- commit/hash;
- resultado de pruebas;
- respaldo previo y hash;
- variables modificadas sin sus valores;
- tareas instaladas;
- resultados de endpoints de salud;
- incidencias y decisión de avanzar o revertir.
