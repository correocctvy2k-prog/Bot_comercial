const test = require('node:test');
const assert = require('node:assert/strict');
const { assessInventoryCandidate, lifecycleFromAge } = require('../src/inventory-confidence-policy');

test('Kaspersky es autoridad de identidad para Windows administrado', () => {
  const result = assessInventoryCandidate({
    source: 'KASPERSKY', osFamily: 'Microsoft Windows 11', confidence: 0,
    lastSeenAt: '2026-08-30T00:00:00Z', reasonCodes: [], qualityFlags: [],
  }, '2026-09-01T00:00:00Z');
  assert.equal(result.sourceAuthority, 'AUTHORITATIVE_WINDOWS');
  assert.equal(result.identityStrength, 'HIGH');
  assert.equal(result.identityConfidence, 0.9);
  assert.equal(result.lifecycleStatus, 'ACTIVE');
  assert.equal(result.networkProfile, 'ADMINISTRATIVE_MANAGED');
  assert.equal(result.addressMode, 'FIXED_IP_EXPECTED');
});

test('FortiGate prueba actividad pero una MAC efimera no prueba identidad', () => {
  const result = assessInventoryCandidate({
    source: 'FORTIGATE', confidence: 0.65, lastSeenAt: '2026-08-20T00:00:00Z',
    reasonCodes: [], qualityFlags: ['LOCALLY_ADMINISTERED_MAC'],
  }, '2026-09-01T00:00:00Z');
  assert.equal(result.sourceAuthority, 'NETWORK_ACTIVITY_AUTHORITY');
  assert.equal(result.identityStrength, 'LOW');
  assert.equal(result.identityConfidence, 0.35);
  assert.equal(result.lifecycleStatus, 'INTERMITTENT');
  assert.equal(result.networkProfile, 'SEGMENT_POLICY_REQUIRED');
  assert.ok(result.reasonCodes.includes('NETWORK_SEGMENT_REQUIRES_CLASSIFICATION'));
});

test('las ventanas operativas distinguen actividad sin alterar identidad', () => {
  assert.equal(lifecycleFromAge(7), 'ACTIVE');
  assert.equal(lifecycleFromAge(30), 'INTERMITTENT');
  assert.equal(lifecycleFromAge(90), 'INACTIVE');
  assert.equal(lifecycleFromAge(91), 'STALE_REVIEW');
  assert.equal(lifecycleFromAge(null), 'UNKNOWN');
});
