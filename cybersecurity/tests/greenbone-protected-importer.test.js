const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');
const { importGreenboneProtectedResults } = require('../src/greenbone-protected-importer');

const fixture = fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'greenbone-protected-anonymized.json'), 'utf8',
);

function withDatabase(run) {
  const db = openCyberDatabase();
  try { return run(db); } finally { db.close(); }
}

test('importa el contrato protegido y genera dos casos del piloto', () => withDatabase((db) => {
  const result = importGreenboneProtectedResults({
    db, text: fixture, importedAt: '2026-08-31T21:31:00.000Z',
    custodyReference: 'restricted://greenbone/fixture',
  });
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.inserted, 5);
  assert.equal(result.remediationCases, 2);
  assert.equal(db.prepare('SELECT count(*) count FROM cyber_vulnerability_findings').get().count, 5);
  assert.equal(db.prepare('SELECT count(*) count FROM cyber_remediation_cases').get().count, 2);
  const stored = db.prepare('SELECT host_reference host, evidence_json evidence FROM cyber_vulnerability_findings LIMIT 1').get();
  assert.match(stored.host, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(stored.evidence, /10\.2\.6\.35/);
}));

test('reimportar el mismo contrato es idempotente', () => withDatabase((db) => {
  const first = importGreenboneProtectedResults({ db, text: fixture });
  const second = importGreenboneProtectedResults({ db, text: fixture });
  assert.equal(first.status, 'SUCCESS');
  assert.equal(second.status, 'ALREADY_IMPORTED');
  assert.equal(db.prepare('SELECT count(*) count FROM cyber_vulnerability_findings').get().count, 5);
}));

test('rechaza el contrato antes de crear fuente o captura', () => withDatabase((db) => {
  assert.throws(
    () => importGreenboneProtectedResults({ db, text: '{}' }),
    /INVALID_GREENBONE_PROTECTED_CONTRACT/,
  );
  assert.equal(db.prepare('SELECT count(*) count FROM cyber_source_snapshots').get().count, 0);
  assert.equal(db.prepare('SELECT count(*) count FROM cyber_source_systems').get().count, 0);
}));
