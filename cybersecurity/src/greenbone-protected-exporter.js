const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { validateGreenboneProtectedContract } = require('./greenbone-protected-contract');

const MAX_EVIDENCE_CHARS = 8192;

function hmac(key, value) {
  return crypto.createHmac('sha256', key).update(value).digest('hex');
}

function validTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function validateReadModel(model) {
  const errors = [];
  if (model?.SchemaVersion !== 1) errors.push('SchemaVersion must be 1');
  if (model?.SourceSystem !== 'GREENBONE_READ_ONLY_EXTRACTION') errors.push('invalid SourceSystem');
  if (!model?.ReportId || typeof model.ReportId !== 'string') errors.push('ReportId is required');
  if (model?.ReportStatus !== 'DONE') errors.push('ReportStatus must be DONE');
  if (!model?.AuthorizationReference || typeof model.AuthorizationReference !== 'string') {
    errors.push('AuthorizationReference is required');
  }
  if (!validTimestamp(model?.GeneratedAt)) errors.push('GeneratedAt is invalid');
  if (!validTimestamp(model?.ScanStartedAt)) errors.push('ScanStartedAt is invalid');
  if (!validTimestamp(model?.ScanCompletedAt)) errors.push('ScanCompletedAt is invalid');
  if (!['DISCOVERY_SAFE', 'VULNERABILITY_SAFE', 'CUSTOM_RESTRICTED'].includes(model?.ScanProfile)) {
    errors.push('ScanProfile is invalid');
  }
  if (!Array.isArray(model?.Results)) errors.push('Results must be an array');
  for (const [index, result] of (model?.Results || []).entries()) {
    const prefix = `Results[${index}]`;
    if (!result?.ResultId || typeof result.ResultId !== 'string') errors.push(`${prefix}.ResultId is required`);
    if (!result?.Host || typeof result.Host !== 'string') errors.push(`${prefix}.Host is required`);
    if (!result?.Title || typeof result.Title !== 'string') errors.push(`${prefix}.Title is required`);
    if (!Number.isFinite(result?.Severity) || result.Severity < 0 || result.Severity > 10) {
      errors.push(`${prefix}.Severity is invalid`);
    }
    if (!Number.isInteger(result?.QoD) || result.QoD < 0 || result.QoD > 100) {
      errors.push(`${prefix}.QoD is invalid`);
    }
    if (result.Port !== null && result.Port !== undefined
      && (!Number.isInteger(result.Port) || result.Port < 0 || result.Port > 65535)) {
      errors.push(`${prefix}.Port is invalid`);
    }
    if (result.Transport !== null && result.Transport !== undefined
      && !['TCP', 'UDP', 'OTHER'].includes(String(result.Transport).toUpperCase())) {
      errors.push(`${prefix}.Transport is invalid`);
    }
  }
  return { valid: errors.length === 0, errors };
}

function sanitizeEvidence(value, host) {
  let text = String(value || '');
  if (host) text = text.split(String(host)).join('[TARGET_REDACTED]');
  text = text
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP_REDACTED]')
    .replace(/\b[0-9a-f]{2}(?::|-)(?:[0-9a-f]{2}(?::|-)){4}[0-9a-f]{2}\b/gi, '[MAC_REDACTED]')
    .replace(/\b[A-F0-9]{0,4}:[A-F0-9:]{2,}\b/gi, '[IPV6_REDACTED]')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, MAX_EVIDENCE_CHARS);
}

function normalizeCves(values) {
  const candidates = Array.isArray(values) ? values : [values];
  return [...new Set(candidates.flatMap(
    (value) => String(value || '').match(/CVE-\d{4}-\d{4,}/gi) || [],
  ).map((value) => value.toUpperCase()))].sort();
}

function buildGreenboneProtectedExport(model, { identityKey, identityKeyVersion }) {
  const validation = validateReadModel(model);
  if (!validation.valid) {
    const error = new Error('INVALID_GREENBONE_READ_MODEL');
    error.validationErrors = validation.errors;
    throw error;
  }
  const key = Buffer.isBuffer(identityKey) ? identityKey : Buffer.from(identityKey || '');
  if (key.length < 32) throw new Error('IDENTITY_KEY_TOO_SHORT');
  if (!identityKeyVersion || typeof identityKeyVersion !== 'string') {
    throw new Error('IDENTITY_KEY_VERSION_REQUIRED');
  }
  const reportFingerprint = hmac(key, `report:${model.ReportId}`);
  const results = model.Results.map((result) => {
    const normalizedHost = String(result.Host).trim().toLowerCase();
    const targetFingerprint = hmac(key, `target:${normalizedHost}`);
    return {
      ResultFingerprint: hmac(key, `result:${model.ReportId}:${result.ResultId}:${targetFingerprint}`),
      TargetFingerprint: targetFingerprint,
      Port: result.Port ?? null,
      Transport: result.Transport ? String(result.Transport).toUpperCase() : null,
      NvtOid: String(result.NvtOid || '').trim() || null,
      Title: String(result.Title).trim(),
      Severity: Number(result.Severity),
      QoD: Number(result.QoD),
      CVEs: normalizeCves(result.CVEs),
      Evidence: sanitizeEvidence(result.Evidence, result.Host),
    };
  });
  const payload = {
    SchemaVersion: 1,
    SourceSystem: 'GREENBONE_RESULTS_PROTECTED',
    GeneratedAt: new Date(model.GeneratedAt).toISOString(),
    ScanStartedAt: new Date(model.ScanStartedAt).toISOString(),
    ScanCompletedAt: new Date(model.ScanCompletedAt).toISOString(),
    IdentityKeyVersion: identityKeyVersion,
    AuthorizationReference: model.AuthorizationReference,
    ReportFingerprint: reportFingerprint,
    ScanProfile: model.ScanProfile,
    ResultCount: results.length,
    Results: results,
  };
  const contractValidation = validateGreenboneProtectedContract(payload);
  if (!contractValidation.valid) {
    const error = new Error('GENERATED_CONTRACT_IS_INVALID');
    error.validationErrors = contractValidation.errors;
    throw error;
  }
  return payload;
}

function writeProtectedExportAtomic(payload, outputDirectory) {
  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o750 });
  const stamp = payload.ScanCompletedAt.replace(/[-:.]/g, '').replace('Z', 'Z');
  const basename = `greenbone-${stamp}-${payload.ReportFingerprint.slice(0, 16)}.json`;
  const finalPath = path.join(outputDirectory, basename);
  const partPath = `${finalPath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.part`;
  const text = `${JSON.stringify(payload)}\n`;
  const descriptor = fs.openSync(partPath, 'wx', 0o640);
  try {
    fs.writeFileSync(descriptor, text, 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  try {
    fs.linkSync(partPath, finalPath);
    fs.unlinkSync(partPath);
  } catch (error) {
    if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
    if (error.code === 'EEXIST') {
      const existing = fs.readFileSync(finalPath, 'utf8');
      if (existing === text) return { status: 'ALREADY_EXPORTED', path: finalPath, bytes: Buffer.byteLength(text) };
      throw new Error('EXPORT_PATH_CONFLICT');
    }
    throw error;
  }
  return { status: 'EXPORTED', path: finalPath, bytes: Buffer.byteLength(text) };
}

module.exports = {
  buildGreenboneProtectedExport,
  sanitizeEvidence,
  validateReadModel,
  writeProtectedExportAtomic,
};
