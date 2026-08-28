const test = require('node:test');
const assert = require('node:assert/strict');
const { asSiisCode, normalizeSiisSnapshot } = require('../platform/siis');

test('conserva el código SIIS como texto', () => {
  assert.equal(asSiisCode(' 00123 '), '00123');
  assert.equal(asSiisCode(123), '123');
});

test('normaliza nombre y estado de una estación', () => {
  const [row] = normalizeSiisSnapshot([{ estacodi: '001', estanomb: ' Galería ', estaping: 1 }]);
  assert.deepEqual({ code: row.siisCode, nameKey: row.nameKey, online: row.online, flags: row.qualityFlags }, { code: '001', nameKey: 'GALERIA', online: true, flags: [] });
});

test('marca códigos ausentes, duplicados y estados inválidos', () => {
  const rows = normalizeSiisSnapshot([
    { estacodi: '10', estanomb: 'A', estaping: 0 },
    { estacodi: '10', estanomb: 'B', estaping: 7 },
    { estanomb: 'C' },
  ]);
  assert.ok(rows[1].qualityFlags.includes('DUPLICATE_SIIS_CODE'));
  assert.ok(rows[1].qualityFlags.includes('INVALID_PING_STATE'));
  assert.ok(rows[2].qualityFlags.includes('MISSING_SIIS_CODE'));
});

test('rechaza respuestas con forma inesperada', () => {
  assert.throws(() => normalizeSiisSnapshot({ estaciones: [] }), /arreglo/);
});
