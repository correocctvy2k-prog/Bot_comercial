const fs = require('node:fs');
const path = require('node:path');
const {
  buildGreenboneProtectedExport,
  writeProtectedExportAtomic,
} = require('../src/greenbone-protected-exporter');

process.umask(0o027);

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function requiredArgument(name) {
  const value = argument(name);
  if (!value) throw new Error(`MISSING_ARGUMENT_${name.toUpperCase().replace(/-/g, '_')}`);
  return value;
}

function readStandardInput(maxBytes = 100 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  const buffer = Buffer.alloc(64 * 1024);
  let bytesRead;
  do {
    bytesRead = fs.readSync(0, buffer, 0, buffer.length, null);
    total += bytesRead;
    if (total > maxBytes) throw new Error('READ_MODEL_TOO_LARGE');
    if (bytesRead > 0) chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
  } while (bytesRead > 0);
  return Buffer.concat(chunks).toString('utf8');
}

try {
  const identityKeyPath = path.resolve(requiredArgument('identity-key-file'));
  const identityKeyVersion = requiredArgument('identity-key-version');
  const outputDirectory = path.resolve(requiredArgument('output'));
  const keyStat = fs.statSync(identityKeyPath);
  if (!keyStat.isFile()) throw new Error('IDENTITY_KEY_NOT_REGULAR_FILE');
  if (process.platform !== 'win32' && (keyStat.mode & 0o037) !== 0) {
    throw new Error('IDENTITY_KEY_PERMISSIONS_TOO_OPEN');
  }
  const identityKey = fs.readFileSync(identityKeyPath);
  if (identityKey.length < 32 || identityKey.length > 4096) throw new Error('INVALID_IDENTITY_KEY_SIZE');
  const inputPath = argument('input', '-');
  const text = inputPath === '-'
    ? readStandardInput()
    : fs.readFileSync(path.resolve(inputPath), 'utf8');
  let model;
  try { model = JSON.parse(text); } catch { throw new Error('INVALID_READ_MODEL_JSON'); }
  const payload = buildGreenboneProtectedExport(model, { identityKey, identityKeyVersion });
  const result = writeProtectedExportAtomic(payload, outputDirectory);
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    file: path.basename(result.path),
    results: payload.ResultCount,
    bytes: result.bytes,
  })}\n`);
} catch (error) {
  const errorCode = String(error.message || 'EXPORT_FAILED').replace(/[^A-Z0-9_:-]/gi, '_').slice(0, 120);
  process.stderr.write(`${JSON.stringify({ status: 'FAILED', errorCode })}\n`);
  process.exitCode = 1;
}
