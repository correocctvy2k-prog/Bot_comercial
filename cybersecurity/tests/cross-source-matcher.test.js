const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');
const { importFortiGateInventory } = require('../src/fortigate-importer');
const { importKscHardwareInventory } = require('../src/ksc-importer');
const { matchSnapshots } = require('../src/cross-source-matcher');

const fortiFixture = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'fortigate-anonymized.txt'), 'utf8');
const kscFixture = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'ksc-hardware-anonymized.json'), 'utf8');

function withSnapshots(run) {
  const db = openCyberDatabase();
  try {
    const forti = importFortiGateInventory({
      db, text: fortiFixture, capturedAt: '2026-08-29T16:00:00Z', custodyReference: 'restricted://forti',
    });
    const ksc = importKscHardwareInventory({ db, text: kscFixture, custodyReference: 'restricted://ksc' });
    return run(db, forti.snapshotId, ksc.snapshotId);
  } finally {
    db.close();
  }
}

test('propone solo hostname exacto y conserva observaciones separadas', () => withSnapshots((db, fortiId, kscId) => {
  const result = matchSnapshots({ db, leftSnapshotId: fortiId, rightSnapshotId: kscId });
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.summary.proposed, 1);
  assert.equal(result.summary.rightWithoutHostnameMatch, 1);
  assert.equal(db.prepare('SELECT count(*) AS count FROM cyber_cross_source_matches').get().count, 1);
  assert.equal(db.prepare('SELECT count(*) AS count FROM cyber_assets').get().count, 0);
}));

test('el cruce de la misma politica es idempotente', () => withSnapshots((db, fortiId, kscId) => {
  const first = matchSnapshots({ db, leftSnapshotId: fortiId, rightSnapshotId: kscId });
  const second = matchSnapshots({ db, leftSnapshotId: fortiId, rightSnapshotId: kscId });
  assert.equal(first.status, 'SUCCESS');
  assert.equal(second.status, 'ALREADY_MATCHED');
  assert.equal(first.matchRunId, second.matchRunId);
}));
