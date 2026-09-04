const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');
const { importKscProtectedInventory } = require('../src/ksc-protected-importer');

const fixture = fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'ksc-protected-anonymized.json'),
  'utf8',
);

function withDatabase(run) {
  const db = openCyberDatabase();
  try { return run(db); } finally { db.close(); }
}

test('importa fingerprints KSC protegidos solo a staging', () => withDatabase((db) => {
  const result = importKscProtectedInventory({
    db,
    text: fixture,
    importedAt: '2026-08-29T16:05:00.000Z',
    custodyReference: 'restricted://ksc/fixture',
  });
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.inserted, 1);
  assert.equal(db.prepare('SELECT count(*) AS count FROM cyber_assets').get().count, 0);

  const observation = db.prepare(`
    SELECT hostname_raw, mac_value, sanitized_attributes_json AS attributes
    FROM cyber_asset_observations
  `).get();
  assert.equal(observation.hostname_raw, null);
  assert.equal(observation.mac_value, null);
  assert.match(observation.attributes, /hostnameFingerprint/);
  assert.doesNotMatch(observation.attributes, /example-host|00[:-]11/i);
}));

test('reimportar el mismo archivo protegido es idempotente', () => withDatabase((db) => {
  const first = importKscProtectedInventory({ db, text: fixture });
  const second = importKscProtectedInventory({ db, text: fixture });
  assert.equal(first.status, 'SUCCESS');
  assert.equal(second.status, 'ALREADY_IMPORTED');
  assert.equal(db.prepare('SELECT count(*) AS count FROM cyber_asset_observations').get().count, 1);
}));

test('rechaza el contrato antes de abrir una transaccion', () => withDatabase((db) => {
  const invalid = JSON.stringify({ SchemaVersion: 1, SourceSystem: 'KSC_HARDWARE_PROTECTED' });
  assert.throws(
    () => importKscProtectedInventory({ db, text: invalid }),
    /INVALID_KSC_PROTECTED_CONTRACT/,
  );
  assert.equal(db.prepare('SELECT count(*) AS count FROM cyber_source_snapshots').get().count, 0);
}));
