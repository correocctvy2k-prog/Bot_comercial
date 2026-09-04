const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');
const { importKscHardwareInventory, summarizeKscPayload } = require('../src/ksc-importer');

const fixture = fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'ksc-hardware-anonymized.json'),
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

test('resume el contrato KSC reducido sin exponer dispositivos', () => {
  const summary = summarizeKscPayload(JSON.parse(fixture));
  assert.equal(summary.capturedAt, '2026-08-29T14:00:00.000Z');
  assert.deepEqual(summary.counts, {
    devices: 2,
    virtualMachines: 1,
    withLastSeen: 2,
    withHostname: 2,
    staleOver30Days: 1,
  });
});

test('importa KSC como fuente corroborante y descarta SourcePath', () => withDatabase((db) => {
  const result = importKscHardwareInventory({
    db,
    text: fixture,
    importedAt: '2026-08-29T14:05:00.000Z',
    custodyReference: 'restricted://fixture/ksc',
  });
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.inserted, 2);
  assert.equal(db.prepare('SELECT authority_level FROM cyber_source_systems').get().authority_level, 'CORROBORATING');

  const serialized = JSON.stringify(db.prepare('SELECT * FROM cyber_asset_observations').all());
  assert.doesNotMatch(serialized, /restricted.*source\.html/i);
  assert.match(serialized, /KSC_REDUCED_CONTRACT/);
  assert.equal(db.prepare('SELECT count(*) AS count FROM cyber_assets').get().count, 0);
}));

test('la importacion KSC es idempotente por hash', () => withDatabase((db) => {
  const options = { db, text: fixture, custodyReference: 'restricted://fixture/ksc' };
  const first = importKscHardwareInventory(options);
  const second = importKscHardwareInventory(options);
  assert.equal(first.status, 'SUCCESS');
  assert.equal(second.status, 'ALREADY_IMPORTED');
  assert.equal(db.prepare('SELECT count(*) AS count FROM cyber_asset_observations').get().count, 2);
}));
