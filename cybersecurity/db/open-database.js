const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const schemaPath = path.join(__dirname, 'schema.sql');
const NEW_SHAPE_TABLE = 'cyber_source_systems_dss_migration_new';

// cyber_source_systems.source_type tiene un CHECK(source_type IN (...)) -- una base ya
// existente (local o `.65`) creada antes de spec 0013 no tiene 'DSS' en esa lista, y
// SQLite no soporta ALTER de un CHECK existente.
//
// Hallazgo real (2026-09-18, probado contra la base local): un primer intento
// "renombrar la tabla vieja, dejar que schema.sql cree la nueva, copiar datos, borrar
// la vieja" parece razonable pero ES INCORRECTO -- `ALTER TABLE ... RENAME TO` en
// SQLite reescribe automáticamente las cláusulas FOREIGN KEY de las tablas hijas para
// apuntar al nuevo nombre (`cyber_source_snapshots.source_system_id` terminaba
// referenciando la tabla de respaldo renombrada, no la tabla nueva) -- dejaba
// `cyber_source_snapshots` con FK apuntando a una tabla que luego se borraba.
// Verificado con `PRAGMA foreign_key_check` antes de conformarse con "no lanzó error".
//
// Fix: nunca renombrar la tabla ORIGINAL. Se crea la tabla con el CHECK correcto bajo
// un nombre temporal (nada la referencia todavía, no hay nada que reescribir), se
// copian los datos, se borra la original (con foreign_keys=OFF, sin que SQLite intente
// reescribir nada), y se renombra la temporal a 'cyber_source_systems' -- como
// `cyber_source_snapshots.source_system_id` nunca dejó de decir literalmente
// `REFERENCES cyber_source_systems(id)`, al reaparecer una tabla con ese nombre exacto
// la referencia vuelve a resolver sola, sin necesidad de tocar la tabla hija.
// Cada nuevo source_type agregado al CHECK (DSS en spec 0013 fase 1, CCTV_STAGING en
// el incremento de firmware) reusa esta misma migración -- una base creada antes de
// cualquiera de los dos no tiene esa cadena literal en el SQL de la tabla.
const REQUIRED_SOURCE_TYPES = ["'DSS'", "'CCTV_STAGING'"];

function needsSourceSystemsMigration(db) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'cyber_source_systems'").get();
  return Boolean(row) && REQUIRED_SOURCE_TYPES.some((needle) => !row.sql.includes(needle));
}

function migrateSourceSystemsCheckConstraint(db) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`
      CREATE TABLE ${NEW_SHAPE_TABLE} (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL CHECK(source_type IN (
          'FORTIGATE', 'KASPERSKY', 'ACTIVE_DIRECTORY', 'GREENBONE', 'DSS', 'CCTV_STAGING', 'MANUAL', 'OTHER'
        )),
        display_name TEXT NOT NULL,
        authority_level TEXT NOT NULL CHECK(authority_level IN ('AUTHORITATIVE', 'CORROBORATING', 'OBSERVATIONAL')),
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.exec(`
      INSERT INTO ${NEW_SHAPE_TABLE}(id, source_type, display_name, authority_level, active, created_at, updated_at)
      SELECT id, source_type, display_name, authority_level, active, created_at, updated_at
      FROM cyber_source_systems
    `);
    db.exec('DROP TABLE cyber_source_systems');
    db.exec(`ALTER TABLE ${NEW_SHAPE_TABLE} RENAME TO cyber_source_systems`);
    const violations = db.prepare('PRAGMA foreign_key_check').all();
    if (violations.length > 0) throw new Error(`DSS migration left ${violations.length} dangling foreign key(s)`);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

function openCyberDatabase(databasePath = ':memory:', options = {}) {
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`PRAGMA busy_timeout = ${Number(options.busyTimeoutMs || 5000)}`);

  if (databasePath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
  }

  if (options.applySchema !== false) {
    if (needsSourceSystemsMigration(db)) migrateSourceSystemsCheckConstraint(db);
    db.exec(fs.readFileSync(schemaPath, 'utf8'));
  }

  return db;
}

module.exports = {
  openCyberDatabase,
  schemaPath,
};
