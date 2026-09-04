const test = require('node:test');
const assert = require('node:assert/strict');
const { networkFacts } = require('../src/network-math');

test('calcula los límites y capacidad de una subred IPv4', () => {
  assert.deepEqual(networkFacts('10.2.6.35', 24, '10.2.6.1'), {
    networkAddress: '10.2.6.0', prefixLength: 24, netmask: '255.255.255.0',
    broadcast: '10.2.6.255', totalAddresses: 256, usableHosts: 254,
  });
});

test('rechaza gateway fuera de la red o reservado', () => {
  assert.throws(() => networkFacts('10.2.6.0', 24, '10.2.7.1'), /INVALID_GATEWAY/);
  assert.throws(() => networkFacts('10.2.6.0', 24, '10.2.6.255'), /INVALID_GATEWAY/);
});
