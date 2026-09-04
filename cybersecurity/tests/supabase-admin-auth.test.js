const test = require('node:test');
const assert = require('node:assert/strict');
const { bearerToken, createSupabaseAdminAuthorizer } = require('../src/supabase-admin-auth');

test('extrae un bearer sin aceptar otros esquemas', () => {
  assert.equal(bearerToken({ headers: { authorization: 'Bearer abc' } }), 'abc');
  assert.equal(bearerToken({ headers: { authorization: 'Basic abc' } }), null);
});

test('confirma usuario y rol superadmin del lado servidor', async () => {
  const calls = [];
  const authorize = createSupabaseAdminAuthorizer({ url: 'https://example.test', key: 'server-key', fetchImpl: async (url) => {
    calls.push(url);
    return url.includes('/auth/v1/user')
      ? { ok: true, json: async () => ({ id: 'user-1' }) }
      : { ok: true, json: async () => ([{ roles: { name: 'superadmin' } }]) };
  } });
  assert.deepEqual(await authorize({ headers: { authorization: 'Bearer user-token' } }), { id: 'user-1', role: 'superadmin' });
  assert.equal(calls.length, 2);
});
