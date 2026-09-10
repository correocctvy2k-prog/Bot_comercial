'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { pointState, buildZoneBoards } = require('../platform/zone-boards');

const day = (over = {}) => ({ locationId: 'x', name: 'X', phases: {}, anomalies: [], interpretation: 'NORMAL', ...over });

test('pointState: ANOMALY gana sobre todo', () => {
  assert.equal(pointState(day({ interpretation: 'CIERRE_SIN_APERTURA', phases: { APERTURA_MANANA: { lateBy: 0 } } })), 'ANOMALY');
  assert.equal(pointState(day({ anomalies: [{ kind: 'DETECTION_OUT_OF_WINDOW' }] })), 'ANOMALY');
});

test('pointState: LATE si abrió con retraso, aun habiendo cerrado', () => {
  assert.equal(pointState(day({ phases: { APERTURA_MANANA: { lateBy: 12 }, CIERRE_NOCHE: { at: 't' } } })), 'LATE');
});

test('pointState: CLOSED si cerró y abrió a tiempo', () => {
  assert.equal(pointState(day({ phases: { APERTURA_MANANA: { lateBy: 0 }, CIERRE_NOCHE: { at: 't' } } })), 'CLOSED');
});

test('pointState: ON_TIME si abrió a tiempo y no ha cerrado', () => {
  assert.equal(pointState(day({ phases: { APERTURA_MANANA: { lateBy: 0 } } })), 'ON_TIME');
});

test('pointState: IDLE si sin actividad', () => {
  assert.equal(pointState(day({ interpretation: 'SIN_ACTIVIDAD' })), 'IDLE');
});

test('buildZoneBoards agrupa, cuenta y ordena; "Sin zona" al final', () => {
  const days = [
    day({ locationId: 'a', name: 'A', phases: { APERTURA_MANANA: { lateBy: 0, at: '1' } } }),        // PALMIRA ON_TIME
    day({ locationId: 'b', name: 'B', phases: { APERTURA_MANANA: { lateBy: 20, at: '2' } } }),       // PALMIRA LATE
    day({ locationId: 'c', name: 'C', interpretation: 'SIN_ACTIVIDAD' }),                            // ROZO IDLE
    day({ locationId: 'd', name: 'D', anomalies: [{ k: 1 }] }),                                       // Sin zona ANOMALY
  ];
  const zoneByLoc = new Map([['a', 'PALMIRA'], ['b', 'PALMIRA'], ['c', 'ROZO'], ['d', null]]);
  const boards = buildZoneBoards(days, zoneByLoc);

  assert.deepEqual(boards.map((b) => b.zone), ['PALMIRA', 'ROZO', null]);
  const palmira = boards[0];
  assert.equal(palmira.total, 2);
  assert.deepEqual(palmira.counts, { ON_TIME: 1, LATE: 1, CLOSED: 0, IDLE: 0, ANOMALY: 0 });
  // dentro del tablero, LATE (prioridad mayor) va antes que ON_TIME
  assert.deepEqual(palmira.points.map((p) => p.state), ['LATE', 'ON_TIME']);
  assert.equal(boards[2].counts.ANOMALY, 1);
});
