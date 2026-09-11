'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  matchCrmPoints,
  computeCapabilities,
  diffCapabilities,
  timeToMinutes,
  buildScheduleCache,
} = require('../platform/crm-points-sync');

const loc = (id, siis, name) => ({ id, siis_code: siis, canonical_name: name });
const crm = (id, over = {}) => ({ id, siiss_id: null, alias: null, name: null, is_double: false, is_permanently_closed: false, has_cctv: false, has_alarm: false, has_custom_schedule: false, ...over });

test('matchCrmPoints: SIIS exacto sin duplicados -> AUTO_LINKABLE', () => {
  const rows = matchCrmPoints([crm('c1', { siiss_id: '4157' })], [loc('l1', '4157', 'PUNTO A')], []);
  assert.deepEqual(rows, [{ crmPointId: 'c1', siisCode: '4157', locationId: 'l1', method: 'SIIS_EXACT', decision: 'AUTO_LINKABLE' }]);
});

test('matchCrmPoints: SIIS duplicado sin is_double -> HELD', () => {
  const rows = matchCrmPoints(
    [crm('c1', { siiss_id: '99' }), crm('c2', { siiss_id: '99' })],
    [loc('l1', '99', 'PUNTO A')], [],
  );
  assert.ok(rows.every((r) => r.method === 'SIIS_DUPLICATED_IN_CRM' && r.decision === 'HELD'));
});

test('matchCrmPoints: SIIS duplicado con is_double en ambos -> AUTO_LINKABLE compartido', () => {
  const rows = matchCrmPoints(
    [crm('c1', { siiss_id: '99', is_double: true }), crm('c2', { siiss_id: '99', is_double: true })],
    [loc('l1', '99', 'PUNTO A')], [],
  );
  assert.ok(rows.every((r) => r.method === 'SIIS_SHARED_DOUBLE_LOCATION' && r.decision === 'AUTO_LINKABLE'));
});

test('matchCrmPoints: sin SIIS, un solo alias coincide -> REVIEW_REQUIRED', () => {
  const rows = matchCrmPoints(
    [crm('c1', { alias: 'Tienda Uribe' })],
    [loc('l1', null, 'Tienda Uribe')],
    [{ location_id: 'l1', alias_key: 'TIENDA URIBE', alias_raw: 'Tienda Uribe' }],
  );
  assert.deepEqual(rows[0], { crmPointId: 'c1', siisCode: null, locationId: 'l1', method: 'ALIAS_EXACT', decision: 'REVIEW_REQUIRED' });
});

test('matchCrmPoints: alias ambiguo o sin match -> HELD', () => {
  const rows = matchCrmPoints(
    [crm('c1', { alias: 'Sucursal Genérica' }), crm('c2', { alias: 'Nada que se le parezca' })],
    [loc('l1', null, 'Sucursal Genérica'), loc('l2', null, 'sucursal generica')],
    [],
  );
  assert.equal(rows[0].method, 'ALIAS_AMBIGUOUS');
  assert.equal(rows[0].decision, 'HELD');
  assert.equal(rows[1].method, 'NO_MATCH');
});

test('computeCapabilities: refleja los sets reales', () => {
  const ctx = { notifyingLocs: new Set(['l1']), alarmLocationIds: new Set(['l2']) };
  assert.deepEqual(computeCapabilities('l1', ctx), { hasCctv: true, hasAlarm: false });
  assert.deepEqual(computeCapabilities('l2', ctx), { hasCctv: false, hasAlarm: true });
  assert.deepEqual(computeCapabilities('l3', ctx), { hasCctv: false, hasAlarm: false });
});

test('diffCapabilities: solo AUTO_LINKABLE, solo cuando cambia, y siempre gana el dato real', () => {
  const matches = [
    { crmPointId: 'c1', locationId: 'l1', method: 'SIIS_EXACT', decision: 'AUTO_LINKABLE' },
    { crmPointId: 'c2', locationId: 'l2', method: 'SIIS_EXACT', decision: 'AUTO_LINKABLE' },
    { crmPointId: 'c3', locationId: 'l3', method: 'ALIAS_EXACT', decision: 'REVIEW_REQUIRED' },
  ];
  const crmPointsById = new Map([
    ['c1', crm('c1', { has_cctv: false, has_alarm: false })], // debe cambiar a true/false real
    ['c2', crm('c2', { has_cctv: true, has_alarm: true })], // ya coincide, no debe aparecer
    ['c3', crm('c3', { has_cctv: false })], // REVIEW_REQUIRED: nunca se escribe
  ]);
  const computeFor = (locationId) => ({
    l1: { hasCctv: true, hasAlarm: false },
    l2: { hasCctv: true, hasAlarm: true },
    l3: { hasCctv: true, hasAlarm: true },
  })[locationId];
  const updates = diffCapabilities(matches, crmPointsById, computeFor);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].crmPointId, 'c1');
  assert.deepEqual(updates[0].patch, { has_cctv: true });
});

test('diffCapabilities: ignora puntos cerrados permanentemente', () => {
  const matches = [{ crmPointId: 'c1', locationId: 'l1', method: 'SIIS_EXACT', decision: 'AUTO_LINKABLE' }];
  const crmPointsById = new Map([['c1', crm('c1', { is_permanently_closed: true, has_cctv: false })]]);
  const updates = diffCapabilities(matches, crmPointsById, () => ({ hasCctv: true, hasAlarm: true }));
  assert.equal(updates.length, 0);
});

test('timeToMinutes parsea HH:MM y HH:MM:SS; null si no parsea', () => {
  assert.equal(timeToMinutes('07:30'), 450);
  assert.equal(timeToMinutes('21:00:00'), 1260);
  assert.equal(timeToMinutes('nope'), null);
  assert.equal(timeToMinutes(null), null);
});

test('buildScheduleCache: solo puntos con has_custom_schedule y horario parseable', () => {
  const matches = [
    { crmPointId: 'c1', locationId: 'l1' },
    { crmPointId: 'c2', locationId: 'l2' },
    { crmPointId: 'c3', locationId: null },
  ];
  const crmPointsById = new Map([
    ['c1', crm('c1', { has_custom_schedule: true, custom_open_time: '08:00', custom_close_time: '20:00' })],
    ['c2', crm('c2', { has_custom_schedule: false, custom_open_time: '08:00', custom_close_time: '20:00' })],
    ['c3', crm('c3', { has_custom_schedule: true, custom_open_time: '08:00' })],
  ]);
  const rows = buildScheduleCache(matches, crmPointsById);
  assert.deepEqual(rows, [{ locationId: 'l1', openMin: 480, closeMin: 1200 }]);
});
