const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/verify-inventory.js <database>');
  process.exitCode = 2;
} else {
  const db = openCyberDatabase(path.resolve(input));
  try {
    const integrity = db.prepare('PRAGMA integrity_check').get().integrity_check;
    const foreignKeyViolations = db.prepare('PRAGMA foreign_key_check').all().length;
    const snapshot = db.prepare(`
      SELECT processing_status AS status, received_count AS received,
             accepted_count AS accepted, rejected_count AS rejected
      FROM cyber_source_snapshots
      ORDER BY imported_at DESC LIMIT 1
    `).get();
    const observations = db.prepare('SELECT count(*) AS count FROM cyber_asset_observations').get().count;
    const segments = db.prepare('SELECT count(*) AS count FROM cyber_network_segments').get().count;
    const assets = db.prepare('SELECT count(*) AS count FROM cyber_assets').get().count;
    const authorizations = db.prepare('SELECT count(*) AS count FROM cyber_scan_authorizations').get().count;
    const userFlags = db.prepare(`
      SELECT count(*) AS count
      FROM cyber_asset_observations
      WHERE quality_flags_json LIKE '%USER_ATTRIBUTE_REDACTED%'
    `).get().count;

    if (integrity !== 'ok') throw new Error(`integrity_check failed: ${integrity}`);
    if (foreignKeyViolations !== 0) throw new Error(`foreign key violations: ${foreignKeyViolations}`);
    if (!snapshot || snapshot.status !== 'SUCCESS' || snapshot.received !== snapshot.accepted) {
      throw new Error('latest snapshot is incomplete');
    }
    if (assets !== 0 || authorizations !== 0) {
      throw new Error('staging verification found canonical assets or scan authorizations');
    }

    console.log(JSON.stringify({
      integrity,
      foreignKeyViolations,
      snapshot,
      observations,
      segments,
      userAttributesRedacted: userFlags,
      canonicalAssets: assets,
      scanAuthorizations: authorizations,
    }, null, 2));
  } finally {
    db.close();
  }
}
