const test = require('node:test');
const assert = require('node:assert/strict');
const { requiredConfig, minimalStation, fetchStations } = require('../platform/siis-client');

test('exige las tres variables de conexión SIIS', () => {
  assert.throws(() => requiredConfig({}), /SIISS_URL, SIISS_USER, SIISS_PASS/);
});

test('no conserva campos adicionales de la estación', () => {
  assert.deepEqual(minimalStation({ estacodi: 7, estanomb: ' Punto ', estaping: 1, secreto: 'no' }), { estacodi: '7', estanomb: 'Punto', estaping: 1 });
});

test('autentica y obtiene estaciones sin exponer el token', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('login')) return { ok: true, json: async () => ({ token: 'token-prueba' }) };
    return { ok: true, json: async () => [{ estacodi: '001', estanomb: 'Uno', estaping: 1, extra: 'omitido' }] };
  };
  const stations = await fetchStations({ env: { SIISS_URL: 'http://siiss.local/', SIISS_USER: 'usuario', SIISS_PASS: 'clave', SIISS_TIMEOUT_MS: '2000' }, fetchImpl });
  assert.deepEqual(stations, [{ estacodi: '001', estanomb: 'Uno', estaping: 1 }]);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer token-prueba');
});
