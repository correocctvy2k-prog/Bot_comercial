const test = require('node:test');
const assert = require('node:assert/strict');
const { diffSiissStatus, syncSiissPoints } = require('../platform/siis-points-sync');

test('cruza por siiss_id y refresca siiss_last_sync', () => {
  const stations = [{ siisCode: '001', online: true }, { siisCode: '002', online: false }];
  const crmPoints = [{ id: 'a', siiss_id: '001', siiss_active: false }, { id: 'b', siiss_id: '002', siiss_active: true }];
  const updates = diffSiissStatus(stations, crmPoints, '2026-09-22T00:00:00.000Z');
  assert.deepEqual(updates, [
    { crmPointId: 'a', patch: { siiss_last_sync: '2026-09-22T00:00:00.000Z', siiss_active: true } },
    { crmPointId: 'b', patch: { siiss_last_sync: '2026-09-22T00:00:00.000Z', siiss_active: false } },
  ]);
});

test('sin match en SIIS no genera actualización', () => {
  const updates = diffSiissStatus([{ siisCode: '001', online: true }], [{ id: 'a', siiss_id: '999' }]);
  assert.deepEqual(updates, []);
});

test('punto sin siiss_id se ignora', () => {
  const updates = diffSiissStatus([{ siisCode: '001', online: true }], [{ id: 'a', siiss_id: null }]);
  assert.deepEqual(updates, []);
});

test('estaping desconocido (online null) refresca solo siiss_last_sync, no pisa siiss_active', () => {
  const updates = diffSiissStatus([{ siisCode: '001', online: null }], [{ id: 'a', siiss_id: '001', siiss_active: true }], '2026-09-22T00:00:00.000Z');
  assert.deepEqual(updates, [{ crmPointId: 'a', patch: { siiss_last_sync: '2026-09-22T00:00:00.000Z' } }]);
});

test('syncSiissPoints exige SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY', async () => {
  await assert.rejects(() => syncSiissPoints({ env: {} }), /SUPABASE_URL/);
});

test('syncSiissPoints: ciclo completo con fetch simulado (login, estaciones, lectura y escritura Supabase)', async () => {
  const patched = [];
  const fetchImpl = async (url, options) => {
    if (url.includes('siiss-login')) return { ok: true, json: async () => ({ token: 't' }) };
    if (url.includes('estacionesByPing')) return { ok: true, json: async () => ([{ estacodi: '001', estanomb: 'Uno', estaping: 1 }, { estacodi: '002', estanomb: 'Dos', estaping: 0 }]) };
    if (options?.method === 'PATCH') { patched.push({ url, body: JSON.parse(options.body) }); return { ok: true, json: async () => ([]) }; }
    return { ok: true, json: async () => ([{ id: 'a', siiss_id: '001', siiss_active: false }, { id: 'b', siiss_id: '999', siiss_active: null }]) };
  };
  const env = { SIISS_URL: 'http://siiss.local', SIISS_USER: 'u', SIISS_PASS: 'p', SUPABASE_URL: 'http://supabase.local', SUPABASE_SERVICE_ROLE_KEY: 'k' };
  const summary = await syncSiissPoints({ env, fetchImpl });
  assert.equal(summary.stations, 2);
  assert.equal(summary.crmPoints, 2);
  assert.equal(summary.matched, 1);
  assert.equal(summary.updated, 1);
  assert.deepEqual(summary.errors, []);
  assert.equal(patched.length, 1);
  assert.equal(patched[0].body.siiss_active, true);
});

test('syncSiissPoints: --dry-run no escribe en Supabase', async () => {
  let patchCalled = false;
  const fetchImpl = async (url, options) => {
    if (url.includes('siiss-login')) return { ok: true, json: async () => ({ token: 't' }) };
    if (url.includes('estacionesByPing')) return { ok: true, json: async () => ([{ estacodi: '001', estanomb: 'Uno', estaping: 1 }]) };
    if (options?.method === 'PATCH') { patchCalled = true; return { ok: true, json: async () => ([]) }; }
    return { ok: true, json: async () => ([{ id: 'a', siiss_id: '001', siiss_active: false }]) };
  };
  const env = { SIISS_URL: 'http://siiss.local', SIISS_USER: 'u', SIISS_PASS: 'p', SUPABASE_URL: 'http://supabase.local', SUPABASE_SERVICE_ROLE_KEY: 'k' };
  const summary = await syncSiissPoints({ env, fetchImpl, dryRun: true });
  assert.equal(summary.matched, 1);
  assert.equal(summary.updated, 0);
  assert.equal(patchCalled, false);
});
