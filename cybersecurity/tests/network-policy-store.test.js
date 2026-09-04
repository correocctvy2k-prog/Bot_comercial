const test = require('node:test');
const assert = require('node:assert/strict');
const { listDispositions, openNetworkPolicyStore, listPolicies, saveDisposition, savePolicy } = require('../src/network-policy-store');

const valid = {
  name: 'Red piloto', zone: 'Pradera', networkFunction: 'TERRITORIAL_ACCESS',
  networkAddress: '10.2.6.0', prefixLength: 24, gateway: '10.2.6.1',
  technology: 'WIRELESS_RADIO', topology: 'POINT_TO_MULTIPOINT',
  addressMode: 'STATIC', population: 'POS', criticality: 'HIGH',
};

test('persiste una política y conserva auditoría separada', () => {
  const db = openNetworkPolicyStore(':memory:');
  try {
    savePolicy(db, 'segment ABCD1234', valid, 'user-1', '2026-09-01T12:00:00Z');
    assert.equal(listPolicies(db)[0].zone, 'Pradera');
    assert.equal(db.prepare('SELECT count(*) count FROM network_policy_audit').get().count, 1);
    savePolicy(db, 'segment ABCD1234', { ...valid, criticality: 'CRITICAL' }, 'user-1', '2026-09-01T12:01:00Z');
    assert.equal(listPolicies(db)[0].criticality, 'CRITICAL');
    assert.equal(db.prepare('SELECT count(*) count FROM network_policy_audit').get().count, 2);
  } finally { db.close(); }
});

test('rechaza valores fuera de la taxonomía', () => {
  const db = openNetworkPolicyStore(':memory:');
  try { assert.throws(() => savePolicy(db, 'segment ABCD1234', { ...valid, addressMode: 'PUBLIC' }, 'user-1'), /INVALID_ADDRESS_MODE/); }
  finally { db.close(); }
});

test('marca segmentos combinados sin crear una política falsa', () => {
  const db = openNetworkPolicyStore(':memory:');
  try {
    saveDisposition(db, 'segment ABCD1234', { status: 'NEEDS_SPLIT', note: 'CIDR combinados' }, 'user-1');
    assert.equal(listDispositions(db)[0].status, 'NEEDS_SPLIT');
    assert.equal(listPolicies(db).length, 0);
    savePolicy(db, 'segment ABCD1234', valid, 'user-1');
    assert.equal(listDispositions(db).length, 0);
    assert.equal(listPolicies(db).length, 1);
  } finally { db.close(); }
});
