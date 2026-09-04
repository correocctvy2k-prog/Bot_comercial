const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');
const { importFortiGateInventory } = require('../src/fortigate-importer');
const { analyzeSnapshot, classifyObservation } = require('../src/inventory-analyzer');

const fixture = fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'fortigate-anonymized.txt'),
  'utf8',
);

function withImportedDatabase(run) {
  const db = openCyberDatabase();
  try {
    const imported = importFortiGateInventory({
      db,
      text: fixture,
      capturedAt: '2026-08-29T16:00:00.000Z',
      importedAt: '2026-08-29T16:05:00.000Z',
      custodyReference: 'restricted://fixture/analysis',
    });
    return run(db, imported.snapshotId);
  } finally {
    db.close();
  }
}

test('clasifica solo de forma provisional usando evidencia tecnica', () => {
  assert.equal(classifyObservation({ device_class_raw: 'Server', os_family: 'Linux' }), 'SERVER');
  assert.equal(classifyObservation({ device_class_raw: 'Phone', os_family: 'Android' }), 'MOBILE');
  assert.equal(classifyObservation({ device_class_raw: 'Router', os_family: 'RouterOS' }), 'NETWORK');
  assert.equal(classifyObservation({ device_class_raw: null, os_family: null }), 'OTHER');
});

test('analiza staging sin promover activos ni autorizar escaneos', () => withImportedDatabase((db, snapshotId) => {
  const result = analyzeSnapshot({
    db,
    snapshotId,
    analyzedAt: '2026-08-29T16:10:00.000Z',
  });

  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.byIdentityStrength.MEDIUM, 1);
  assert.equal(result.summary.byIdentityStrength.LOW, 1);
  assert.equal(result.summary.byAction.NEW_ASSET_REVIEW, 1);
  assert.equal(result.summary.byAction.EPHEMERAL_REVIEW, 1);
  assert.equal(db.prepare('SELECT count(*) AS count FROM cyber_assets').get().count, 0);
  assert.equal(db.prepare('SELECT count(*) AS count FROM cyber_scan_authorizations').get().count, 0);
}));

test('repetir la misma politica de analisis es idempotente', () => withImportedDatabase((db, snapshotId) => {
  const first = analyzeSnapshot({ db, snapshotId });
  const second = analyzeSnapshot({ db, snapshotId });
  assert.equal(first.status, 'SUCCESS');
  assert.equal(second.status, 'ALREADY_ANALYZED');
  assert.equal(first.analysisRunId, second.analysisRunId);
  assert.equal(db.prepare('SELECT count(*) AS count FROM cyber_inventory_analysis_runs').get().count, 1);
  assert.equal(db.prepare('SELECT count(*) AS count FROM cyber_inventory_analysis_items').get().count, 2);
}));

test('marca conflictos cuando una IP aparece en dos observaciones de la misma captura', () => withImportedDatabase((db, snapshotId) => {
  db.exec('DROP TRIGGER cyber_observations_no_update');
  db.prepare(`
    UPDATE cyber_asset_observations
    SET ip_value = 'duplicate-token'
    WHERE snapshot_id = ?
  `).run(snapshotId);

  const result = analyzeSnapshot({ db, snapshotId, policyVersion: 'test-duplicate-ip-v1' });
  assert.equal(result.summary.byAction.CONFLICT_REVIEW, 2);
  assert.equal(result.summary.reasonCounts.DUPLICATE_IP_IN_SNAPSHOT, 2);
}));
