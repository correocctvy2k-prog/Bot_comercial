'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isOperationalOpeningSignal,
  asOperationalOpeningEvidence,
  isOperationalOpeningEvidence,
  interpretPointDay,
} = require('../platform/operational-event-policy');
const { loadWindowConfig, parseWindow, inWindow } = require('../platform/window-config');

const CFG = loadWindowConfig({});
const T = (hhmm) => `2026-09-10T${hhmm}:00-05:00`; // hora local Bogotá

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

test('reconoce una evidencia derivada como apertura durante la correlación', () => {
  assert.equal(isOperationalOpeningEvidence({ eventType: 'TRIPWIRE', evidenceType: 'OPENING' }), true);
  assert.equal(isOperationalOpeningEvidence({ eventType: 'TRIPWIRE' }), false);
});

// --- spec 0010: interpretación por ventanas + ping -----------------------

test('ventanas: parseo y pertenencia', () => {
  assert.deepEqual(parseWindow('05:00-09:30'), { startMin: 300, endMin: 570 });
  assert.equal(inWindow(420, { startMin: 300, endMin: 570 }), true); // 07:00
  assert.equal(inWindow(600, { startMin: 300, endMin: 570 }), false); // 10:00
  assert.equal(parseWindow('nope'), null);
});

test('detección matinal "DESCONOCIDO" + ping = Apertura mañana, sin inconsistencia', () => {
  const r = interpretPointDay({
    locationId: 'OFI', name: 'OFICINA PRINCIPAL', coverage: 'WITH_CCTV',
    events: [{ id: 1, eventType: 'DESCONOCIDO', phase: 'INICIO', at: T('06:45') }],
    pings: [{ at: T('06:10'), online: 0 }, { at: T('06:40'), online: 1 }, { at: T('08:00'), online: 1 }],
  }, CFG);
  assert.ok(r.phases.APERTURA_MANANA);
  assert.equal(r.phases.APERTURA_MANANA.source, 'PING');
  assert.equal(r.phases.APERTURA_MANANA.evidence.id, 1);
  assert.equal(r.notificationConfigInconsistency, false);
  assert.equal(r.interpretation, 'NORMAL');
});

test('evento CLOSING a las 07:15 no crea cierre: cuenta como actividad de apertura', () => {
  const r = interpretPointDay({
    locationId: 'X', name: 'X', coverage: 'WITH_CCTV',
    events: [{ id: 9, eventType: 'CLOSING', phase: 'INICIO', at: T('07:15') }],
    pings: [],
  }, CFG);
  assert.equal(r.phases.APERTURA_MANANA.source, 'CCTV');
  assert.ok(!r.phases.CIERRE_MEDIODIA); // ventana de mediodía desactivada por defecto
  assert.equal(r.phases.CIERRE_NOCHE, null);
  assert.equal(r.eventPhases[9], 'APERTURA_MANANA');
});

test('ventana CIERRE_MEDIODIA desactivada por defecto, activable por env', () => {
  assert.equal(loadWindowConfig({}).windows.CIERRE_MEDIODIA, undefined);
  const on = loadWindowConfig({ CCTV_WIN_CLOSE_MIDDAY: '13:00-14:00' });
  assert.deepEqual(
    { startMin: on.windows.CIERRE_MEDIODIA.startMin, endMin: on.windows.CIERRE_MEDIODIA.endMin, kind: on.windows.CIERRE_MEDIODIA.kind },
    { startMin: 780, endMin: 840, kind: 'CLOSE' },
  );
});

test('presencia de ping en ventana de cierre NO crea cierre (solo transición o CCTV)', () => {
  const r = interpretPointDay({
    locationId: 'X', name: 'X', coverage: 'PING_ONLY',
    events: [],
    // el punto sigue online toda la ventana de cierre noche: seguía operando, no cerró
    pings: [{ at: T('18:30'), online: 1 }, { at: T('21:00'), online: 1 }],
  }, CFG);
  assert.equal(r.phases.CIERRE_NOCHE, null);
});

test('todas las detecciones del punto en la ventana quedan clasificadas (no solo la representativa)', () => {
  const r = interpretPointDay({
    locationId: 'OFI', name: 'OFICINA PRINCIPAL', coverage: 'WITH_CCTV',
    events: [
      { id: 'a', eventType: 'OPENING', phase: 'INICIO', at: T('06:45') },
      { id: 'b', eventType: 'DESCONOCIDO', phase: 'INICIO', at: T('07:10') },
      { id: 'c', eventType: 'DESCONOCIDO', phase: 'INICIO', at: T('07:25') },
    ],
    pings: [{ at: T('06:10'), online: 0 }, { at: T('06:40'), online: 1 }],
  }, CFG);
  assert.equal(r.eventPhases.a, 'APERTURA_MANANA');
  assert.equal(r.eventPhases.b, 'APERTURA_MANANA');
  assert.equal(r.eventPhases.c, 'APERTURA_MANANA');
});

