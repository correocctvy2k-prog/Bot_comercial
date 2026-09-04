const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateGreenboneProtectedContract } = require('../src/greenbone-protected-contract');

const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'greenbone-protected-anonymized.json'), 'utf8',
));

test('acepta resultados Greenbone protegidos sin identidad de red cruda', () => {
  assert.deepEqual(validateGreenboneProtectedContract(fixture), { valid: true, errors: [] });
});

test('rechaza credenciales o identidad cruda aunque aparezcan anidadas', () => {
  const unsafe = structuredClone(fixture);
  unsafe.ExportMetadata = { Credentials: { Username: 'operator', Password: 'secret' } };
  unsafe.Results[0].Host = 'restricted-host';
  const result = validateGreenboneProtectedContract(unsafe);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('Credentials')));
  assert.ok(result.errors.some((error) => error.includes('.Host')));
});

test('rechaza IP o MAC filtradas dentro de la evidencia', () => {
  const unsafe = structuredClone(fixture);
  unsafe.Results[0].Evidence = 'Service observed at 192.0.2.10 with 00:11:22:33:44:55';
  const result = validateGreenboneProtectedContract(unsafe);
  assert.ok(result.errors.some((error) => error.includes('raw network identifier')));
});

test('rechaza conteos, fingerprints, CVE y rangos inconsistentes', () => {
  const invalid = structuredClone(fixture);
  invalid.ResultCount = 99;
  invalid.Results[0].ResultFingerprint = 'bad';
  invalid.Results[0].CVEs = ['not-a-cve'];
  invalid.Results[0].Severity = 11;
  const result = validateGreenboneProtectedContract(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('ResultCount')));
  assert.ok(result.errors.some((error) => error.includes('ResultFingerprint')));
  assert.ok(result.errors.some((error) => error.includes('CVEs')));
  assert.ok(result.errors.some((error) => error.includes('Severity')));
});
