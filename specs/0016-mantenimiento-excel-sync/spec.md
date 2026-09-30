# SPEC 0016 — Sincronización Trello → Excel de mantenimiento CCTV

- **Estado:** Desplegada en `.65`. Montaje CIFS finalmente resuelto (ver "Actualización
  2026-09-25" abajo, que reemplaza la nota "sin montaje" de 2026-09-24) — la sincronización
  automática Trello→Excel **sí está activa y verificada en producción con datos reales**. El
  botón de la pestaña Mantenimiento se simplificó definitivamente a solo copiar la ruta de red.
- **Autor:** Claude (a pedido de ia_gerencia@ganepalmira.com.co)
- **Fecha:** 2026-09-23
- **Módulos afectados:** `cctv-automation-final` (pipeline de mantenimiento, API), CRM_Frontend
  (`CctvModule.jsx`, pestaña Mantenimiento), infraestructura de `.65` (montaje de red)
- **Rama:** `feat/0016-mantenimiento-excel-sync` (mergeada), seguimiento en
  `fix/0016-excel-boton-sin-monitoreo` (PR #13-#17) y `fix/0016-simplificar-solo-copiar` (final)
- **PR:** #12 (mergeado); fixes de seguimiento #13-#18 y el de cierre, sin PR numerado propio

## Actualización 2026-09-25 — CIFS montado y verificado; botón final: solo copiar ruta

El montaje CIFS que la nota de 2026-09-24 daba por inalcanzable **sí se logró** (se abrió firewall
entre las subredes de `.65` y del NAS, se creó el usuario de servicio `Serv_IA` con permisos de
carpeta y de raíz del share, y se montó vía `mount.cifs` en `/etc/fstab`) — ver
`docs/lecciones-aprendidas/LL-0005-dos-integraciones-trello-desconectadas.md` y memoria del
proyecto para el detalle completo del diagnóstico (`smbclient` como herramienta clave). La
sincronización automática Trello→Excel quedó **verificada end-to-end contra el archivo real**
(cambio real en Trello reflejado en el `.xlsx` de la ruta de red, `mtime` coincide).

Con la red ya funcionando, se intentó varias veces que el botón "abrir archivo" abriera el Excel
con un solo clic (`ms-excel:ofe|u|<url>`, luego un acceso directo `.url` descargable) — ambos
enfoques fallaron por límites reales del navegador/SO que no se pueden evitar desde el código:
Edge percent-codifica la URL al despachar el protocolo externo (rompe tildes/eñe), y un `.url`
descargado requiere un doble clic aparte (ya no es "un clic", y sigue exigiéndole al usuario un
paso extra sobre el propio Explorador de Windows). **Decisión final del usuario:** abandonar
ambos intentos y quedarse con copiar la ruta de red al portapapeles — el usuario la pega en
Ejecutar/Explorador, que si abre el archivo real sin fricción.

También se eliminó por completo la detección de "bloqueado por [usuario]"
(`platform/excel-lock-status.js`, la verificación `fs.access` + lectura del archivo `~$` de
Excel): el usuario reportó que el panel seguía mostrando bloqueo cuando no era cierto, y se
confirmó en el share real que archivos `~$` de años anteriores (2022-2025) seguían presentes sin
que nadie tuviera esos libros abiertos — el mecanismo de bloqueo de Excel no limpia ese archivo de
forma confiable si la sesión se cerró mal, así que la información era inherentemente no confiable.
Esa misma verificación (dos operaciones de I/O sobre el montaje de red en cada carga de la
pestaña) era además la causa de que el botón tardara en aparecer tras refrescar la página.
`excel-status` ahora es una respuesta local instantánea (ruta + `configured`), sin tocar la red.

## Actualización 2026-09-24 — sin montaje CIFS, solo botón (superada, ver arriba)

Al intentar el runbook de montaje CIFS (`docs/operacion/montaje-cifs-excel-mantenimiento.md`) se
encontró que **`.65` no tiene ninguna ruta de red hacia la subred `172.16.101.0/24`** donde vive
el archivo (`ping`/puerto 445 no alcanzables, `ip route` solo conoce `192.168.8.0/23`) — no es
algo que se resuelva desde `.65` ni desde esta sesión, requiere abrir la ruta/firewall entre
subredes a nivel de red, fuera de alcance aquí.

Decisión del usuario: no perseguir esa configuración de red. Se simplifica el alcance —
`MAINTENANCE_EXCEL_PATH` (ruta real, usada para leer/escribir) queda **vacía indefinidamente** en
`.65`, así que la sincronización automática Trello→Excel nunca se dispara ahí (el código ya la
omite en silencio sin esa variable, sin cambios). Se agrega `MAINTENANCE_EXCEL_DISPLAY_PATH`
(nueva, solo para mostrar/copiar la ruta en el panel — no requiere que el backend toque el
archivo) para que el botón "copiar ruta" siga sirviendo su propósito original: abrir el archivo
real a mano desde la máquina del usuario, que sí tiene acceso directo a esa red.

`excel-status` ahora distingue `accessible: null` ("no verificado, sin ruta de red") de
`accessible: false` ("se intentó y falló") — evita mostrarle al usuario un badge de error por
algo que nunca se intentó. El panel del frontend deja de mostrar cualquier badge de
disponible/bloqueado cuando no hay verificación real.

## 1. Problema / oportunidad

En "Seguridad Electrónica" → pestaña Mantenimiento, el usuario ve los cambios de Trello
reflejados casi en tiempo real, pero el archivo Excel de seguimiento
(`2026 programacion anual CCTV.xlsx`, en una carpeta de red Windows) **nunca se actualiza**.

Investigación (2026-09-23) encontró la causa real: **hay dos sistemas de Trello
completamente separados**.

- La UI que el usuario mira (`CctvModule.jsx`) lee de `cctv-automation-final`
  (`platform/import-trello-maintenance.js`, spec 0008), que sondea la API de Trello directo
  cada ~1 minuto hacia su propia base SQLite. **Nunca toca el Excel.**
- Toda la lógica de escritura a Excel (matching de puntos, recálculo de fórmulas, detección de
  archivo bloqueado) vive en un proyecto aparte, `CRM_Frontend/Table Trello/backend/`, con su
  propio Kanban que no es el que el usuario usa a diario. Ese flujo depende de un webhook de
  Trello que, según la propia documentación del proyecto, nunca se confirmó activo, y de una
  ruta de red (`\\ganepalmir\dpto.informatica\...`) que el contenedor Docker no puede alcanzar
  (sin montaje SMB).

Decisión del usuario (2026-09-23): reconstruir la sincronización a Excel **dentro de
`cctv-automation-final`** (el sistema que sí funciona y alimenta la UI real), reutilizando la
lógica de escritura ya probada de `Table Trello/backend/src/services/excel.service.js`. No se
intenta revivir el backend viejo ni su Kanban aparte.

Requerimientos nuevos del usuario:
- Botón para abrir el archivo Excel directo desde la pestaña.
- Detectar si el archivo está abierto/bloqueado por alguien, para saber cuándo pedir que lo
  cierren.

## 2. Objetivo

Cuando un ítem de checklist de Trello cambia de estado (completado ↔ pendiente) en la lista de
mantenimiento, el Excel de seguimiento se actualiza solo, dentro del mismo ciclo de ~1 minuto
que ya sincroniza la UI — sin depender de un webhook. La pestaña Mantenimiento permite ver la
ruta del archivo (con copiar-ruta) y si está bloqueado por alguien ahora mismo.

## 3. Alcance

- **`cctv-automation-final/platform/excel-maintenance-sync.js`** (nuevo): puerto funcional de
  `excel.service.js` (matching difuso de puntos, recálculo de fórmulas vía manipulación directa
  del XML del `.xlsx` con JSZip, detección de bloqueo `EBUSY`/`EPERM`), sin la clase ni el
  acoplamiento a la base SQLite de `Table Trello` — recibe `filePath` como parámetro y devuelve
  el resultado; quien lo llama decide cómo auditarlo.
- **`platform/excel-lock-status.js`** (nuevo): detecta si el archivo está abierto/bloqueado
  buscando el archivo `~$<nombre>.xlsx` que Excel crea junto al original, y extrae el nombre de
  usuario de Windows embebido en ese archivo (mejor esfuerzo; si no se puede leer, indica
  "alguien" sin bloquear la respuesta).
- **`import-trello-maintenance.js`**: al detectar que un ítem cambió de estado (ya calcula esto
  en su diff, `before.status !== item.status`) y tiene una `location_id` resuelta, llama a
  `marcarMantenimiento` con el nombre/zona canónicos de `locations` (más confiable que el
  matching por nombre crudo de Trello que usaba el sistema viejo, porque ya hay identidad
  resuelta por `siis_code`). No crítico: si falla (archivo bloqueado, ruta no montada), se
  registra en `audit_log` y el ciclo de Trello sigue sin interrumpirse; se reintenta solo en el
  siguiente ciclo (~1 min).
- **Nuevas rutas en `api/server.js`**: `GET /api/cctv/maintenance/excel-status` (¿configurado?,
  ¿bloqueado?, ¿por quién?, ruta de red para copiar) y `GET /api/cctv/maintenance/excel-history`
  (auditoría, últimas sincronizaciones vía `audit_log`).
- **`CctvModule.jsx`** (pestaña Mantenimiento): panel con la ruta de red + botón "Copiar ruta",
  y aviso claro cuando el archivo está bloqueado ("Abierto por FULANO — ciérralo para que el
  bot pueda actualizarlo").
- **Runbook de infraestructura** (`docs/operacion/`): pasos exactos para montar
  `\\ganepalmir\dpto.informatica\...` como CIFS en el Linux de `.65` y exponerlo al contenedor
  `cctv-api` — a ejecutar por el usuario (esta sesión no tiene SSH a `.65`).

## 4. No-objetivos

- **No se fuerza el cierre remoto del archivo.** Solo se detecta y se muestra quién lo tiene
  abierto; cerrarlo es una acción humana. Forzar un cierre remoto de un archivo de red puede
  corromper ediciones en curso de esa persona.
- **El botón "abrir archivo" no descarga una copia** — muestra la ruta UNC real con "copiar
  ruta", para que el usuario edite el mismo archivo en vivo, no una copia desconectada.
- No se toca ni se intenta revivir `CRM_Frontend/Table Trello/backend/` ni su webhook.
- No se migra el historial de `sincronizacion_excel` (SQLite de `Table Trello`) — se empieza un
  historial nuevo en el `audit_log` de `cctv-automation-final`.
- El montaje CIFS en `.65` no se ejecuta desde esta sesión (sin acceso SSH); se entrega como
  runbook.

## 5. Criterios de aceptación

- [x] Al marcar/desmarcar un ítem en la lista Trello de mantenimiento, dentro de ~1-2 minutos
      la celda correspondiente en el Excel cambia — **verificado en producción con datos reales**
      (ver "Actualización 2026-09-25").
- [x] `GET /api/cctv/maintenance/excel-status` responde si el archivo está configurado y su ruta
      de red. (Retirado 2026-09-25: ya no reporta bloqueo/accesibilidad — ver nota de detección de
      bloqueo poco confiable arriba.)
- [x] Pestaña Mantenimiento muestra la ruta de red con botón "copiar ruta". (Retirado 2026-09-25:
      el estado de bloqueo se quitó del panel por no ser confiable.)
- [x] Si el archivo está bloqueado o la ruta no está montada, el ciclo de importación de Trello
      no falla ni se interrumpe — solo el paso de Excel queda registrado como fallido en
      `audit_log`, reintentando en el siguiente ciclo.
- [x] `cctv-automation-final`: `npm test` en verde.
- [x] Runbook de montaje CIFS entregado, ejecutado y verificado en `.65`.

## 6. Restricciones de arquitectura y diseño

- Reutilizar la lógica de `excel.service.js` tal cual está probada (matching difuso,
  recálculo de fórmulas vía JSZip) — no reescribir desde cero.
- Reutilizar `audit_log` (tabla ya existente en `cctv-automation-final`) en vez de crear una
  tabla `sincronizacion_excel` nueva — mismo patrón que el resto del proyecto.
- La ruta del Excel es configurable por env (`MAINTENANCE_EXCEL_PATH`), nunca hardcodeada; si no
  está configurada (ej. en desarrollo local sin el montaje CIFS), la sincronización a Excel se
  omite en silencio (log una vez), sin romper el resto del pipeline de Trello.
- Seguir `CRM_Frontend/docs/design-system.md` para el panel nuevo en `CctvModule.jsx`.

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| CIFS mal configurado o sin permisos de escritura | La sincronización falla siempre, silenciosamente para el usuario final | `excel-status` expone el error real (no solo "bloqueado"), visible en la pestaña |
| Matching de punto ambiguo (dos puntos con nombre parecido en zonas distintas) | Se escribe en la celda equivocada | Se reutiliza la misma lógica de `findPoint` que ya exige coincidencia exacta por código/zona antes de aceptar coincidencias difusas; además ahora se dispone del nombre/zona **canónicos** (vía `locations`), más confiable que el nombre crudo de Trello que usaba el sistema viejo |
| Concurrencia: el ciclo de Trello escribe Excel mientras un humano lo tiene abierto | Escritura falla con `EBUSY`/`EPERM` (comportamiento esperado, no un bug) | Ya contemplado: no se reintenta a la fuerza, se reintenta en el siguiente ciclo normal |
| No se puede verificar end-to-end desde esta sesión (sin CIFS montado aquí) | Riesgo de bugs no detectados hasta desplegar | Tests unitarios exhaustivos de la lógica pura (matching, direccionamiento de celdas, período) + prueba manual contra un `.xlsx` de ejemplo con la misma estructura de hoja |

## 8. Impacto en producción

Requiere un cambio de infraestructura real en `.65` (montaje CIFS) antes de poder desplegarse
— sin eso, la sincronización a Excel queda deshabilitada (variable de entorno vacía) sin afectar
el resto del pipeline de mantenimiento, que sigue funcionando igual que hoy. Rollback: quitar
`MAINTENANCE_EXCEL_PATH` del `.env` de `.65` (la sincronización se apaga sola) o revertir el
commit — no hay cambio de esquema que revertir (`audit_log` ya existe).
