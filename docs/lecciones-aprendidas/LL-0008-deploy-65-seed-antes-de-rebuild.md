# LL-0008 — En despliegues con seed fuera del contenedor, el orden importa: sembrar antes de reconstruir

- **Fecha:** 2026-09-30
- **Módulo:** `cybersecurity/` (spec 0013), pero aplica a cualquier servicio de este
  ecosistema con un contenedor `--immutable`/`read_only` que lee una base SQLite
  sembrada por scripts corridos fuera del contenedor.
- **Spec / PR:** `specs/0013-inventario-torres-haplite-nvr/`, PR #20.

## Contexto

`cybersecurity-api` corre deliberadamente endurecido: `read_only: true`, `cap_drop:
ALL`, abre `cyber-inventory.db` en modo `--immutable` (solo lectura, ni siquiera
escribe un WAL). Los datos reales (torres, dispositivos DSS) no los siembra el
contenedor — los siembran scripts (`seed-towers.js`, `pull-dss-devices.js --apply`)
corridos a mano contra el archivo, fuera de Docker, con el usuario/proceso que sí
tiene permiso de escritura en el host.

Además, el archivo semilla real (`cybersecurity/raw/torres/torres-haplite-real-
20260918.json`, con IPs y nombres reales de la red) está gitignored a propósito —
nunca viaja por `git pull`, hay que copiarlo aparte a cada entorno.

## Qué pasó

En el deploy de la spec 0013 a `.65`, se corrió el rebuild de los contenedores
(`docker compose up -d --build cybersecurity-api crm-frontend` + `restart
crm-frontend`) **antes** de copiar el archivo semilla y correr `seed-towers.js`/
`pull-dss-devices.js --apply`. El contenedor arrancó limpio (`{"status":"READY", ...,
"mode":"read-only-immutable"}`, sin ningún error propio), pero `GET /api/
cybersecurity/towers` devolvía `500` — el frontend mostraba "API de ciberseguridad
no disponible".

El log del contenedor no tenía ninguna pista (el `READY` se imprime al abrir la
conexión, no al resolver cada query). Hubo que confirmarlo consultando la base
directamente desde el host con `sqlite3 ... ".tables"`: **`cyber_towers` y
`cyber_tower_points` no existían** — el read-model (`getTowerPoints`) fallaba al
consultar tablas que la migración automática nunca creó, porque nadie había abierto
la base en modo escritura todavía.

## Causa raíz

El contenedor abre la base en modo `immutable` — **no puede correr la
automigración** que crea las tablas/columnas nuevas (eso requiere una conexión de
escritura). Esa automigración solo ocurre cuando algo abre la base sin `immutable`,
que en este flujo es exactamente lo que hacen los scripts de seed/import corridos a
mano. Si el contenedor arranca (y por tanto abre la base) antes de que esos scripts
corran una sola vez contra el archivo real del entorno nuevo, la base sigue con el
esquema viejo — sin error visible, solo un 500 aguas abajo cuando el read-model pide
una tabla que no existe.

Separadamente: el archivo semilla gitignored tampoco estaba copiado en `.65`
todavía — un `git pull` nunca lo trae, así que cualquier intento de correr
`seed-towers.js` antes de copiarlo falla con `SEED_FILE_NOT_FOUND` (el propio
script ya valida esto y lo dice explícito, spec 0013 §0.1).

## Solución

Orden correcto, confirmado en este deploy:

1. Copiar a mano el archivo semilla real gitignored al entorno nuevo (mismo patrón
   que el resto de capturas reales del módulo).
2. Backup del `.db` real antes de escribir (`cp cyber-inventory.db
   cyber-inventory.pre-<algo>.db`).
3. Correr los scripts de seed/import **fuera del contenedor**, con escritura directa
   al archivo (`node scripts/seed-towers.js --db <archivo>`, `pull-dss-devices.js
   --db <archivo> --apply`) — esto es lo que dispara la automigración de esquema.
4. **Solo entonces** `docker compose up -d --build` / `restart` del contenedor que
   lee esa base en modo `--immutable`.

Si el orden se invierte (como pasó aquí), la corrección **no requiere volver a
reconstruir la imagen** — basta con correr el paso 3 contra el archivo real y luego
`docker compose restart <servicio>` para que la conexión `--immutable` se reabra y
vea las tablas nuevas.

## Regla nueva

Para cualquier servicio de este ecosistema con un contenedor `read_only`/
`--immutable` sembrado por scripts externos: **sembrar/migrar la base siempre antes
del build o restart del contenedor que la lee, nunca después.** Si ya se hizo en el
orden equivocado, no hace falta repetir el `--build` — un `restart` después de
sembrar es suficiente, porque el contenedor no cachea el esquema, solo la conexión
abierta.

Al escribir instrucciones de deploy para este tipo de servicio, listar el paso de
seed/import **antes** del paso de `docker compose up -d --build`, no como nota al
final.

## Enlaces

- `cybersecurity/db/open-database.js` (automigración solo corre en conexión de
  escritura)
- `cybersecurity/scripts/seed-towers.js`, `cybersecurity/scripts/pull-dss-devices.js`
- `docker-compose.yml` (servicio `cybersecurity-api`, `--immutable`, `read_only`)
- `specs/0013-inventario-torres-haplite-nvr/tasks.md` (sección "Cierre")
