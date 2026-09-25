# LL-0006 — Carpeta duplicada anidada en `.65` hace que el deploy actualice el repo equivocado

- **Fecha:** 2026-09-25
- **Módulo:** Infra/Docs (deploy en `.65`), spec 0016 (fix de cierre)
- **Spec / PR:** `specs/0016-mantenimiento-excel-sync/`, PR #19 (`fix/0016-simplificar-solo-copiar`)

## Contexto

Tras mergear PR #19 (simplificar el botón "Abrir Excel" a solo copiar la ruta, y quitar la
detección de bloqueo poco confiable), se pidió al usuario desplegar en `.65`. El usuario reportó
"apliqué, pero aún no veo los cambios".

## Qué pasó

Verificando por HTTP directo desde esta máquina (`curl http://192.168.8.65:3003/api/cctv/maintenance/excel-status`),
la respuesta seguía trayendo los campos viejos (`accessible`, `locked`, `lockedBy`) que el PR #19
había eliminado, y el bundle del frontend en vivo seguía conteniendo el string `"Abrir Excel de
mantenimiento"` (de PR #18), no `"Copiar ruta del Excel"` (de PR #19) — es decir, `.65` seguía
sirviendo el commit `9298b04` (PR #18), aunque `origin/main` ya estaba en `7766658` (PR #19) y el
usuario decía haber corrido el deploy.

## Causa raíz

En `/home/openfire/` existen **dos carpetas anidadas con el mismo nombre**:
`~/Bot_comercial/` (la de afuera) y `~/Bot_comercial/Bot_comercial/` (la de adentro, un checkout
completo aparte del mismo repo). Confirmado por `docker inspect cctv-api` (sus bind-mounts
apuntan a rutas dentro de `~/Bot_comercial/Bot_comercial/...`): **el contenedor real se construye
desde la carpeta de adentro**, no la de afuera.

Encima, la carpeta de **afuera** tiene su `.git` con dueño `root:root` desde antes (fecha `abr 9`,
muy anterior a cualquier incidente documentado), lo que bloquea cualquier `git fetch`/`pull` ahí
con `Permiso denegado` al intentar escribir objetos nuevos en `.git/objects/pack` — el mismo
síntoma de LL-0005 (`deploy-65-git-hygiene`), pero en una ruta distinta a la que ese runbook
revisa. Si el deploy de hoy se corrió (por costumbre o por autocompletado de shell) en la carpeta
de afuera, el comando pudo fallar o no hacer nada útil, y el usuario no tenía forma fácil de
notar que estaba en el checkout equivocado — ambas carpetas se ven idénticas por fuera.

La carpeta de **adentro** (la real) no tenía ningún problema de permisos — un `git fetch
--dry-run` ahí trajo el merge limpio (`9298b04..7766658`) sin ningún error.

## Solución

Se identificó la ruta real vía `docker inspect cctv-api --format '{{range .Mounts}}...'` (de
solo lectura, sin sudo) y se le indicó al usuario correr el pull/build/restart exactamente en
`~/Bot_comercial/Bot_comercial/` (no en `~/Bot_comercial/`). Verificado end-to-end tras el
segundo intento: `excel-status` en vivo ya solo devuelve `{configured, path}`, y el bundle nuevo
(`index-DQHkMp-P.js`) ya no contiene ni `"Abrir Excel de mantenimiento"` ni `excel-shortcut`.

## Regla nueva

Antes de diagnosticar por qué un deploy "no tomó" en `.65`, **confirmar primero la ruta real**
con `docker inspect <servicio> --format '{{range .Mounts}}{{.Source}}{{println}}{{end}}'` (u
otro `docker inspect` de solo lectura) en vez de asumir `~/Bot_comercial/` a secas — puede haber
más de un checkout del mismo repo en el filesystem, y solo uno es el que los contenedores
realmente usan. Esto aplica en general a cualquier VPS con historial largo de deploys manuales,
no solo a este.

Nota aparte (no una regla, un hallazgo puntual): al listar el remote de la carpeta de adentro
apareció un token de GitHub en texto plano en la URL (`https://usuario:ghp_...@github.com/...`).
Vale la pena que el usuario evalúe rotarlo, aunque quede fuera del alcance de esta lección.

## Enlaces

- `specs/0016-mantenimiento-excel-sync/spec.md` (Actualización 2026-09-25)
- `docs/lecciones-aprendidas/LL-0005-dos-integraciones-trello-desconectadas.md` (el otro LL-0005,
  de contenido no relacionado — ver nota de colisión de numeración en memoria del proyecto: hay
  ramas sin PR abierto que también reclaman "LL-0005"/"LL-0006"/"LL-0007" para otros temas)
- PR #19 (`fix/0016-simplificar-solo-copiar`)
