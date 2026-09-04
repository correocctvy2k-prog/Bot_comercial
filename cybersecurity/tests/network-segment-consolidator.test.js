const test = require('node:test');
const assert = require('node:assert/strict');
const { consolidateNetworkSegments, inferDominantNetwork } = require('../src/network-segment-consolidator');

function member(id, ip, lifecycleStatus = 'ACTIVE') {
  return { id, ip, lifecycleStatus, ephemeralMac: false, lastActivityAt: '2026-09-01T12:00:00Z' };
}

function applied(id, address, prefixLength, members = []) {
  return { id, label: id, classificationStatus: 'APPROVED', policy: { networkAddress: address, prefixLength }, members, observations: members.length, referenceIps: [] };
}

test('mueve IP de un grupo por desagregar hacia la subred aplicada', () => {
  const result = consolidateNetworkSegments([
    applied('segment AAAAAAAA', '10.2.6.0', 24),
    { id: 'segment BBBBBBBB', label: 'Mixto', classificationStatus: 'NEEDS_SPLIT', members: [member('one', '10.2.6.25'), member('two', '10.9.1.8')], observations: 2 },
  ]);
  const target = result.find((item) => item.id === 'segment AAAAAAAA');
  assert.equal(target.observations, 1);
  assert.equal(target.reassignedObservations, 1);
  assert.equal(result.some((item) => item.id === 'segment BBBBBBBB'), false);
  const pending = result.find((item) => item.classificationStatus === 'HOST_OBSERVATION');
  assert.equal(pending.inferredCidr, '10.9.1.0/24');
  assert.equal(pending.observations, 1);
});

test('separa de una red aplicada las IP que no pertenecen a su CIDR', () => {
  const result = consolidateNetworkSegments([
    applied('segment AAAAAAAA', '192.168.24.0', 24, [member('one', '192.168.24.10'), member('two', '172.26.10.5'), member('three', '172.26.10.6')]),
  ]);
  assert.equal(result.find((item) => item.id === 'segment AAAAAAAA').observations, 1);
  const external = result.find((item) => item.inferredCidr === '172.26.10.0/24');
  assert.equal(external.classificationStatus, 'PENDING');
  assert.equal(external.observations, 2);
});

test('prefiere la política con el prefijo más específico', () => {
  const result = consolidateNetworkSegments([
    applied('segment AAAAAAAA', '10.2.0.0', 16),
    applied('segment CCCCCCCC', '10.2.6.0', 24),
    { id: 'segment BBBBBBBB', classificationStatus: 'NEEDS_SPLIT', members: [member('one', '10.2.6.25')], observations: 1 },
  ]);
  assert.equal(result.find((item) => item.id === 'segment CCCCCCCC').observations, 1);
  assert.equal(result.find((item) => item.id === 'segment AAAAAAAA').observations, 0);
});

test('genera pendientes estables por cada prefijo residual y no duplica observaciones', () => {
  const input = [{ id: 'segment BBBBBBBB', classificationStatus: 'NEEDS_SPLIT', members: [member('one', '10.9.1.8'), member('two', '10.9.2.9')], observations: 2 }];
  const first = consolidateNetworkSegments(input);
  const second = consolidateNetworkSegments(input);
  assert.equal(first.length, 2);
  assert.deepEqual(first.map((item) => item.id), second.map((item) => item.id));
  assert.equal(first.reduce((sum, item) => sum + item.observations, 0), 2);
});

test('infiere un /24 dominante para una política antigua sin CIDR', () => {
  const members = [member('one', '10.2.2.10'), member('two', '10.2.2.20'), member('three', '10.2.2.30'), member('four', '10.2.2.40'), member('five', '10.9.1.8')];
  assert.deepEqual(inferDominantNetwork(members), { networkAddress: '10.2.2.0', prefixLength: 24, matchingIpCount: 4, totalIpCount: 5 });
  assert.equal(inferDominantNetwork([member('one', '10.2.2.10'), member('two', '10.9.1.8')]), null);
});
