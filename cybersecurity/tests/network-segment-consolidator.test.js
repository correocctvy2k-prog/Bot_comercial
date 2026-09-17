const test = require('node:test');
const assert = require('node:assert/strict');
const { consolidateNetworkSegments, inferDominantNetwork } = require('../src/network-segment-consolidator');

function member(id, ip, lifecycleStatus = 'ACTIVE') {
  return { id, ip, lifecycleStatus, ephemeralMac: false, lastActivityAt: '2026-09-01T12:00:00Z', source: 'FORTIGATE' };
}

// Un equipo Kaspersky corroborado contra FortiGate hereda la subred de su par pero nunca trae
// IP propia (ver listNetworkSegments/getKasperskyInheritedSegments, 2026-09-16).
function kasperskyMember(id, lifecycleStatus = 'ACTIVE') {
  return { id, ip: null, lifecycleStatus, ephemeralMac: false, lastActivityAt: '2026-09-01T12:00:00Z', source: 'KASPERSKY', inheritedFromFortiGate: true };
}

function applied(id, address, prefixLength, members = []) {
  const inheritedKasperskyCount = members.filter((item) => item.source === 'KASPERSKY').length;
  return { id, label: id, classificationStatus: 'APPROVED', policy: { networkAddress: address, prefixLength }, members, observations: members.length, referenceIps: [], inheritedKasperskyCount };
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

// Regresión 2026-09-16 (aplicar el cruce FortiGate↔Kaspersky ya calculado): un miembro
// Kaspersky heredado no tiene IP -- sin el corte "sin IP no se reconcilia", containsIp(...,
// null) siempre daba false y lo mandaba al bucket residual "SIN-IP", separándolo de la subred
// ya aplicada a la que en realidad pertenece.
test('un miembro Kaspersky heredado (sin IP) se queda en su subred aunque ya tenga política aplicada', () => {
  const result = consolidateNetworkSegments([
    applied('segment AAAAAAAA', '10.2.13.0', 24, [member('forti-1', '10.2.13.20'), kasperskyMember('ksc-1')]),
  ]);
  const target = result.find((item) => item.id === 'segment AAAAAAAA');
  assert.equal(target.observations, 2, 'el miembro Kaspersky no debe perderse ni separarse');
  assert.equal(target.inheritedKasperskyCount, 1);
  assert.ok(target.members.some((item) => item.id === 'ksc-1'));
  assert.equal(result.some((item) => item.classificationStatus === 'NO_IP_OBSERVATION'), false, 'no debe crearse un residual SIN-IP para el equipo Kaspersky');
});

test('un miembro Kaspersky heredado en un grupo NEEDS_SPLIT tampoco se separa por IP', () => {
  const result = consolidateNetworkSegments([
    applied('segment AAAAAAAA', '10.2.13.0', 24),
    { id: 'segment BBBBBBBB', classificationStatus: 'NEEDS_SPLIT', members: [member('one', '10.2.13.25'), kasperskyMember('ksc-1')], observations: 2 },
  ]);
  const target = result.find((item) => item.id === 'segment AAAAAAAA');
  assert.equal(target.reassignedObservations, 1, 'solo la observación con IP real se reasigna');
  assert.equal(result.some((item) => item.members?.some((member2) => member2.id === 'ksc-1')), false, 'el miembro Kaspersky no tiene forma de reconciliarse sin IP -- no debe aparecer reasignado a otra subred ni inventado en ninguna');
});
