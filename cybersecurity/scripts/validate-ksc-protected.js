const fs = require('node:fs');
const path = require('node:path');
const { validateKscProtectedContract } = require('../src/ksc-protected-contract');

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/validate-ksc-protected.js <protected.json>');
  process.exitCode = 2;
} else {
  const payload = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
  const result = validateKscProtectedContract(payload);
  if (!result.valid) {
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({
      valid: true,
      schemaVersion: payload.SchemaVersion,
      identityKeyVersion: payload.IdentityKeyVersion,
      deviceCount: payload.DeviceCount,
    }, null, 2));
  }
}
