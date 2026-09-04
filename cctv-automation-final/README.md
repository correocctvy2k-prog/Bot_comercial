# Seguridad Electrónica / CCTV Automation — Ganepal

Capa local de integración del dominio **Seguridad Electrónica** de Skylab.
Procesa notificaciones Dahua y reportes ZK, concilia SIIS/CRM, DSS y Trello,
y alimenta inventario, eventos, visitantes, mantenimiento, soporte y proyecto.

Documentación vigente antes de trasladar al servidor:

- [`docs/ESTADO-PRE-DESPLIEGUE-2026-08-27.md`](docs/ESTADO-PRE-DESPLIEGUE-2026-08-27.md): estado funcional, cifras y pendientes.
- [`docs/RUNBOOK-DESPLIEGUE-SERVIDOR.md`](docs/RUNBOOK-DESPLIEGUE-SERVIDOR.md): arquitectura, seguridad, instalación, respaldo y reversión.
- [`docs/CHECKLIST-DESPLIEGUE-SERVIDOR.md`](docs/CHECKLIST-DESPLIEGUE-SERVIDOR.md): evidencia que debe completarse en cada cambio.
- [`.env.example`](.env.example): contrato de configuración sin secretos.

**Filosofía de seguridad:** solo lectura sobre el buzón. Nunca borra, mueve
ni envía correos. El control de qué ya se procesó vive en `state.json`
local, no en el servidor.

> El estado actual se considera apto para un piloto controlado en intranet.
> No se debe declarar producción hasta implementar autenticación real de la
> API, HTTPS, ejecución como servicio y respaldo/restauración verificados.

## 0. Ubicación del proyecto

Este paquete está pensado para vivir en:
```
C:\Users\johnathan.beltran\.gemini\antigravity\playground\final-skylab\cctv-automation-final
```
Todas las rutas relativas del `.env` (`EXCEL_OUTPUT_PATH`, logs, etc.) se
resuelven desde esa carpeta. Si mueves el proyecto, ajusta las rutas
absolutas en `.env` si usas alguna.

## 1. Requisitos

- Node.js 18+ instalado en el equipo/servidor donde correrá esto (debe tener
  red hacia el servidor Zimbra — por eso no puede correr en la nube).
- Una contraseña de aplicación para la cuenta `palmira.cctv@ganepalmira.com.co`
  (o la que uses), si Zimbra lo soporta, en vez de la contraseña principal.

## 2. Instalación

```bash
cd cctv-automation
npm install
copy .env.example .env      (Windows)
# o: cp .env.example .env   (si usas Git Bash/WSL)
```

Edita `.env` con los datos reales:
- `IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASSWORD`
- `IMAP_FOLDER`: **confirmado** — esta cuenta (`monitoreo.cctv@ganepalmira.com.co`)
  recibe todas las notificaciones NVR sin filtrar directo en `INBOX`. No usar
  las subcarpetas por sede que puedas ver en el árbol de carpetas (esas
  pertenecen a otra organización de correo, no a esta cuenta de monitoreo)
- `EXCEL_OUTPUT_PATH`: ruta al archivo Excel, idealmente en el NAS
  (ej: `\\NAS\Compartido\CCTV\CCTV_Eventos.xlsx`)

## 3. Ajustar nombres de tienda (opcional)

Edita `config/store-map.json` para mapear nombres crudos del NVR a nombres
limpios. Si una tienda no está en el mapa, se normaliza automáticamente
(quita `NVR_`, cambia `_` por espacio).

## 4. Primera ejecución: diagnóstico de conexión (recomendado)

Antes de procesar nada, valida que el login y el nombre de carpeta son
correctos. Este script NO escribe al Excel ni marca nada como leído:

```bash
node diagnostico.js
```

Debe mostrarte:
- `✅ Login exitoso`
- La lista completa de carpetas de tu buzón (útil para confirmar el nombre
  exacto si `INBOX/CCTV` falla — prueba entonces solo `CCTV`)
