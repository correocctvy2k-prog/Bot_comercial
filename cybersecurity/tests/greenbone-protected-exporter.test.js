const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');
const { receiveGreenboneProtectedOnce } = require('../src/greenbone-protected-receiver');
const {
  buildGreenboneProtectedExport,
  sanitizeEvidence,
  writeProtectedExportAtomic,
} = require('../src/greenbone-protected-exporter');

const model = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'greenbone-read-model-anonymized.json'), 'utf8',
));
const options = {
  identityKey: Buffer.from('0123456789abcdef0123456789abcdef'),
  identityKeyVersion: 'test-key-1',
};

test('genera fingerprints deterministas sin publicar la identidad del objetivo', () => {
  const first = buildGreenboneProtectedExport(model, options);
  const second = buildGreenboneProtectedExport(model, options);
  assert.deepEqual(first, second);
  assert.equal(first.ResultCount, 3);
  assert.match(first.ReportFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(new Set(first.Results.map((item) => item.TargetFingerprint)).size, 1);
  const serialized = JSON.stringify(first);
  assert.doesNotMatch(serialized, /10\.2\.6\.35|10\.2\.6\.30|raw-result/);
  assert.match(serialized, /TARGET_REDACTED|IP_REDACTED/);
});

test('sanitiza IP, MAC, IPv6, controles y limita evidencia', () => {
  const unsafe = `host 192.0.2.10 mac 00:11:22:33:44:55 ipv6 2001:db8::1\u0000 ${'x'.repeat(9000)}`;
  const safe = sanitizeEvidence(unsafe, '192.0.2.10');
  assert.doesNotMatch(safe, /192\.0\.2\.10|00:11:22:33:44:55|2001:db8::1|\u0000/);
  assert.ok(safe.length <= 8192);
});

test('exige reporte terminado, autorización y clave robusta', () => {
  assert.throws(
    () => buildGreenboneProtectedExport({ ...model, ReportStatus: 'RUNNING' }, options),
    /INVALID_GREENBONE_READ_MODEL/,
  );
  assert.throws(
    () => buildGreenboneProtectedExport({ ...model, AuthorizationReference: '' }, options),
    /INVALID_GREENBONE_READ_MODEL/,
  );
  assert.throws(
    () => buildGreenboneProtectedExport(model, { ...options, identityKey: 'short' }),
    /IDENTITY_KEY_TOO_SHORT/,
  );
});

test('la escritura es atómica e idempotente y no sobrescribe conflictos', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'greenbone-export-'));
  try {
    const payload = buildGreenboneProtectedExport(model, options);
    const first = writeProtectedExportAtomic(payload, root);
    const second = writeProtectedExportAtomic(payload, root);
    assert.equal(first.status, 'EXPORTED');
    assert.equal(second.status, 'ALREADY_EXPORTED');
    assert.equal(fs.readdirSync(root).filter((name) => name.endsWith('.part')).length, 0);
    assert.equal(fs.readdirSync(root).filter((name) => name.endsWith('.json')).length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('flujo completo exportador-receptor importa evidencia protegida', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'greenbone-e2e-'));
  const incoming = path.join(root, 'incoming');
  const processing = path.join(root, 'processing');
  const accepted = path.join(root, 'accepted');
  const rejected = path.join(root, 'rejected');
  fs.mkdirSync(incoming);
  const db = openCyberDatabase();
  try {
    const payload = buildGreenboneProtectedExport(model, options);
    writeProtectedExportAtomic(payload, incoming);
    const summary = receiveGreenboneProtectedOnce({
      db, incomingDirectory: incoming, processingDirectory: processing,
      acceptedDirectory: accepted, rejectedDirectory: rejected,
    });
    assert.deepEqual(summary, { discovered: 1, accepted: 1, alreadyImported: 0, rejected: 0 });
    assert.equal(db.prepare('SELECT count(*) count FROM cyber_vulnerability_findings').get().count, 3);
    assert.equal(db.prepare('SELECT count(*) count FROM cyber_remediation_cases').get().count, 2);
  } finally {
    db.close(); fs.rmSync(root, { recursive: true, force: true });
  }
});
