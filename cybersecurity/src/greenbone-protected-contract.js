const FORBIDDEN_FIELDS = new Set([
  'host', 'hostname', 'ip', 'ipaddress', 'mac', 'username', 'user',
  'password', 'credential', 'credentials', 'secret', 'token', 'privatekey',
  'sourcepath', 'manageraddress',
]);

function isFingerprint(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function findForbiddenFields(value, path = '$', findings = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenFields(item, `${path}[${index}]`, findings));
    return findings;
  }
  if (!value || typeof value !== 'object') return findings;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_FIELDS.has(key.toLowerCase())) findings.push(`${path}.${key}`);
    findForbiddenFields(child, `${path}.${key}`, findings);
  }
  return findings;
}

function validTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function containsRawNetworkIdentifier(value) {
  if (typeof value !== 'string') return false;
  const ipv4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
  const mac = /\b[0-9a-f]{2}(?::|-)(?:[0-9a-f]{2}(?::|-)){4}[0-9a-f]{2}\b/i;
  return ipv4.test(value) || mac.test(value);
}

function validateGreenboneProtectedContract(payload) {
  const errors = [];
  if (payload?.SchemaVersion !== 1) errors.push('SchemaVersion must be 1');
  if (payload?.SourceSystem !== 'GREENBONE_RESULTS_PROTECTED') errors.push('invalid SourceSystem');
  if (!validTimestamp(payload?.GeneratedAt)) errors.push('GeneratedAt must be an ISO timestamp');
  if (!validTimestamp(payload?.ScanStartedAt)) errors.push('ScanStartedAt must be an ISO timestamp');
  if (!validTimestamp(payload?.ScanCompletedAt)) errors.push('ScanCompletedAt must be an ISO timestamp');
  if (validTimestamp(payload?.ScanStartedAt) && validTimestamp(payload?.ScanCompletedAt)
    && Date.parse(payload.ScanCompletedAt) < Date.parse(payload.ScanStartedAt)) {
    errors.push('ScanCompletedAt must not precede ScanStartedAt');
  }
  if (!payload?.IdentityKeyVersion || typeof payload.IdentityKeyVersion !== 'string') {
    errors.push('IdentityKeyVersion is required');
  }
  if (!payload?.AuthorizationReference || typeof payload.AuthorizationReference !== 'string') {
    errors.push('AuthorizationReference is required');
  }
  if (!isFingerprint(payload?.ReportFingerprint)) errors.push('ReportFingerprint must be SHA-256');
  if (!['DISCOVERY_SAFE', 'VULNERABILITY_SAFE', 'CUSTOM_RESTRICTED'].includes(payload?.ScanProfile)) {
    errors.push('ScanProfile is invalid');
  }
  if (!Number.isInteger(payload?.ResultCount) || payload.ResultCount < 0) {
    errors.push('ResultCount must be a non-negative integer');
  }
  if (!Array.isArray(payload?.Results)) errors.push('Results must be an array');
  if (Array.isArray(payload?.Results) && payload.ResultCount !== payload.Results.length) {
    errors.push('ResultCount does not match Results length');
  }

  const resultFingerprints = new Set();
  for (const [index, result] of (payload?.Results || []).entries()) {
    const prefix = `Results[${index}]`;
    if (!isFingerprint(result.ResultFingerprint)) errors.push(`${prefix}.ResultFingerprint is invalid`);
    if (resultFingerprints.has(result.ResultFingerprint)) errors.push(`${prefix}.ResultFingerprint is duplicated`);
    resultFingerprints.add(result.ResultFingerprint);
    if (!isFingerprint(result.TargetFingerprint)) errors.push(`${prefix}.TargetFingerprint is invalid`);
    if (!result.Title || typeof result.Title !== 'string') errors.push(`${prefix}.Title is required`);
    if (!Number.isFinite(result.Severity) || result.Severity < 0 || result.Severity > 10) {
      errors.push(`${prefix}.Severity is invalid`);
    }
    if (!Number.isInteger(result.QoD) || result.QoD < 0 || result.QoD > 100) {
      errors.push(`${prefix}.QoD is invalid`);
    }
    if (result.Port !== null && result.Port !== undefined
      && (!Number.isInteger(result.Port) || result.Port < 0 || result.Port > 65535)) {
      errors.push(`${prefix}.Port is invalid`);
    }
    if (result.Transport !== null && result.Transport !== undefined
      && !['TCP', 'UDP', 'OTHER'].includes(result.Transport)) {
      errors.push(`${prefix}.Transport is invalid`);
    }
    if (!Array.isArray(result.CVEs)
      || result.CVEs.some((value) => !/^CVE-\d{4}-\d{4,}$/i.test(value))) {
      errors.push(`${prefix}.CVEs is invalid`);
    }
    if (result.Evidence !== null && result.Evidence !== undefined
      && typeof result.Evidence !== 'string') errors.push(`${prefix}.Evidence must be a string`);
    if (containsRawNetworkIdentifier(result.Evidence)) {
      errors.push(`${prefix}.Evidence contains a raw network identifier`);
    }
  }
  for (const finding of findForbiddenFields(payload)) errors.push(`forbidden raw field: ${finding}`);
  return { valid: errors.length === 0, errors };
}

module.exports = { containsRawNetworkIdentifier, findForbiddenFields, validateGreenboneProtectedContract };