- Los 3 correos más recientes de la carpeta configurada

Solo cuando esto funcione, pasa al siguiente paso.

## 5. Primera ejecución real (prueba end-to-end)

```bash
node index.js
```

Revisa `logs/run.log` y el Excel generado en `output/` (o la ruta que
hayas configurado). La primera ejecución toma como línea base los últimos
200 correos de la carpeta — no procesa todo el histórico de 4500+ mensajes.

Para una reconstrucción controlada de una bandeja previamente depurada,
ejecuta una sola vez con `PROCESAR_TODO_PRIMERA_EJECUCION=true`. Este modo
lee todos los mensajes que todavía existan en la carpeta cuando no hay
`state.json`; las ejecuciones posteriores continúan normalmente por UID.

## 6. Calibrar los umbrales de deduplicación

Antes de calibrar o limpiar la bandeja, ejecuta una auditoría completa de
solo lectura con `npm run audit`. El reporte queda en `audits/`, reconcilia
los correos existentes contra el Excel y no modifica `state.json`.

Ejecuta `npm test` después de cambiar reglas Dahua. Las pruebas cubren
variantes de firmware, timestamps, errores tipográficos y taxonomía.

Antes de dejarlo en automático, ejecuta manualmente unas cuantas veces en
distintos momentos del día (incluyendo una noche con ráfagas de ruido) y
revisa la hoja `Anomalias_Mantenimiento`. Ajusta en `.env`:

- `VENTANA_RAFAGA_MIN`: minutos entre correos para considerarlos la misma
  ráfaga (default 8)
- `UMBRAL_RUIDO`: cantidad de correos en una ráfaga a partir de la cual se
  descarta como ruido de cámara en vez de registrarse (default 10)

## 7. Programar ejecución automática (Windows Task Scheduler)

### Estado en la estación Skylab

La tarea `Skylab CCTV - Ciclo operativo` ejecuta el mismo orquestador disponible
como `npm run cycle:operational` cada 5 minutos. El ciclo:

- procesa incrementalmente el correo IMAP en solo lectura;
- persiste eventos de forma idempotente por carpeta + UID;
- sincroniza la instantánea SIIS para construir primera/última detección por ping;
- consulta en Trello la lista de mantenimiento, actualiza su caché local y
  concilia el archivo Excel antes de importar la planificación canónica;
- evita ejecuciones simultáneas mediante `logs/operational-cycle.lock`;
- registra cada resultado en `logs/operational-cycle.jsonl`.

La tarea está configurada para ejecutarse en la sesión del usuario de Skylab.
Si el equipo está apagado o el usuario no tiene una sesión iniciada, no habrá
capturas durante ese intervalo; este comportamiento deberá migrarse a un
servicio de servidor cuando el módulo pase a producción.

El requisito actual es: cada 5 minutos durante la ventana operativa, sin consultar
SIIS entre 23:00 y 05:30. El script ya se autoprotege con `VENTANA_INICIO`/`VENTANA_FIN` en
`.env`, pero configura el Task Scheduler para no desperdiciar ejecuciones:

La cadencia de mantenimiento se puede ajustar sin cambiar la frecuencia del
ciclo mediante `MAINTENANCE_SYNC_INTERVAL_MINUTES` (valor predeterminado: 5).
Un fallo de Trello se registra como `SUCCESS_WITH_WARNINGS`; no interrumpe el
procesamiento crítico de correo o SIIS.

### Observación SIIS adaptativa

`npm run observe:siis` debe invocarse cada cinco minutos. El observador usa
cinco ventanas operativas: apertura 05:30–09:45, cierre de mediodía
12:30–14:15, reapertura 14:30–16:30, cierres especiales 17:30–19:00 y cierre
nocturno 20:30–23:00. Consulta cada 5 minutos durante toda la jornada
en los intervalos restantes. Usa un lock
independiente y registra decisiones y resultados en
`logs/siis-observer.jsonl`. El ciclo operativo también utiliza este observador,
por lo que una ejecución coincidente se omite de forma segura.

