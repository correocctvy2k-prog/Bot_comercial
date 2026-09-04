const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');
const { matchSnapshots } = require('../src/cross-source-matcher');

const database = process.argv[2];
if (!database) {
  console.error('Usage: node scripts/match-fortigate-ksc.js <database>');
  process.exitCode = 2;
} else {
  const db = openCyberDatabase(path.resolve(database));
  try {
    const fortigate = db.prepare(`
      SELECT s.id FROM cyber_source_snapshots s
      JOIN cyber_source_systems source ON source.id = s.source_system_id
      WHERE source.source_type = 'FORTIGATE' AND s.processing_status = 'SUCCESS'
      ORDER BY s.captured_at DESC LIMIT 1
    `).get();
    const ksc = db.prepare(`
      SELECT s.id FROM cyber_source_snapshots s
      JOIN cyber_source_systems source ON source.id = s.source_system_id
      WHERE source.source_type = 'KASPERSKY' AND s.processing_status = 'SUCCESS'
      ORDER BY s.captured_at DESC LIMIT 1
    `).get();
    if (!fortigate || !ksc) throw new Error('successful FortiGate and Kaspersky snapshots are required');
    console.log(JSON.stringify(matchSnapshots({
      db,
      leftSnapshotId: fortigate.id,
      rightSnapshotId: ksc.id,
    }), null, 2));
  } finally {
    db.close();
  }
}
