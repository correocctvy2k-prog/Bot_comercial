const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { constants } = require('node:fs');
const { importGreenboneProtectedResults } = require('./greenbone-protected-importer');

const MAX_EXPORT_BYTES = 50 * 1024 * 1024;

function contentHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o750 });
}

function safeBasename(value) {
  return path.basename(value).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
}

function readClaimedFile(filePath, maxBytes = MAX_EXPORT_BYTES) {
  const descriptor = fs.openSync(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fs.fstatSync(descriptor);
    if (!before.isFile()) throw new Error('NOT_REGULAR_FILE');
    if (before.size < 2 || before.size > maxBytes) throw new Error('INVALID_FILE_SIZE');
    const buffer = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < buffer.length) {
      const bytesRead = fs.readSync(descriptor, buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const after = fs.fstatSync(descriptor);
    if (offset !== buffer.length || before.ino !== after.ino || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs) throw new Error('FILE_CHANGED_DURING_READ');
    return buffer;
  } finally {
    fs.closeSync(descriptor);
  }
}

function receiveGreenboneProtectedOnce({
  db, incomingDirectory, processingDirectory, acceptedDirectory, rejectedDirectory,
  importedAt = new Date().toISOString(), maxBytes = MAX_EXPORT_BYTES,
}) {
  if (!db) throw new Error('db is required');
  for (const directory of [processingDirectory, acceptedDirectory, rejectedDirectory]) {
    ensureDirectory(directory);
  }
  const candidates = fs.readdirSync(incomingDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.part'))
    .map((entry) => entry.name).sort();
  const summary = { discovered: candidates.length, accepted: 0, alreadyImported: 0, rejected: 0 };

  for (const name of candidates) {
    const safeName = safeBasename(name);
    const sourcePath = path.join(incomingDirectory, name);
    const claimPath = path.join(
      incomingDirectory,
      `.claimed-${process.pid}-${crypto.randomBytes(6).toString('hex')}-${safeName}`,
    );
    let processingPath = null;
    try {
      fs.renameSync(sourcePath, claimPath);
      const buffer = readClaimedFile(claimPath, maxBytes);
      const hash = contentHash(buffer);
      processingPath = path.join(processingDirectory, `${hash}.json`);
      fs.writeFileSync(processingPath, buffer, { flag: 'wx', mode: 0o640 });
      const result = importGreenboneProtectedResults({
        db, text: buffer.toString('utf8'), importedAt,
        custodyReference: `restricted://greenbone-sftp/${hash}`,
      });
      const acceptedPath = path.join(acceptedDirectory, `${hash}.json`);
      if (fs.existsSync(acceptedPath)) {
        if (contentHash(fs.readFileSync(acceptedPath)) !== hash) throw new Error('ACCEPTED_HASH_CONFLICT');
        fs.unlinkSync(processingPath);
      } else {
        fs.renameSync(processingPath, acceptedPath);
      }
      processingPath = null;
      fs.unlinkSync(claimPath);
      if (result.status === 'ALREADY_IMPORTED') summary.alreadyImported += 1;
      else summary.accepted += 1;
    } catch (error) {
      summary.rejected += 1;
      const rejectionId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName}`;
      let evidenceStored = false;
      if (processingPath && fs.existsSync(processingPath)) {
        fs.renameSync(processingPath, path.join(rejectedDirectory, `${rejectionId}.rejected`));
        evidenceStored = true;
      }
      if (fs.existsSync(claimPath)) {
        if (!evidenceStored) {
          fs.copyFileSync(claimPath, path.join(rejectedDirectory, `${rejectionId}.rejected`), constants.COPYFILE_EXCL);
        }
        fs.unlinkSync(claimPath);
      }
      const errorCode = String(error.message || 'REJECTED').replace(/[^A-Z0-9_:-]/gi, '_').slice(0, 120);
      fs.writeFileSync(
        path.join(rejectedDirectory, `${rejectionId}.error.json`),
        `${JSON.stringify({ file: safeName, errorCode, rejectedAt: new Date().toISOString() })}\n`,
        { flag: 'wx', mode: 0o640 },
      );
    }
  }
  return summary;
}

module.exports = { MAX_EXPORT_BYTES, readClaimedFile, receiveGreenboneProtectedOnce };
