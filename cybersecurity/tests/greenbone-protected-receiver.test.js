const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');
const { receiveGreenboneProtectedOnce } = require('../src/greenbone-protected-receiver');

const fixture = fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'greenbone-protected-anonymized.json'),
);

function withReceiver(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skylab-greenbone-receiver-'));
  const directories = Object.fromEntries(['incoming', 'processing', 'accepted', 'rejected'].map((name) => {
    const directory = path.join(root, name); fs.mkdirSync(directory); return [name, directory];
  }));
  const db = openCyberDatabase();
  try { return run({ db, ...directories }); } finally {
    db.close(); fs.rmSync(root, { recursive: true, force: true });
  }
}

function receive(context, overrides = {}) {
  return receiveGreenboneProtectedOnce({
    db: context.db, incomingDirectory: context.incoming,
    processingDirectory: context.processing, acceptedDirectory: context.accepted,
    rejectedDirectory: context.rejected, ...overrides,
  });
}

test('acepta, importa y archiva el contrato por hash', () => withReceiver((context) => {
  fs.writeFileSync(path.join(context.incoming, 'report.json'), fixture);
  assert.deepEqual(receive(context), { discovered: 1, accepted: 1, alreadyImported: 0, rejected: 0 });
  assert.equal(fs.readdirSync(context.incoming).length, 0);
  assert.equal(fs.readdirSync(context.processing).length, 0);
  assert.equal(fs.readdirSync(context.accepted).length, 1);
  assert.equal(context.db.prepare('SELECT count(*) count FROM cyber_vulnerability_findings').get().count, 5);
}));

test('ignora .part y conserva contrato inválido con error sanitizado', () => withReceiver((context) => {
  fs.writeFileSync(path.join(context.incoming, 'pending.json.part'), fixture);
  fs.writeFileSync(path.join(context.incoming, 'invalid.json'), '{}');
  const result = receive(context);
  assert.equal(result.discovered, 1);
  assert.equal(result.rejected, 1);
  assert.deepEqual(fs.readdirSync(context.incoming), ['pending.json.part']);
  assert.equal(fs.readdirSync(context.rejected).length, 2);
}));

test('dos nombres con el mismo contenido importan una sola captura', () => withReceiver((context) => {
  fs.writeFileSync(path.join(context.incoming, 'first.json'), fixture);
  fs.writeFileSync(path.join(context.incoming, 'second.json'), fixture);
  const result = receive(context);
  assert.equal(result.accepted, 1);
  assert.equal(result.alreadyImported, 1);
  assert.equal(fs.readdirSync(context.accepted).length, 1);
  assert.equal(context.db.prepare('SELECT count(*) count FROM cyber_source_snapshots').get().count, 1);
}));

test('rechaza archivos que exceden el límite configurado', () => withReceiver((context) => {
  fs.writeFileSync(path.join(context.incoming, 'large.json'), fixture);
  const result = receive(context, { maxBytes: 10 });
  assert.equal(result.rejected, 1);
  assert.equal(context.db.prepare('SELECT count(*) count FROM cyber_source_snapshots').get().count, 0);
}));
