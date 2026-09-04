const FORBIDDEN_FIELDS = new Set([
  'hostname', 'name', 'mac', 'macaddress', 'serial', 'serialnumber',
  'sourcepath', 'key', 'hmacKey',
].map((value) => value.toLowerCase()));

function isFingerprint(value) {
  return value === null || value === undefined || /^[0-9a-f]{64}$/.test(value);
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

function validateKscProtectedContract(payload) {
  const errors = [];
  if (payload?.SchemaVersion !== 1) errors.push('SchemaVersion must be 1');
  if (payload?.SourceSystem !== 'KSC_HARDWARE_PROTECTED') errors.push('invalid SourceSystem');
  if (!payload?.GeneratedAt || Number.isNaN(Date.parse(payload.GeneratedAt))) {
    errors.push('GeneratedAt must be an ISO timestamp');
  }
  if (!payload?.IdentityKeyVersion || typeof payload.IdentityKeyVersion !== 'string') {
    errors.push('IdentityKeyVersion is required');
  }
  if (!isFingerprint(payload?.SourceReportSha256) || !payload?.SourceReportSha256) {
    errors.push('SourceReportSha256 must be a SHA-256 value');
  }
  if (!Number.isInteger(payload?.DeviceCount) || payload.DeviceCount < 1) {
    errors.push('DeviceCount must be a positive integer');
  }
  if (!Array.isArray(payload?.Devices) || payload.Devices.length === 0) {
    errors.push('Devices must be a non-empty array');
  }
  if (Array.isArray(payload?.Devices) && payload.DeviceCount !== payload.Devices.length) {
    errors.push('DeviceCount does not match Devices length');
  }

  for (const [index, device] of (payload?.Devices || []).entries()) {
    for (const field of ['RecordFingerprint', 'HostnameFingerprint', 'SerialFingerprint', 'HardwareFingerprint']) {
      if (!isFingerprint(device[field])) errors.push(`Devices[${index}].${field} is invalid`);
    }
    if (!device.RecordFingerprint) errors.push(`Devices[${index}].RecordFingerprint is required`);
    if (!Array.isArray(device.MacFingerprints)) {
      errors.push(`Devices[${index}].MacFingerprints must be an array`);
    } else if (device.MacFingerprints.some((value) => !isFingerprint(value))) {
      errors.push(`Devices[${index}].MacFingerprints contains an invalid value`);
    }
    if (typeof device.IsVirtual !== 'boolean') errors.push(`Devices[${index}].IsVirtual must be boolean`);
    if (device.LastSeen !== null && device.LastSeen !== undefined && Number.isNaN(Date.parse(device.LastSeen))) {
      errors.push(`Devices[${index}].LastSeen is invalid`);
    }
  }

  for (const finding of findForbiddenFields(payload)) errors.push(`forbidden raw field: ${finding}`);
  return { valid: errors.length === 0, errors };
}

module.exports = { findForbiddenFields, validateKscProtectedContract };
