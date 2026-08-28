const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeName, similarity } = require('../platform/normalize');

test('normaliza tildes, puntuación y valores nulos', () => {
  assert.equal(normalizeName('  Galería_Cande '), 'GALERIA CANDE');
  assert.equal(normalizeName(null), '');
});

test('puntúa alto variantes operativas del mismo punto', () => {
  assert.ok(similarity('Calle Comercio K35', 'Calle Comercio(K35)') >= 0.95);
  assert.ok(similarity('La 19 con 35 NVR', 'La 19 con 35 - ok horario DHI-NVR5208-EI') >= 0.8);
});

test('no fuerza coincidencias entre puntos sin relación clara', () => {
  assert.ok(similarity('Belalcazar', 'Oficina Palmira') < 0.72);
});
