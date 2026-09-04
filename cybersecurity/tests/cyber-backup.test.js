const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');
const { importKscProtectedInventory } = require('../src/ksc-protected-importer');
const { createCyberBackup, sha256File } = require('../src/cyber-backup');

const fixture = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'ksc-protected-anonymized.json'));

test('crea y verifica un snapshot SQLite con manifiesto sin identidades crudas', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skylab-cyber-backup-'));
  const databasePath = path.join(root, 'data', 'inventory.db');
  const accepted = path.join(root, 'accepted');
  const backups = path.join(root, 'backups');
  fs.mkdirSync(path.dirname(databasePath));
  fs.mkdirSync(accepted);
  fs.writeFileSync(path.join(accepted, 'evidence.json'), fixture);
  const db = openCyberDatabase(databasePath);
  try { importKscProtectedInventory({ db, text: fixture.toString('utf8') }); } finally { db.close(); }

  try {
    const result = await createCyberBackup({
      databasePath,
      acceptedDirectory: accepted,
      backupDirectory: backups,
      now: new Date('2026-08-31T17:00:00.000Z'),
    });
    assert.equal(result.manifest.summary.integrity, 'ok');
    assert.equal(result.manifest.summary.observations, 1);
    assert.equal(result.manifest.summary.canonicalAssets, 0);
    assert.equal(result.manifest.acceptedEvidence.length, 1);
    const backupPath = path.join(backups, result.databaseFile);
    assert.equal(result.manifest.database.sha256, sha256File(backupPath));
    assert.doesNotMatch(JSON.stringify(result.manifest), /example-host|00[:-]11/i);
    assert.deepEqual(
      fs.readdirSync(backups).sort(),
      [result.databaseFile, result.manifestFile].sort(),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
