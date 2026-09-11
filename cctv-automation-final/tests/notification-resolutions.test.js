'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const {
  normalizeResolveInput,
  loadActiveResolutions,
  insertResolution,
  reopenResolutions,
} = require('../platform/notification-resolutions');

function memoryDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE locations(id TEXT PRIMARY KEY, canonical_name TEXT, active INTEGER);
    CREATE TABLE audit_log(id TEXT PRIMARY KEY, entity_type TEXT, entity_id TEXT, action TEXT, actor TEXT, occurred_at TEXT, source_system TEXT, before_json TEXT, after_json TEXT, correlation_id TEXT);
    CREATE TABLE cctv_notification_resolutions (
      id TEXT PRIMARY KEY, location_id TEXT NOT NULL,
      resolution TEXT NOT NULL, scope TEXT NOT NULL, effective_date TEXT, note TEXT,
      decided_by TEXT NOT NULL, decided_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
    );
  `);
  db.prepare("INSERT INTO locations VALUES('loc-1','A',1)").run();
  db.prepare("INSERT INTO locations VALUES('loc-2','B',1)").run();
  return db;
}

test('normalizeResolveInput: rechaza resolution inválida', () => {
  assert.throws(() => normalizeResolveInput({ resolution: 'NOPE' }, '2026-09-10'), /resolution debe ser/);
});

test('normalizeResolveInput: PING_ONLY y MISCONFIGURED son PERSISTENT sin fecha', () => {
  assert.deepEqual(normalizeResolveInput({ resolution: 'PING_ONLY' }, '2026-09-10'),
    { resolution: 'PING_ONLY', scope: 'PERSISTENT', effectiveDate: null, note: null });
  assert.equal(normalizeResolveInput({ resolution: 'MISCONFIGURED_NO_NOTIFY' }, '2026-09-10').scope, 'PERSISTENT');
});

test('normalizeResolveInput: FALSE_POSITIVE es DATE; usa hoy si no dan fecha válida', () => {
  assert.deepEqual(normalizeResolveInput({ resolution: 'FALSE_POSITIVE' }, '2026-09-10'),
    { resolution: 'FALSE_POSITIVE', scope: 'DATE', effectiveDate: '2026-09-10', note: null });
  assert.equal(normalizeResolveInput({ resolution: 'FALSE_POSITIVE', effectiveDate: '2026-09-01' }, '2026-09-10').effectiveDate, '2026-09-01');
});

test('loadActiveResolutions clasifica por tipo y respeta la fecha del FALSE_POSITIVE', () => {
  const db = memoryDb();
  insertResolution(db, { locationId: 'loc-1', ...normalizeResolveInput({ resolution: 'PING_ONLY' }, '2026-09-10'), actor: 't' });
  insertResolution(db, { locationId: 'loc-2', ...normalizeResolveInput({ resolution: 'MISCONFIGURED_NO_NOTIFY' }, '2026-09-10'), actor: 't' });
  insertResolution(db, { locationId: 'loc-2', ...normalizeResolveInput({ resolution: 'FALSE_POSITIVE', effectiveDate: '2026-09-10' }, '2026-09-10'), actor: 't' });

  const onDay = loadActiveResolutions(db, '2026-09-10');
  assert.deepEqual([...onDay.pingOnlyForced], ['loc-1']);
  assert.deepEqual([...onDay.followUp], ['loc-2']);
  assert.deepEqual([...onDay.silenced], ['loc-2']);

  const otherDay = loadActiveResolutions(db, '2026-09-11');
  assert.equal(otherDay.silenced.size, 0); // el FALSE_POSITIVE solo aplica a su fecha
  assert.equal(otherDay.pingOnlyForced.size, 1); // los persistentes siguen
});

test('insertResolution es idempotente entre activas', () => {
  const db = memoryDb();
  const a = insertResolution(db, { locationId: 'loc-1', ...normalizeResolveInput({ resolution: 'PING_ONLY' }, '2026-09-10'), actor: 't' });
  const b = insertResolution(db, { locationId: 'loc-1', ...normalizeResolveInput({ resolution: 'PING_ONLY' }, '2026-09-10'), actor: 't' });
  assert.equal(a.reused, false);
  assert.equal(b.reused, true);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cctv_notification_resolutions').get().n, 1);
});

test('reopenResolutions desactiva las activas del punto', () => {
  const db = memoryDb();
  insertResolution(db, { locationId: 'loc-1', ...normalizeResolveInput({ resolution: 'PING_ONLY' }, '2026-09-10'), actor: 't' });
  assert.equal(reopenResolutions(db, { locationId: 'loc-1', actor: 't' }).reopened, 1);
  assert.equal(loadActiveResolutions(db, '2026-09-10').pingOnlyForced.size, 0);
  assert.equal(reopenResolutions(db, { locationId: 'loc-1', actor: 't' }).reopened, 0); // ya no hay activas
});
