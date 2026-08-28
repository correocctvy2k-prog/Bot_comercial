const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('la migración contempla ubicación compartida y alta idempotente', () => {
  const source = fs.readFileSync('platform/migrate-crm-installations.js', 'utf8');
  assert.match(source, /SHARED_DOUBLE/);
  assert.match(source, /crm_point_id TEXT NOT NULL UNIQUE/);
  assert.match(source, /idempotency_key TEXT NOT NULL UNIQUE/);
  assert.match(source, /BEGIN IMMEDIATE/);
  assert.match(source, /audit_log/);
});

