const { openCyberDatabase } = require('../db/open-database');

const expectedTables = [
  'cyber_asset_identifiers',
  'cyber_asset_observations',
  'cyber_assets',
  'cyber_identity_reviews',
  'cyber_lifecycle_assessments',
  'cyber_network_segments',
  'cyber_remediation_case_findings',
  'cyber_remediation_cases',
  'cyber_scan_authorizations',
  'cyber_source_snapshots',
  'cyber_source_systems',
  'cyber_vulnerability_findings',
];

const db = openCyberDatabase();

try {
  const integrity = db.prepare('PRAGMA integrity_check').get();
  const foreignKeys = db.prepare('PRAGMA foreign_keys').get();
  const tables = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name),
  );
  const missing = expectedTables.filter((name) => !tables.has(name));

  if (integrity.integrity_check !== 'ok') {
    throw new Error(`integrity_check failed: ${integrity.integrity_check}`);
  }
  if (foreignKeys.foreign_keys !== 1) {
    throw new Error('foreign_keys is not enabled');
  }
  if (missing.length > 0) {
    throw new Error(`missing tables: ${missing.join(', ')}`);
  }

  console.log(`Schema OK: ${tables.size} tables, foreign keys enabled, integrity ok.`);
} finally {
  db.close();
}
