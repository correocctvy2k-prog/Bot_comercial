const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');
const { cidrContains, importFortiGateInventory, sha256 } = require('../src/fortigate-importer');

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

// Regresión 2026-09-15: al reimportar días después (snapshot distinto, mismas CIDR), el id de
// segmento se calculaba SIEMPRE por CIDR sin mirar si ya existía una fila para esa misma CIDR
// (con otro id, de una importación anterior) -- cidr_fingerprint es UNIQUE, así que el INSERT
// de la fila "nueva" violaba la restricción y la reimportación completa fallaba. Además, aunque
// no hubiera fallado, el id de la red habría cambiado en cada reimport, dejando huérfana
// cualquier política/observación ya vinculada a esa CIDR (ver
// scripts/reconcile-segment-policies.js, mismo síntoma encontrado primero en Subredes).
test('reimportar días después reutiliza el id de segmento ya existente para la misma CIDR', () => withDatabase((db) => {
  const legacySegmentId = 'segment-legacy-vlan-workstations';
  db.prepare(`
    INSERT INTO cyber_network_segments (id, canonical_name, cidr_fingerprint, security_zone, created_at, updated_at)
    VALUES (?, 'VLAN-Workstations (nombre asignado a mano)', ?, 'UNCLASSIFIED', ?, ?)
  `).run(legacySegmentId, sha256('192.0.2.0/25'), '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');

  const laterCapture = fixture.replace('System time: Sat Aug 29 11:00:00 2026', 'System time: Mon Sep 15 09:00:00 2026');
  const result = importFortiGateInventory({
    db, text: laterCapture,
    capturedAt: '2026-09-15T14:00:00.000Z', importedAt: '2026-09-15T14:05:00.000Z',
    custodyReference: 'restricted://fixture/later',
  });

  assert.equal(result.status, 'SUCCESS');
  const segments = db.prepare('SELECT id FROM cyber_network_segments WHERE cidr_fingerprint = ?').all(sha256('192.0.2.0/25'));
  assert.equal(segments.length, 1, 'no debe crear una segunda fila para la misma CIDR');
  assert.equal(segments[0].id, legacySegmentId, 'debe reutilizar el id ya existente, no calcular uno nuevo por CIDR');

  const observation = db.prepare('SELECT segment_id FROM cyber_asset_observations WHERE snapshot_id = ? AND ip_value = ?').get(result.snapshotId, '192.0.2.10');
  assert.equal(observation.segment_id, legacySegmentId);
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
