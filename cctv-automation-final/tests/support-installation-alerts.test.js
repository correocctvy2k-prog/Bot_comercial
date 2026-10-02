'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { pendingAlerts, scheduledAlerts, dismissAlert, reopenAlert } = require('../platform/support-installation-alerts');

function memoryDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE locations(id TEXT PRIMARY KEY, siis_code TEXT, canonical_name TEXT, zone TEXT, cctv_coverage_status TEXT, active INTEGER);
    CREATE TABLE audit_log(id TEXT PRIMARY KEY, entity_type TEXT, entity_id TEXT, action TEXT, actor TEXT, occurred_at TEXT, source_system TEXT, before_json TEXT, after_json TEXT, correlation_id TEXT);
    CREATE TABLE support_cards(
      id TEXT PRIMARY KEY, source_system TEXT, active INTEGER, activity_type TEXT, status TEXT,
      title_raw TEXT, source_card_url TEXT, members_json TEXT,
      due_at TEXT, start_at TEXT, source_updated_at TEXT
    );
    CREATE TABLE support_card_locations(card_id TEXT NOT NULL, location_id TEXT NOT NULL, link_source TEXT, created_at TEXT, PRIMARY KEY(card_id,location_id));
    CREATE TABLE support_installation_alert_dismissals(
      card_id TEXT NOT NULL, location_id TEXT NOT NULL, reason TEXT,
      decided_by TEXT NOT NULL, decided_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY(card_id, location_id)
    );
  `);
  db.prepare("INSERT INTO locations VALUES('loc-sin-cctv','SIIS-1','Punto Sin CCTV','Zona A','NONE',1)").run();
  db.prepare("INSERT INTO locations VALUES('loc-con-cctv','SIIS-2','Punto Con CCTV','Zona A','ACTIVE',1)").run();
  return db;
}

function insertCard(db, { id, activityType = 'INSTALLATION', status = 'COMPLETED', dueAt = null, startAt = null, updatedAt = '2026-09-01T00:00:00Z', members = [] }) {
  db.prepare(`INSERT INTO support_cards(id,source_system,active,activity_type,status,title_raw,source_card_url,members_json,due_at,start_at,source_updated_at)
    VALUES(?,?,1,?,?,?,?,?,?,?,?)`).run(id, 'TRELLO_SUPPORT', activityType, status, `Tarjeta ${id}`, `https://trello.com/c/${id}`, JSON.stringify(members), dueAt, startAt, updatedAt);
}
function linkCard(db, cardId, locationId) {
  db.prepare("INSERT INTO support_card_locations VALUES(?,?,'MATCHED',?)").run(cardId, locationId, new Date().toISOString());
}

test('pendingAlerts: detecta tarjeta INSTALLATION vinculada a un punto sin CCTV', () => {
  const db = memoryDb();
  insertCard(db, { id: 'card-1' });
  linkCard(db, 'card-1', 'loc-sin-cctv');

  const alerts = pendingAlerts(db);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].locationId, 'loc-sin-cctv');
  assert.equal(alerts[0].cardId, 'card-1');
});

test('pendingAlerts: ignora tarjetas de otros tipos y puntos ya con CCTV', () => {
  const db = memoryDb();
  insertCard(db, { id: 'card-general', activityType: 'GENERAL_SUPPORT' });
  linkCard(db, 'card-general', 'loc-sin-cctv');
  insertCard(db, { id: 'card-ya-cubierto' });
  linkCard(db, 'card-ya-cubierto', 'loc-con-cctv');

  assert.deepEqual(pendingAlerts(db), []);
});

test('pendingAlerts: captura miembros y fecha operacional (due > start > última actividad)', () => {
  const db = memoryDb();
  insertCard(db, { id: 'card-start', startAt: '2026-09-03T13:00:00Z', updatedAt: '2026-10-01T00:00:00Z', members: [{ id: 'm1', name: 'Juan Técnico' }] });
  linkCard(db, 'card-start', 'loc-sin-cctv');

  const [alert] = pendingAlerts(db);
  assert.equal(alert.operationalAt, '2026-09-03T13:00:00Z');
  assert.deepEqual(alert.members, [{ id: 'm1', name: 'Juan Técnico' }]);
});