Las ventanas se pueden ajustar con `SIIS_PEAK_WINDOWS` usando el formato
`ETIQUETA@HH:MM-HH:MM` separado por comas.

1. Abre **Programador de tareas** → **Crear tarea básica**
2. Nombre: `CCTV Automation - Ganepal`
3. Desencadenador: usar `scripts/install-operational-schedule.ps1` para registrar el ciclo cada 5 minutos.
4. El instalador registra un despertar cada minuto. El orquestador aplica las
   cadencias reales: Trello cada minuto y correo/SIIS cada cinco minutos,
   además de omitir SIIS fuera de su ventana.
5. Acción: **Iniciar un programa**
   - Programa: ruta a `node.exe` (ej: `C:\Program Files\nodejs\node.exe`)
   - Argumentos: `index.js`
   - Iniciar en: la carpeta del proyecto (ej: `C:\Scripts\cctv-automation`)
6. Guarda y prueba con **Ejecutar** manualmente desde el Programador

## 8. Estructura del Excel generado

- **Apertura_Cierre**: una fila por tienda+día, incluyendo los eventos del
  canal de caja fuerte de Llano Grande, se actualiza si llegan más
  eventos del mismo día (no duplica filas)
- **Deteccion_Movimiento**: una fila por ráfaga de movimiento válida
- **Anomalias_Mantenimiento**: ráfagas descartadas por exceder el umbral de
  ruido — útil como alerta de "revisar esta cámara"

## 9. Estructura de archivos

```
cctv-automation/
├── .env                  (credenciales, NO subir a git/nube)
├── .env.example
├── index.js               (orquestador principal)
├── engine.js               (parsing + clasificación + dedup)
├── imapClient.js           (conexión IMAP de solo lectura)
├── excelWriter.js          (escritura al Excel)
├── state.json              (se crea solo, trackea último UID procesado)
├── config/
│   └── store-map.json      (normalización de nombres de tienda)
├── logs/
│   └── run.log              (se crea solo)
└── output/
    └── CCTV_Eventos.xlsx    (o la ruta que definas en .env)
```

## 10. Próximos pasos sugeridos

- Validar 1 semana en paralelo con el proceso manual actual antes de
  confiar 100% en el automático
- Una vez estable, este pipeline es la fuente de datos limpia que el
  módulo "Puntos de Venta" de Skylab puede consumir para el análisis de
  comportamiento por tienda que se planteó como Fase 2

## 11. Inventario y programación anual

La carpeta `platform/` contiene el esquema canónico y el importador de
staging para `DATOS CCTV.xlsx` y `2026 programacion anual CCTV.xlsx`.

```bash
npm run import:staging
npm run verify:staging
```

La importación no modifica los libros ni promueve datos automáticamente.
La conciliación queda en `reports/reconciliation-latest.md` para revisión.

## 12. Integración SIIS

La primera capa SIIS recibe una instantánea JSON y la carga únicamente a
staging. No actualiza `puntos_venta` ni promueve ubicaciones automáticamente.

```bash
npm run import:siis -- --input .\ruta\estaciones.json --db .\data\cctv-staging.db
```

Documentación:

- `docs/ADR-001-IDENTIDAD-Y-SINCRONIZACION-SIIS.md`: decisiones de identidad y seguridad.
- `docs/RUNBOOK-SIIS.md`: contrato, ejecución y recuperación.
- `docs/SIIS_INTEGRATION_MAP.md`: relación con la implementación existente en Skylab.

## 13. Estado del módulo Skylab y hoja de ruta

- `docs/ESTADO-MODULO-CCTV-2026-08-21.md`: corte funcional, fuentes, reglas,
  costos, avance oficial, API y limitaciones conocidas.
- `docs/ROADMAP-ECOSISTEMA-CCTV.md`: plan para integrar el análisis diario de
  correos, mantenimiento, programación anual y Trello.
- `docs/PLAN_INTEGRACION_SKYLAB.md`: fases generales y estado actualizado.
