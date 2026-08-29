'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isOperationalOpeningSignal,
  asOperationalOpeningEvidence,
} = require('../platform/operational-event-policy');

test('conserva apertura explícita como señal operacional', () => {
  assert.equal(isOperationalOpeningSignal({ eventType: 'OPENING' }), true);
});

test('interpreta inicio de cruce de línea y cable trampa como apertura', () => {
  assert.equal(isOperationalOpeningSignal({ eventType: 'TRIPWIRE', phase: 'INICIO' }), true);
  assert.equal(isOperationalOpeningSignal({ eventType: 'CABLE_TRAMPA', phase: 'INICIO' }), true);
});

test('no interpreta fases fin ni otros eventos como apertura', () => {
  assert.equal(isOperationalOpeningSignal({ eventType: 'TRIPWIRE', phase: 'FIN' }), false);
  assert.equal(isOperationalOpeningSignal({ eventType: 'CABLE_TRAMPA', phase: 'FIN' }), false);
  assert.equal(isOperationalOpeningSignal({ eventType: 'ALARMA_LOCAL', phase: 'INICIO' }), false);
});

test('deriva la interpretación sin perder el tipo técnico original', () => {
  const evidence = asOperationalOpeningEvidence({ eventType: 'TRIPWIRE', phase: 'INICIO' });
  assert.equal(evidence.evidenceType, 'OPENING');
  assert.equal(evidence.operationalInterpretation, 'FIRST_OPENING');
  assert.equal(evidence.operationalSourceType, 'TRIPWIRE');
  assert.equal(evidence.eventType, 'TRIPWIRE');
});
