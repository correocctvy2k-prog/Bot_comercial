const path = require('node:path');
const { createCyberBackup } = require('../src/cyber-backup');

process.umask(0o027);

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

createCyberBackup({
  databasePath: argument('db', '/data/state/data/cyber-inventory.db'),
  acceptedDirectory: argument('accepted', '/data/state/accepted'),
  backupDirectory: argument('backups', '/data/state/backups'),
}).then((result) => {
  process.stdout.write(`${JSON.stringify({
    databaseFile: result.databaseFile,
    manifestFile: result.manifestFile,
    summary: result.manifest.summary,
    acceptedEvidenceCount: result.manifest.acceptedEvidence.length,
  })}\n`);
}).catch((error) => {
  process.stderr.write(`${String(error.message || 'BACKUP_FAILED')}\n`);
  process.exitCode = 1;
});
