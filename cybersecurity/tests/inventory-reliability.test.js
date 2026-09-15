const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeReliabilityScore, detectDeviceGroups, isGenericHostname, isSameDeviceMacPair,
} = require('../src/inventory-reliability');

// Casos reales encontrados en la base local (2026-09-15) al revisar los 12 conflictos de
// Servidores (port3) con el usuario.

test('isSameDeviceMacPair agrupa tarjetas consecutivas del mismo equipo (ANFI-SEG13798, ANFIGANE)', () => {
  assert.equal(isSameDeviceMacPair('70:10:6f:bb:5a:84', '70:10:6f:bb:5a:85'), true);
  assert.equal(isSameDeviceMacPair('14:02:ec:35:5b:14', '14:02:ec:35:5b:16'), true);
});

test('isSameDeviceMacPair NO agrupa dos VM de VirtualBox que comparten fabricante por azar', () => {
  // mismo OUI (08:00:27 = VirtualBox) pero equipos distintos — la distancia real es enorme
  assert.equal(isSameDeviceMacPair('08:00:27:5a:01:15', '08:00:27:b0:fc:5f'), false);
});

test('isGenericHostname detecta hostnames por defecto sin valor de identidad', () => {
  assert.equal(isGenericHostname('linux'), true);
  assert.equal(isGenericHostname(''), true);
  assert.equal(isGenericHostname('ANFIGANE'), false);
});

test('detectDeviceGroups agrupa ANFIGANE (3 tarjetas) y dos equipos "linux" distintos se quedan sueltos', () => {
  const observations = [
    { id: 'a1', hostnameRaw: 'ANFIGANE', macValue: '14:02:ec:35:5b:14', ipValue: '192.168.8.43' },
    { id: 'a2', hostnameRaw: 'ANFIGANE', macValue: '14:02:ec:35:5b:15', ipValue: null },
    { id: 'a3', hostnameRaw: 'ANFIGANE', macValue: '14:02:ec:35:5b:16', ipValue: null },
    { id: 'b1', hostnameRaw: 'linux', macValue: '08:00:27:5a:01:15', ipValue: '192.168.8.90' },
    { id: 'b2', hostnameRaw: 'linux', macValue: '08:00:27:b0:fc:5f', ipValue: '192.168.8.91' },
  ];
  const groups = detectDeviceGroups(observations);
  assert.equal(groups.size, 3, 'las 3 observaciones de ANFIGANE deben agruparse; las 2 de "linux" no');
  assert.equal(groups.get('a1').memberCount, 3);
  assert.equal(groups.get('a1').hasIp, true);
  assert.equal(groups.has('b1'), false);
  assert.equal(groups.has('b2'), false);
});

test('computeReliabilityScore: host estable con hostname real y sin señales de alarma -> ALTA', () => {
  const result = computeReliabilityScore({
    sourceSeenSeconds: 28 * 86400, hostnameRaw: 'NASR', qualityFlags: [], reasonCodes: [],
  }, {});
  assert.equal(result.label, 'ALTA');
  assert.equal(result.needsManualReview, false);
});

test('computeReliabilityScore: recién detectado, MAC aleatoria, sin hostname -> BAJA', () => {
  const result = computeReliabilityScore({
    sourceSeenSeconds: 0, hostnameRaw: null,
    qualityFlags: ['LOCALLY_ADMINISTERED_MAC', 'MISSING_HOSTNAME'], reasonCodes: [],
  }, {});
  assert.equal(result.label, 'BAJA');
});

test('computeReliabilityScore: IP duplicada entre equipos distintos (sin agrupar) dispara needsManualReview', () => {
  const result = computeReliabilityScore({
    sourceSeenSeconds: 5 * 86400, hostnameRaw: 'SERV-ZK', qualityFlags: [],
    reasonCodes: ['DUPLICATE_IP_IN_SNAPSHOT'],
  }, { deviceGroup: null });
  assert.equal(result.needsManualReview, true);
});

test('computeReliabilityScore: IP duplicada SÍ agrupada (misma placa) no penaliza ni marca alerta', () => {
  const grouped = computeReliabilityScore({
    sourceSeenSeconds: 10 * 86400, hostnameRaw: 'ANFIGANE',
    qualityFlags: ['LOCALLY_ADMINISTERED_MAC'], reasonCodes: ['DUPLICATE_IP_IN_SNAPSHOT'],
  }, { deviceGroup: { memberCount: 3 } });
  assert.equal(grouped.needsManualReview, false);
  const ungrouped = computeReliabilityScore({
    sourceSeenSeconds: 10 * 86400, hostnameRaw: 'ANFIGANE',
    qualityFlags: ['LOCALLY_ADMINISTERED_MAC'], reasonCodes: ['DUPLICATE_IP_IN_SNAPSHOT'],
  }, { deviceGroup: null });
  assert.ok(grouped.score > ungrouped.score, 'agrupado debe puntuar mejor que sin agrupar, mismos datos crudos');
});

test('computeReliabilityScore: corroboración cruzada con Kaspersky suma puntos', () => {
  const base = { sourceSeenSeconds: 5 * 86400, hostnameRaw: 'PC-01', qualityFlags: [], reasonCodes: [] };
  const withMatch = computeReliabilityScore(base, { hasCrossSourceMatch: true });
  const withoutMatch = computeReliabilityScore(base, { hasCrossSourceMatch: false });
  assert.ok(withMatch.score > withoutMatch.score);
});
