const fs = require('node:fs');
const path = require('node:path');
const { validateGreenboneProtectedContract } = require('../src/greenbone-protected-contract');

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/validate-greenbone-protected.js <protected.json>');
  process.exitCode = 2;
} else {
  const payload = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
  const result = validateGreenboneProtectedContract(payload);
  if (!result.valid) {
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({
      valid: true, schemaVersion: payload.SchemaVersion,
      identityKeyVersion: payload.IdentityKeyVersion,
      resultCount: payload.ResultCount,
    }, null, 2));
  }
}
