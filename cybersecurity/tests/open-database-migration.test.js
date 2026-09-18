const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { openCyberDatabase } = require('../db/open-database');

// Regresión 2026-09-18: una base ya existente (creada antes de spec 0013, incluida
// `.65` en producción) tiene cyber_source_systems con CHECK(source_type IN (...)) sin
// 'DSS' -- SQLite no soporta ALTER de un CHECK existente. Sin esta migración, el
// primer intento de importar la fuente DSS falla con CHECK constraint failed en
// cualquier base creada antes de este cambio.
function createLegacyDatabase(filePath) {
  const db = new DatabaseSync(filePath);
  db.exec(`
    CREATE TABLE cyber_source_systems (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL CHECK(source_type IN (
        'FORTIGATE', 'KASPERSKY', 'ACTIVE_DIRECTORY', 'GREENBONE', 'MANUAL', 'OTHER'
      )),
      display_name TEXT NOT NULL,
      authority_level TEXT NOT NULL CHECK(authority_level IN ('AUTHORITATIVE', 'CORROBORATING', 'OBSERVATIONAL')),
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.prepare(`INSERT INTO cyber_source_systems(id, source_type, display_name, authority_level, created_at, updated_at)
    VALUES ('source-forti', 'FORTIGATE', 'Firewall inventory', 'OBSERVATIONAL', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`).run();
  // Tabla hija real con FK a cyber_source_systems -- el bug real (2026-09-18) solo se
  // vio con una fila aquí: un primer intento de migración (renombrar la tabla vieja en
  // vez de crear la nueva bajo un nombre temporal) dejaba esta FK apuntando a la tabla
  // de respaldo, que luego se borraba -- sin esta fila el bug pasaba desapercibido.
  db.exec(`
    CREATE TABLE cyber_source_snapshots (
      id TEXT PRIMARY KEY,
      source_system_id TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      FOREIGN KEY(source_system_id) REFERENCES cyber_source_systems(id)
    );
  `);
  db.prepare(`INSERT INTO cyber_source_snapshots(id, source_system_id, captured_at) VALUES ('snap-1', 'source-forti', '2026-01-01T00:00:00Z')`).run();
  db.close();
}

test('una base creada antes de spec 0013 se automigra: DSS pasa a ser un source_type válido, sin perder datos', () => {
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-migration-')), 'legacy.db');
  createLegacyDatabase(filePath);

  const db = openCyberDatabase(filePath);
  try {
    // el CHECK viejo ya no aplica -- insertar una fuente DSS debe funcionar
    assert.doesNotThrow(() => {
      db.prepare(`INSERT INTO cyber_source_systems(id, source_type, display_name, authority_level, created_at, updated_at)
        VALUES ('source-dss', 'DSS', 'DSS Professional', 'CORROBORATING', '2026-09-18T00:00:00Z', '2026-09-18T00:00:00Z')`).run();
    });

    // la fuente FortiGate que ya existía antes de migrar se conserva intacta
    const forti = db.prepare('SELECT display_name AS displayName, authority_level AS authorityLevel FROM cyber_source_systems WHERE id = ?').get('source-forti');
    assert.equal(forti.displayName, 'Firewall inventory');
    assert.equal(forti.authorityLevel, 'OBSERVATIONAL');

    assert.equal(db.prepare('SELECT count(*) AS c FROM cyber_source_systems').get().c, 2);

    // el hallazgo real 2026-09-18: un primer intento de migración dejaba esta FK
    // apuntando a una tabla de respaldo que luego se borraba -- se verifica con la
    // misma pragma que expuso el bug, no solo con "no lanzó error"
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    const snapshot = db.prepare('SELECT source_system_id AS sourceSystemId FROM cyber_source_snapshots WHERE id = ?').get('snap-1');
    assert.equal(snapshot.sourceSystemId, 'source-forti');

    // ninguna tabla temporal de la migración debe quedar colgando
    const leftoverTables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%dss_migration%'").all();
    assert.deepEqual(leftoverTables, []);
  } finally {
    db.close();
  }
});

test('abrir la misma base migrada una segunda vez no repite la migración ni duplica datos', () => {
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cyber-migration-')), 'legacy.db');
  createLegacyDatabase(filePath);

  openCyberDatabase(filePath).close();
  const db = openCyberDatabase(filePath);
  try {
    assert.equal(db.prepare('SELECT count(*) AS c FROM cyber_source_systems').get().c, 1);
  } finally {
    db.close();
  }
});

test('una base nueva (sin cyber_source_systems previo) no dispara la migración', () => {
  const db = openCyberDatabase();
  try {
    assert.doesNotThrow(() => {
      db.prepare(`INSERT INTO cyber_source_systems(id, source_type, display_name, authority_level, created_at, updated_at)
        VALUES ('source-dss', 'DSS', 'DSS Professional', 'CORROBORATING', '2026-09-18T00:00:00Z', '2026-09-18T00:00:00Z')`).run();
    });
  } finally {
    db.close();
  }
});
