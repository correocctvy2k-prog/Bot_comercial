const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateKscProtectedContract } = require('../src/ksc-protected-contract');

const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'ksc-protected-anonymized.json'),
  'utf8',
));

test('acepta el contrato KSC protegido sin identificadores crudos', () => {
  assert.deepEqual(validateKscProtectedContract(fixture), { valid: true, errors: [] });
});

test('rechaza identificadores crudos aunque aparezcan en objetos anidados', () => {
  const unsafe = structuredClone(fixture);
  unsafe.Devices[0].Source = { SerialNumber: 'raw-value' };
  const result = validateKscProtectedContract(unsafe);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('SerialNumber')));
});

test('rechaza fingerprints malformados y conteos inconsistentes', () => {
  const invalid = structuredClone(fixture);
  invalid.DeviceCount = 2;
  invalid.Devices[0].HostnameFingerprint = 'not-a-fingerprint';
  const result = validateKscProtectedContract(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('DeviceCount')));
  assert.ok(result.errors.some((error) => error.includes('HostnameFingerprint')));
});
