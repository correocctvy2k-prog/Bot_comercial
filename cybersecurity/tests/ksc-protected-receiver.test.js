const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');
const { receiveKscProtectedOnce } = require('../src/ksc-protected-receiver');

const fixture = fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'ksc-protected-anonymized.json'),
);

function withReceiver(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skylab-ksc-receiver-'));
  const directories = Object.fromEntries(
    ['incoming', 'processing', 'accepted', 'rejected'].map((name) => {
      const directory = path.join(root, name);
      fs.mkdirSync(directory);
      return [name, directory];
    }),
  );
  const db = openCyberDatabase();
  try { return run({ db, ...directories }); } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('acepta un JSON protegido, lo archiva por hash y vacia incoming', () => withReceiver((context) => {
  fs.writeFileSync(path.join(context.incoming, 'ksc.json'), fixture);
  const result = receiveKscProtectedOnce({
    db: context.db,
    incomingDirectory: context.incoming,
    processingDirectory: context.processing,
    acceptedDirectory: context.accepted,
    rejectedDirectory: context.rejected,
  });
  assert.deepEqual(result, { discovered: 1, accepted: 1, alreadyImported: 0, rejected: 0 });
  assert.equal(fs.readdirSync(context.incoming).length, 0);
  assert.equal(fs.readdirSync(context.processing).length, 0);
  assert.equal(fs.readdirSync(context.accepted).length, 1);
  assert.equal(context.db.prepare('SELECT count(*) AS count FROM cyber_assets').get().count, 0);
}));

test('ignora .part y pone contratos invalidos en rejected', () => withReceiver((context) => {
  fs.writeFileSync(path.join(context.incoming, 'pending.json.part'), fixture);
  fs.writeFileSync(path.join(context.incoming, 'invalid.json'), '{}');
  const result = receiveKscProtectedOnce({
    db: context.db,
    incomingDirectory: context.incoming,
    processingDirectory: context.processing,
    acceptedDirectory: context.accepted,
    rejectedDirectory: context.rejected,
  });
  assert.equal(result.discovered, 1);
  assert.equal(result.rejected, 1);
  assert.deepEqual(fs.readdirSync(context.incoming), ['pending.json.part']);
  assert.equal(fs.readdirSync(context.rejected).length, 2);
  assert.equal(context.db.prepare('SELECT count(*) AS count FROM cyber_source_snapshots').get().count, 0);
}));

test('dos nombres con el mismo contenido no duplican observaciones', () => withReceiver((context) => {
  fs.writeFileSync(path.join(context.incoming, 'first.json'), fixture);
  fs.writeFileSync(path.join(context.incoming, 'second.json'), fixture);
  const result = receiveKscProtectedOnce({
    db: context.db,
    incomingDirectory: context.incoming,
    processingDirectory: context.processing,
    acceptedDirectory: context.accepted,
    rejectedDirectory: context.rejected,
  });
  assert.equal(result.accepted, 1);
  assert.equal(result.alreadyImported, 1);
  assert.equal(fs.readdirSync(context.accepted).length, 1);
  assert.equal(context.db.prepare('SELECT count(*) AS count FROM cyber_asset_observations').get().count, 1);
}));
