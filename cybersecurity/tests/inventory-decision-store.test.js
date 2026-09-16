const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const {
  openInventoryDecisionStore, saveDecision, getDecisionByObservationId, getDecisionByAssetId, listDecisions,
} = require('../src/inventory-decision-store');

function tempDbPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'decision-store-test-')), 'inventory-decisions.db');
}

test('guarda y lee los 4 tipos de decisión (PROMOTED/PROTECTED/CONFLICT/IGNORED)', () => {
  const db = openInventoryDecisionStore(':memory:');
  try {
    for (const decision of ['PROMOTED', 'PROTECTED', 'CONFLICT', 'IGNORED']) {
      const observationId = `observation-${decision}`;
      saveDecision(db, { observationId, assetId: `asset-${decision}`, decision, decidedBy: 'tester' });
      assert.equal(getDecisionByObservationId(db, observationId).decision, decision);
    }
    assert.equal(listDecisions(db).length, 4);
  } finally { db.close(); }
});

// Regresión: antes había un CHECK(decision IN ('PROMOTED','PROTECTED','CONFLICT')) en la tabla
// -- IGNORED se rechazaba a nivel de SQLite. Se movió la validación a JS (saveDecision) y se
// quitó el CHECK del esquema para que agregar tipos nuevos en el futuro no vuelva a exigir
// reconstruir la tabla.
test('rechaza un tipo de decisión inválido con un mensaje claro', () => {
  const db = openInventoryDecisionStore(':memory:');
  try {
    assert.throws(() => saveDecision(db, { observationId: 'obs-1', assetId: 'asset-1', decision: 'DELETED', decidedBy: 'tester' }), /INVALID_DECISION/);
  } finally { db.close(); }
});

test('getDecisionByAssetId encuentra la decisión por el id de activo generado', () => {
  const db = openInventoryDecisionStore(':memory:');
  try {
    saveDecision(db, { observationId: 'obs-1', assetId: 'asset-xyz', decision: 'PROMOTED', decidedBy: 'tester' });
    assert.equal(getDecisionByAssetId(db, 'asset-xyz').observation_id, 'obs-1');
  } finally { db.close(); }
});

// Regresión 2026-09-16: la base real de este mismo día ya tenía 2 filas guardadas con el
// esquema viejo (CHECK sin 'IGNORED') antes de este cambio -- una migración que las perdiera
// habría sido inaceptable. Se simula ese estado a mano (mismo CHECK que tenía el código antes)
// y se verifica que openInventoryDecisionStore reconstruye la tabla preservando las filas Y
// que después sí acepta 'IGNORED' (que el CHECK viejo habría rechazado).
test('migra una base creada con el CHECK viejo sin perder las filas existentes, y ya acepta IGNORED', () => {
  const dbPath = tempDbPath();
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE cyber_inventory_decisions (
      observation_id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      decision TEXT NOT NULL CHECK(decision IN ('PROMOTED', 'PROTECTED', 'CONFLICT')),
      canonical_name TEXT, asset_class TEXT, criticality TEXT,
      mac_value TEXT, ip_value TEXT, hostname_raw TEXT, note TEXT,
      decided_by TEXT NOT NULL, decided_at TEXT NOT NULL
    );
  `);
  legacy.prepare(`INSERT INTO cyber_inventory_decisions (
      observation_id, asset_id, decision, canonical_name, decided_by, decided_at
    ) VALUES ('obs-legacy', 'asset-legacy', 'PROMOTED', 'Servidor viejo', 'jbeltran', '2026-09-16T16:11:11.838Z')`).run();
  assert.throws(() => legacy.prepare(`INSERT INTO cyber_inventory_decisions (
      observation_id, asset_id, decision, decided_by, decided_at
    ) VALUES ('obs-x', 'asset-x', 'IGNORED', 'tester', '2026-09-16T00:00:00.000Z')`).run(), /constraint failed/, 'precondición: el CHECK viejo rechaza IGNORED');
  legacy.close();

  const migrated = openInventoryDecisionStore(dbPath);
  try {
    const preserved = getDecisionByObservationId(migrated, 'obs-legacy');
    assert.ok(preserved, 'la fila que ya existía antes de la migración debe seguir ahí');
    assert.equal(preserved.canonical_name, 'Servidor viejo');
    assert.doesNotThrow(() => saveDecision(migrated, { observationId: 'obs-new', assetId: 'asset-new', decision: 'IGNORED', decidedBy: 'tester' }));
    assert.equal(listDecisions(migrated).length, 2);
  } finally {
    migrated.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});

test('reabrir una base ya migrada (sin CHECK) es un no-op, no falla ni duplica nada', () => {
  const dbPath = tempDbPath();
  const first = openInventoryDecisionStore(dbPath);
  saveDecision(first, { observationId: 'obs-1', assetId: 'asset-1', decision: 'IGNORED', decidedBy: 'tester' });
  first.close();

  const second = openInventoryDecisionStore(dbPath);
  try {
    assert.equal(listDecisions(second).length, 1);
  } finally {
    second.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});
