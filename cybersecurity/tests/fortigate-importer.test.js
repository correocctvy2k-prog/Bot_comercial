const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');
const { cidrContains, importFortiGateInventory } = require('../src/fortigate-importer');

const fixture = fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'fortigate-anonymized.txt'),
  'utf8',
);

function withDatabase(run) {
  const db = openCyberDatabase();
  try {
    return run(db);
  } finally {
    db.close();
  }
}

test('importa una captura FortiGate en una unica transaccion sanitizada', () => withDatabase((db) => {
  const result = importFortiGateInventory({
    db,
    text: fixture,
    capturedAt: '2026-08-29T16:00:00.000Z',
    importedAt: '2026-08-29T16:05:00.000Z',
    custodyReference: 'restricted://fixture/one',
  });

  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.inserted, 2);
  assert.equal(db.prepare('SELECT count(*) AS count FROM cyber_asset_observations').get().count, 2);
  assert.equal(db.prepare('SELECT count(*) AS count FROM cyber_network_segments').get().count, 2);
  assert.equal(db.prepare('SELECT processing_status FROM cyber_source_snapshots').get().processing_status, 'SUCCESS');

  const serialized = JSON.stringify(db.prepare('SELECT * FROM cyber_asset_observations').all());
  assert.doesNotMatch(serialized, /redacted\.user/);
  assert.match(serialized, /USER_ATTRIBUTE_REDACTED/);
}));

test('reimportar el mismo contenido no duplica observaciones', () => withDatabase((db) => {
  const options = {
    db,
    text: fixture,
    capturedAt: '2026-08-29T16:00:00.000Z',
    importedAt: '2026-08-29T16:05:00.000Z',
    custodyReference: 'restricted://fixture/one',
  };
  const first = importFortiGateInventory(options);
  const second = importFortiGateInventory(options);

  assert.equal(first.status, 'SUCCESS');
  assert.equal(second.status, 'ALREADY_IMPORTED');
  assert.equal(first.snapshotId, second.snapshotId);
  assert.equal(db.prepare('SELECT count(*) AS count FROM cyber_source_snapshots').get().count, 1);
  assert.equal(db.prepare('SELECT count(*) AS count FROM cyber_asset_observations').get().count, 2);
}));

test('rechaza una captura sin fecha antes de iniciar la transaccion', () => withDatabase((db) => {
  const withoutSystemTime = fixture.replace(/^System time:.*$/m, '');
  assert.throws(
    () => importFortiGateInventory({ db, text: withoutSystemTime }),
    /capturedAt is required/,
  );
  assert.equal(db.prepare('SELECT count(*) AS count FROM cyber_source_snapshots').get().count, 0);
}));

test('asigna una IP al CIDR correspondiente sin usar solo la interfaz', () => {
  assert.equal(cidrContains('10.2.2.0/24', '10.2.2.35'), true);
  assert.equal(cidrContains('10.2.2.0/24', '10.2.3.35'), false);
  assert.equal(cidrContains('192.0.2.0/25', '192.0.2.127'), true);
  assert.equal(cidrContains('192.0.2.0/25', '192.0.2.128'), false);
});
