const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  selectBestAttribute,
  splitCommandSections,
  summarizeFortiGateInventory,
} = require('../src/fortigate-parser');

const fixture = fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'fortigate-anonymized.txt'),
  'utf8',
);

test('separa salidas por comando sin depender del hostname del firewall', () => {
  const sections = splitCommandSections(fixture);
  assert.equal(sections.size, 3);
  assert.ok(sections.has('get router info routing-table all'));
  assert.ok(sections.has('diagnose user device list'));
});

test('solo clasifica como segmentos las rutas directamente conectadas', () => {
  const inventory = summarizeFortiGateInventory(fixture);
  assert.deepEqual(
    inventory.connectedRoutes.map((route) => [route.cidr, route.interfaceName]),
    [
      ['192.0.2.0/25', 'VLAN-Workstations'],
      ['203.0.113.0/28', 'VLAN-Lab'],
    ],
  );
});

test('interpreta tiempos, IP y atributos preservando su fuente', () => {
  const [device] = summarizeFortiGateInventory(fixture).devices;
  assert.equal(device.mac, '00:11:22:33:44:55');
  assert.equal(device.createdSeconds, 86400);
  assert.equal(device.seenSeconds, 10);
  assert.equal(device.interfaceName, 'VLAN-Workstations');
  assert.deepEqual(device.ipObservations, [{ value: '192.0.2.10', source: 'arp' }]);
  assert.equal(selectBestAttribute(device, 'hostname').value, 'WS-LAB-01');
  assert.equal(selectBestAttribute(device, 'osFamily').value, 'Windows');
});

test('marca MAC local como efimera y nunca devuelve el nombre de usuario', () => {
  const inventory = summarizeFortiGateInventory(fixture);
  assert.equal(inventory.devices[1].isLocallyAdministered, true);
  assert.ok(inventory.devices[1].qualityFlags.includes('LOCALLY_ADMINISTERED_MAC'));
  assert.equal(inventory.devices[0].hasUserObservation, true);
  assert.ok(inventory.devices[0].qualityFlags.includes('USER_ATTRIBUTE_REDACTED'));
  assert.doesNotMatch(JSON.stringify(inventory), /redacted\.user/);
});

test('produce conteos agregados sin exponer identidades', () => {
  const { counts } = summarizeFortiGateInventory(fixture);
  assert.deepEqual(counts, {
    commands: 3,
    connectedRoutes: 2,
    devices: 2,
    devicesWithIp: 2,
    devicesWithHostname: 2,
    locallyAdministeredMacs: 1,
    userAttributesRedacted: 1,
  });
});