test('detección fuera de las 4 ventanas = anomalía', () => {
  const r = interpretPointDay({
    locationId: 'X', name: 'X', coverage: 'WITH_CCTV',
    events: [{ id: 7, eventType: 'APERTURA', phase: 'INICIO', at: T('23:30') }],
    pings: [],
  }, CFG);
  assert.equal(r.anomalies.length, 1);
  assert.equal(r.anomalies[0].kind, 'DETECTION_OUT_OF_WINDOW');
});

test('punto CON CCTV: ping sin correo en la ventana = inconsistencia de configuración', () => {
  const r = interpretPointDay({
    locationId: 'X', name: 'X', coverage: 'WITH_CCTV',
    events: [],
    pings: [{ at: T('06:00'), online: 0 }, { at: T('06:30'), online: 1 }],
  }, CFG);
  assert.deepEqual(r.missingDetections, ['APERTURA_MANANA']);
  assert.equal(r.notificationConfigInconsistency, true);
  assert.equal(r.phases.APERTURA_MANANA.source, 'PING');
});

test('punto SIN CCTV (PING_ONLY): nunca marca inconsistencia', () => {
  const r = interpretPointDay({
    locationId: 'X', name: 'X', coverage: 'PING_ONLY',
    events: [],
    pings: [{ at: T('06:00'), online: 0 }, { at: T('06:30'), online: 1 }],
  }, CFG);
  assert.equal(r.notificationConfigInconsistency, false);
  assert.deepEqual(r.missingDetections, []);
  assert.ok(r.phases.APERTURA_MANANA);
});

test('actividad nocturna sin apertura = CIERRE_SIN_APERTURA', () => {
  const r = interpretPointDay({
    locationId: 'X', name: 'X', coverage: 'PING_ONLY',
    events: [],
    pings: [{ at: T('19:00'), online: 1 }, { at: T('20:10'), online: 0 }],
  }, CFG);
  assert.ok(r.phases.CIERRE_NOCHE);
  assert.equal(r.phases.APERTURA_MANANA, null);
  assert.equal(r.interpretation, 'CIERRE_SIN_APERTURA');
});

test('apertura tardía (dentro de la gracia): fase asignada con lateBy en minutos', () => {
  const r = interpretPointDay({
    locationId: 'X', name: 'X', coverage: 'PING_ONLY',
    events: [],
    pings: [{ at: T('09:00'), online: 0 }, { at: T('10:00'), online: 1 }], // ventana AM 05:00-09:30, gracia hasta 12:00
  }, CFG);
  assert.ok(r.phases.APERTURA_MANANA);
  assert.equal(r.phases.APERTURA_MANANA.lateBy, 30); // 10:00 vs fin 09:30
  assert.equal(r.interpretation, 'NORMAL');
});

test('apertura fuera de toda gracia (03:00) = anomalía, sin fase', () => {
  const r = interpretPointDay({
    locationId: 'X', name: 'X', coverage: 'WITH_CCTV',
    events: [{ id: 3, eventType: 'APERTURA', phase: 'INICIO', at: T('03:00') }],
    pings: [],
  }, CFG);
  assert.equal(r.phases.APERTURA_MANANA, null);
  assert.equal(r.anomalies.length, 1);
});

// --- spec 0012: horario real por punto (customSchedule) afina lateBy -----------------

test('con horario real, "a tiempo" se mide contra el horario del punto, no la ventana global', () => {
  // ventana global AM termina a las 09:30 (570 min); el punto abre normalmente a las 07:00 (420 min)
  const r = interpretPointDay({
    locationId: 'X', name: 'X', coverage: 'PING_ONLY', customSchedule: { openMin: 420, closeMin: 1260 },
    events: [],
    pings: [{ at: T('06:30'), online: 0 }, { at: T('07:15'), online: 1 }], // dentro de la ventana global, pero 15 min tarde para el punto
  }, CFG);
  assert.equal(r.phases.APERTURA_MANANA.lateBy, 15); // 07:15 vs 07:00 real, no vs 09:30 global
});

test('con horario real, cierre temprano se mide contra el cierre del punto', () => {
  const r = interpretPointDay({
    locationId: 'X', name: 'X', coverage: 'PING_ONLY', customSchedule: { openMin: 420, closeMin: 1260 }, // cierra 21:00
    events: [],
    pings: [{ at: T('20:30'), online: 1 }, { at: T('20:40'), online: 0 }], // cerró 20:40, 20 min antes de lo real
  }, CFG);
  assert.equal(r.phases.CIERRE_NOCHE.lateBy, 20);
});

test('sin horario real, se mantiene el comportamiento de la ventana global', () => {
  const r = interpretPointDay({
    locationId: 'X', name: 'X', coverage: 'PING_ONLY',
    events: [],
    pings: [{ at: T('06:30'), online: 0 }, { at: T('07:15'), online: 1 }],
  }, CFG);
  assert.equal(r.phases.APERTURA_MANANA.lateBy, 0); // 07:15 está dentro de la ventana global 05:00-09:30
});
