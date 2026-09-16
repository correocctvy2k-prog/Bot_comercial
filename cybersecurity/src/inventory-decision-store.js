const { DatabaseSync } = require('node:sqlite');

// cyber-inventory.db es deliberadamente de solo lectura para el servidor: /data está montado
// `:ro`, el contenedor corre con `read_only: true` (Docker), y serve-cybersecurity-api.js abre
// la base con `--immutable` (readOnly + PRAGMA query_only = ON) -- tres capas, todas
// intencionales (cap_drop: ALL, no-new-privileges, el mismo endurecimiento que ya tenía este
// servicio antes de que existieran las acciones de inventario). Promover/marcar conflicto/
// marcar protegido necesitan escribir, así que las decisiones humanas se guardan aparte, en el
// único volumen realmente escribible del contenedor (`/admin-data:rw`) -- mismo patrón ya
// probado que usa network-policy-store.js para las políticas de Subredes.
//
// Hallazgo 2026-09-16 (encontrado por el usuario probando de verdad en el navegador, 3 rondas
// de bugs distintos hasta llegar a este): todas las verificaciones anteriores de esta sesión
// se quedaban en el chequeo de autorización (403) sin sesión real, así que nunca se llegaba a
// intentar el INSERT real contra la base de solo lectura -- el 500 solo aparece con una sesión
// de superadmin real completando la petición.

function openInventoryDecisionStore(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS cyber_inventory_decisions (
      observation_id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      decision TEXT NOT NULL CHECK(decision IN ('PROMOTED', 'PROTECTED', 'CONFLICT')),
      canonical_name TEXT,
      asset_class TEXT,
      criticality TEXT,
      mac_value TEXT,
      ip_value TEXT,
      hostname_raw TEXT,
      note TEXT,
      decided_by TEXT NOT NULL,
      decided_at TEXT NOT NULL
    );
  `);
  return db;
}

function saveDecision(db, {
  observationId, assetId, decision, canonicalName, assetClass, criticality,
  macValue, ipValue, hostnameRaw, note, decidedBy, decidedAt = new Date().toISOString(),
}) {
  db.prepare(`
    INSERT INTO cyber_inventory_decisions (
      observation_id, asset_id, decision, canonical_name, asset_class, criticality,
      mac_value, ip_value, hostname_raw, note, decided_by, decided_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(observation_id) DO UPDATE SET
      asset_id = excluded.asset_id, decision = excluded.decision,
      canonical_name = excluded.canonical_name, asset_class = excluded.asset_class,
      criticality = excluded.criticality, mac_value = excluded.mac_value,
      ip_value = excluded.ip_value, hostname_raw = excluded.hostname_raw,
      note = excluded.note, decided_by = excluded.decided_by, decided_at = excluded.decided_at
  `).run(
    observationId, assetId, decision, canonicalName || null, assetClass || null, criticality || null,
    macValue || null, ipValue || null, hostnameRaw || null, note || null, decidedBy, decidedAt,
  );
  return { observationId, assetId, decision };
}

function getDecisionByObservationId(db, observationId) {
  if (!db) return null;
  return db.prepare('SELECT * FROM cyber_inventory_decisions WHERE observation_id = ?').get(observationId) || null;
}

function getDecisionByAssetId(db, assetId) {
  if (!db) return null;
  return db.prepare('SELECT * FROM cyber_inventory_decisions WHERE asset_id = ?').get(assetId) || null;
}

function listDecisions(db) {
  if (!db) return [];
  return db.prepare('SELECT * FROM cyber_inventory_decisions').all();
}

module.exports = {
  openInventoryDecisionStore,
  saveDecision,
  getDecisionByObservationId,
  getDecisionByAssetId,
  listDecisions,
};
