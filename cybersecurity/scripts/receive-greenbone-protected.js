const fs = require('node:fs');
const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');
const { receiveGreenboneProtectedOnce } = require('../src/greenbone-protected-receiver');

process.umask(0o027);

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const root = argument('state-root', '/data/state');
const incomingDirectory = argument('incoming', '/data/incoming');
const databasePath = argument('db', path.join(root, 'data', 'cyber-inventory.db'));
fs.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o750 });
const db = openCyberDatabase(databasePath);
try {
  const summary = receiveGreenboneProtectedOnce({
    db, incomingDirectory,
    processingDirectory: path.join(root, 'greenbone-processing'),
    acceptedDirectory: path.join(root, 'greenbone-accepted'),
    rejectedDirectory: path.join(root, 'greenbone-rejected'),
  });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (summary.rejected > 0) process.exitCode = 2;
} finally {
  db.close();
}
