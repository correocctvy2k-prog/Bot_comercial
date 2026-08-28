const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');
const dbPath = path.resolve(process.env.CCTV_DB || path.join(root, 'data', 'cctv-staging.db'));
const reportPath = path.join(root, 'reports', 'crm-points-reconciliation-latest.json');

if (!fs.existsSync(reportPath)) {
  throw new Error('Ejecute primero npm run reconcile:crm-points -- <ruta CRM_Frontend>');
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const safeLinks = report.rows.filter(row =>
  row.decision === 'AUTO_LINKABLE' &&
  row.canonicalLocationId &&
  ['SIIS_EXACT', 'SIIS_SHARED_DOUBLE_LOCATION'].includes(row.method)
);

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys=ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS crm_point_links (
    id TEXT PRIMARY KEY,
    location_id TEXT NOT NULL,
    crm_point_id TEXT NOT NULL UNIQUE,
    siis_code TEXT,
    operational_node_name TEXT NOT NULL,
    relation_type TEXT NOT NULL CHECK(relation_type IN ('PRIMARY','SHARED_DOUBLE')),
    match_method TEXT NOT NULL,
    confidence REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE','HELD')),
    source_reference TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(location_id) REFERENCES locations(id)
  );

  CREATE INDEX IF NOT EXISTS idx_crm_point_links_location ON crm_point_links(location_id);
  CREATE INDEX IF NOT EXISTS idx_crm_point_links_siis ON crm_point_links(siis_code);

  CREATE TABLE IF NOT EXISTS cctv_installations (
    id TEXT PRIMARY KEY,
    location_id TEXT NOT NULL,
    solution_type TEXT NOT NULL CHECK(solution_type IN ('STANDALONE_CAMERA','NVR_KIT','DVR_KIT','MVR','ANPR','ALARM','MIXED')),
    provenance TEXT NOT NULL CHECK(provenance IN ('NEW','REUSED','MIXED')),
    installed_at TEXT,
    technician TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACTIVE','RETIRED','CANCELLED')),
    source_system TEXT NOT NULL DEFAULT 'MANUAL',
    idempotency_key TEXT NOT NULL UNIQUE,
    notes TEXT,
    evidence_json TEXT NOT NULL DEFAULT '[]',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(location_id) REFERENCES locations(id)
  );

  CREATE INDEX IF NOT EXISTS idx_installations_location ON cctv_installations(location_id);
  CREATE INDEX IF NOT EXISTS idx_installations_status ON cctv_installations(status);

  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    source_system TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT,
    correlation_id TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type,entity_id);
  CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(occurred_at);
`);

const now = new Date().toISOString();
const sourceReference = path.relative(root, reportPath).replaceAll('\\', '/');
const upsert = db.prepare(`
  INSERT INTO crm_point_links (
    id,location_id,crm_point_id,siis_code,operational_node_name,relation_type,
    match_method,confidence,status,source_reference,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(crm_point_id) DO UPDATE SET
    location_id=excluded.location_id,
    siis_code=excluded.siis_code,
    operational_node_name=excluded.operational_node_name,
    relation_type=excluded.relation_type,
    match_method=excluded.match_method,
    confidence=excluded.confidence,
    status=excluded.status,
    source_reference=excluded.source_reference,
    updated_at=excluded.updated_at
`);

db.exec('BEGIN IMMEDIATE');
try {
  for (const row of safeLinks) {
    upsert.run(
      crypto.randomUUID(), row.canonicalLocationId, row.crmPointId, row.siisCode,
      row.crmName, row.method === 'SIIS_SHARED_DOUBLE_LOCATION' ? 'SHARED_DOUBLE' : 'PRIMARY',
      row.method, row.confidence, 'ACTIVE', sourceReference, now, now
    );
  }
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

const summary = {
  generatedAt: now,
  safeLinksInReport: safeLinks.length,
  linksStored: db.prepare('SELECT COUNT(*) total FROM crm_point_links').get().total,
  physicalLocationsLinked: db.prepare('SELECT COUNT(DISTINCT location_id) total FROM crm_point_links WHERE status=?').get('ACTIVE').total,
  sharedDoubleNodes: db.prepare("SELECT COUNT(*) total FROM crm_point_links WHERE relation_type='SHARED_DOUBLE'").get().total,
  installations: db.prepare('SELECT COUNT(*) total FROM cctv_installations').get().total,
};
console.log(JSON.stringify(summary, null, 2));
