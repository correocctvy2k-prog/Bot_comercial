# LL-0007 — `ALTER TABLE ... RENAME TO` en SQLite reescribe las FK de las tablas hijas

- **Fecha:** 2026-09-18
- **Módulo:** `cybersecurity/` (spec 0013, pero aplica a cualquier servicio de este
  ecosistema que use `node:sqlite`/`better-sqlite3` con FOREIGN KEY)
- **Spec / PR:** `specs/0013-inventario-torres-haplite-nvr/`

## Contexto

Al agregar la fuente `DSS` a `cyber_source_systems.source_type`, hacía falta ampliar un
`CHECK(source_type IN (...))` ya existente. SQLite no soporta `ALTER` de un `CHECK`
constraint — la única forma es recrear la tabla. `cyber_source_systems` es referenciada
por FK desde `cyber_source_snapshots(source_system_id)`.

## Qué pasó

Primer intento de migración (en `db/open-database.js`, corrido dentro de
`openCyberDatabase()` para automigrar cualquier base ya existente al abrirla):

1. `ALTER TABLE cyber_source_systems RENAME TO cyber_source_systems_pre_dss_migration`
2. Dejar que `schema.sql` (`CREATE TABLE IF NOT EXISTS`) creara `cyber_source_systems`
   fresca, con el `CHECK` correcto.
3. Copiar los datos de la tabla de respaldo a la nueva.
4. `DROP TABLE cyber_source_systems_pre_dss_migration`.

No lanzó ningún error en ningún paso. Al correr el importador de DSS contra la base
real por primera vez después de esta migración, falló con `FOREIGN KEY constraint
failed` en un `INSERT` a `cyber_source_snapshots` — una tabla que la migración nunca
tocó directamente.

## Causa raíz

**`ALTER TABLE ... RENAME TO` en SQLite reescribe automáticamente las cláusulas
`FOREIGN KEY ... REFERENCES` de cualquier otra tabla que apunte a la tabla renombrada,
para que sigan apuntando al nuevo nombre.** El paso 1 de arriba, sin que nada lo
avisara, dejó la definición de `cyber_source_snapshots` diciendo literalmente
`REFERENCES cyber_source_systems_pre_dss_migration(id)` en vez de
`REFERENCES cyber_source_systems(id)`. Cuando el paso 4 borró esa tabla de respaldo,
`cyber_source_snapshots` quedó con una FK apuntando a una tabla que ya no existe —
silenciosamente, hasta el primer INSERT real.

`PRAGMA foreign_key_check` contra la base ya migrada lo confirmó de inmediato
(`parent: 'cyber_source_systems_pre_dss_migration'`) — no hacía falta adivinar.

## Solución

Nunca renombrar la tabla **original** que otras tablas referencian. En vez de eso:

1. Crear la tabla con el esquema nuevo bajo un **nombre temporal** (nada la referencia
   todavía, no hay ninguna FK que SQLite pueda reescribir).
2. Copiar los datos de la tabla original a la temporal.
3. `DROP TABLE` de la original (con `PRAGMA foreign_keys = OFF`, para que el DROP no
   falle por la FK de la tabla hija).
4. `ALTER TABLE <temporal> RENAME TO <nombre original>` — como la tabla hija nunca dejó
   de decir literalmente `REFERENCES <nombre original>(id)`, en cuanto una tabla con
   ese nombre exacto vuelve a existir, la referencia resuelve sola sin tocar la tabla
   hija en absoluto.

Verificado con `PRAGMA foreign_key_check` (debe devolver `[]`) después de la migración,
no solo con la ausencia de una excepción — la primera versión tampoco lanzaba error.

## Regla nueva

Cualquier migración de un `CHECK`/esquema de una tabla que otras tablas referencian por
FK, en cualquier servicio de este ecosistema con SQLite: **crear la tabla nueva bajo un
nombre temporal y renombrarla al final al nombre original — nunca renombrar la tabla
original como paso intermedio.** Verificar siempre con `PRAGMA foreign_key_check`
después, no solo confiar en que no haya lanzado una excepción — este bug en particular
no lanzaba ninguna hasta el primer INSERT real, mucho después de la migración.

Implementado en `cybersecurity/db/open-database.js`
(`migrateSourceSystemsCheckConstraint`), con test de regresión que replica el escenario
exacto (tabla hija con una fila real referenciando la tabla migrada, verificando
`PRAGMA foreign_key_check` vacío después) en
`cybersecurity/tests/open-database-migration.test.js`.

## Enlaces

- `cybersecurity/db/open-database.js`
- `cybersecurity/tests/open-database-migration.test.js`
- `specs/0013-inventario-torres-haplite-nvr/`
