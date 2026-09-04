const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync, backup } = require('node:sqlite');

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const descriptor = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(1024 * 1024);
  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest('hex');
}

function databaseSummary(db) {
  const count = (table) => db.prepare(`SELECT count(*) AS count FROM ${table}`).get().count;
  return {
    integrity: db.prepare('PRAGMA integrity_check').get().integrity_check,
    foreignKeyViolations: db.prepare('PRAGMA foreign_key_check').all().length,
    snapshots: count('cyber_source_snapshots'),
    observations: count('cyber_asset_observations'),
    canonicalAssets: count('cyber_assets'),
    scanAuthorizations: count('cyber_scan_authorizations'),
  };
}

function acceptedEvidence(acceptedDirectory) {
  if (!fs.existsSync(acceptedDirectory)) return [];
  return fs.readdirSync(acceptedDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => {
      const filePath = path.join(acceptedDirectory, entry.name);
      const stat = fs.statSync(filePath);
      return { sha256: sha256File(filePath), bytes: stat.size };
    })
    .sort((left, right) => left.sha256.localeCompare(right.sha256));
}

async function createCyberBackup({
  databasePath,
  acceptedDirectory,
  backupDirectory,
  now = new Date(),
}) {
  if (!fs.existsSync(databasePath)) throw new Error('DATABASE_NOT_FOUND');
  fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o750 });
  const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const baseName = `cyber-inventory-${timestamp}`;
  const finalDatabase = path.join(backupDirectory, `${baseName}.db`);
  const finalManifest = path.join(backupDirectory, `${baseName}.manifest.json`);
  if (fs.existsSync(finalDatabase) || fs.existsSync(finalManifest)) throw new Error('BACKUP_ALREADY_EXISTS');

  const temporaryDatabase = `${finalDatabase}.tmp-${crypto.randomUUID()}`;
  const temporaryManifest = `${finalManifest}.tmp-${crypto.randomUUID()}`;
  const source = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const sourceSummary = databaseSummary(source);
    if (sourceSummary.integrity !== 'ok' || sourceSummary.foreignKeyViolations !== 0) {
      throw new Error('SOURCE_DATABASE_INTEGRITY_FAILED');
    }
    await backup(source, temporaryDatabase);
    const snapshot = new DatabaseSync(temporaryDatabase, { readOnly: true });
    let snapshotSummary;
    try { snapshotSummary = databaseSummary(snapshot); } finally { snapshot.close(); }
    if (JSON.stringify(snapshotSummary) !== JSON.stringify(sourceSummary)) {
      throw new Error('BACKUP_VERIFICATION_MISMATCH');
    }

    fs.chmodSync(temporaryDatabase, 0o640);
    const manifest = {
      schemaVersion: 1,
      createdAt: now.toISOString(),
      database: { sha256: sha256File(temporaryDatabase), bytes: fs.statSync(temporaryDatabase).size },
      summary: snapshotSummary,
      acceptedEvidence: acceptedEvidence(acceptedDirectory),
    };
    fs.writeFileSync(temporaryManifest, `${JSON.stringify(manifest)}\n`, { flag: 'wx', mode: 0o640 });
    fs.renameSync(temporaryDatabase, finalDatabase);
    fs.renameSync(temporaryManifest, finalManifest);
    return { databaseFile: path.basename(finalDatabase), manifestFile: path.basename(finalManifest), manifest };
  } finally {
    source.close();
    fs.rmSync(temporaryDatabase, { force: true });
    fs.rmSync(`${temporaryDatabase}-wal`, { force: true });
    fs.rmSync(`${temporaryDatabase}-shm`, { force: true });
    fs.rmSync(temporaryManifest, { force: true });
  }
}

module.exports = { createCyberBackup, databaseSummary, sha256File };
