const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregateExpectedNetworks, ipv4Prefix24, mergeExpectedNetworks } = require('../src/operations-points-catalog');

test('agrega puntos por zona y prefijo sin exponer nombres de puntos', () => {
  const networks = aggregateExpectedNetworks([
    { ip: '10.2.6.10', segment: 'Florida', active: true },
    { ip: '10.2.6.11', segment: 'Florida', active: false },
    { ip: '10.2.7.10', segment: 'Rozo', active: true },
  ]);
  assert.equal(networks.length, 2);
  assert.equal(networks[0].expectedPoints, 2);
  assert.equal(networks[0].cidr, '10.2.6.0/24');
  assert.doesNotMatch(JSON.stringify(networks), /Florida Store|siiss/i);
});

test('distingue redes esperadas no observadas y cobertura confirmada', () => {
  const expected = aggregateExpectedNetworks([{ ip: '10.2.6.10', segment: 'Florida', active: true }, { ip: '10.2.9.10', segment: 'Rozo', active: true }]);
  const merged = mergeExpectedNetworks([{ id: 'segment AAAAAAAA', referenceIps: ['10.2.6.35'], observations: 4 }], expected);
  assert.equal(merged.find((item) => item.id === 'segment AAAAAAAA').coverageStatus, 'EXPECTED_AND_OBSERVED');
  assert.equal(merged.filter((item) => item.coverageStatus === 'EXPECTED_NOT_OBSERVED').length, 1);
  assert.equal(ipv4Prefix24('invalid'), null);
});