test('dismissAlert oculta la alerta; reopenAlert la reactiva', () => {
  const db = memoryDb();
  insertCard(db, { id: 'card-1' });
  linkCard(db, 'card-1', 'loc-sin-cctv');
  assert.equal(pendingAlerts(db).length, 1);

  dismissAlert(db, { cardId: 'card-1', locationId: 'loc-sin-cctv', reason: 'No aplica', actor: 'tester' });
  assert.deepEqual(pendingAlerts(db), []);

  const { reopened } = reopenAlert(db, { cardId: 'card-1', locationId: 'loc-sin-cctv', actor: 'tester' });
  assert.equal(reopened, true);
  assert.equal(pendingAlerts(db).length, 1);
});

test('dismissAlert es idempotente (llamarlo dos veces no duplica fila ni falla)', () => {
  const db = memoryDb();
  insertCard(db, { id: 'card-1' });
  linkCard(db, 'card-1', 'loc-sin-cctv');

  dismissAlert(db, { cardId: 'card-1', locationId: 'loc-sin-cctv', reason: 'Primero', actor: 'a' });
  dismissAlert(db, { cardId: 'card-1', locationId: 'loc-sin-cctv', reason: 'Segundo', actor: 'b' });

  const row = db.prepare('SELECT * FROM support_installation_alert_dismissals WHERE card_id=? AND location_id=?').get('card-1', 'loc-sin-cctv');
  assert.equal(row.reason, 'Segundo');
  assert.equal(row.decided_by, 'b');
});

test('pendingAlerts: ignora tarjetas aun en "Lista de tareas pendientes" (status PENDING) -- caso real "avenida la victoria"', () => {
  const db = memoryDb();
  insertCard(db, { id: 'card-pendiente', status: 'PENDING', updatedAt: '2023-12-21T20:46:56Z' });
  linkCard(db, 'card-pendiente', 'loc-sin-cctv');

  assert.deepEqual(pendingAlerts(db), []);
});

test('scheduledAlerts: detecta tarjetas de instalacion aun pendientes (no ejecutadas) sobre puntos sin CCTV', () => {
  const db = memoryDb();
  insertCard(db, { id: 'card-pendiente', status: 'PENDING', updatedAt: '2023-12-21T20:46:56Z' });
  linkCard(db, 'card-pendiente', 'loc-sin-cctv');
  insertCard(db, { id: 'card-realizada', status: 'COMPLETED' });
  linkCard(db, 'card-realizada', 'loc-sin-cctv');

  const scheduled = scheduledAlerts(db);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].cardId, 'card-pendiente');
  assert.equal(pendingAlerts(db).length, 1);
  assert.equal(pendingAlerts(db)[0].cardId, 'card-realizada');
});

test('dismissAlert tambien oculta una alerta programada (scheduledAlerts) descartada', () => {
  const db = memoryDb();
  insertCard(db, { id: 'card-pendiente', status: 'PENDING' });
  linkCard(db, 'card-pendiente', 'loc-sin-cctv');
  assert.equal(scheduledAlerts(db).length, 1);

  dismissAlert(db, { cardId: 'card-pendiente', locationId: 'loc-sin-cctv', reason: 'Duplicada', actor: 'tester' });
  assert.deepEqual(scheduledAlerts(db), []);
});

test('una tarjeta ligada a varios puntos sin CCTV genera una alerta por punto', () => {
  const db = memoryDb();
  db.prepare("INSERT INTO locations VALUES('loc-sin-cctv-2','SIIS-3','Otro Punto Sin CCTV','Zona B','NONE',1)").run();
  insertCard(db, { id: 'card-multi' });
  linkCard(db, 'card-multi', 'loc-sin-cctv');
  linkCard(db, 'card-multi', 'loc-sin-cctv-2');

  const alerts = pendingAlerts(db);
  assert.equal(alerts.length, 2);
  assert.deepEqual(alerts.map((a) => a.locationId).sort(), ['loc-sin-cctv', 'loc-sin-cctv-2']);
});
