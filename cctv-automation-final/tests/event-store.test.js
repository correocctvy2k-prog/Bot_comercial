const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { persistClassifiedEmails } = require("../eventStore");

function memoryDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE locations(id TEXT PRIMARY KEY,canonical_name TEXT,active INTEGER);
    CREATE TABLE location_aliases(location_id TEXT,source_system TEXT,alias_key TEXT);
    CREATE TABLE cctv_events(id TEXT PRIMARY KEY,source_system TEXT,source_event_id TEXT,location_id TEXT,asset_id TEXT,channel_id TEXT,event_type TEXT,event_phase TEXT,occurred_at TEXT,received_at TEXT,severity TEXT,raw_reference TEXT,payload_json TEXT,UNIQUE(source_system,source_event_id));`);
  db.prepare("INSERT INTO locations VALUES('loc-1','Tienda Uribe',1)").run();
  db.prepare("INSERT INTO location_aliases VALUES('loc-1','EMAIL_DAHUA','TIENDA URIBE')").run();
  return db;
}

function memoryDbWithAsset() {
  const db = memoryDb();
  db.exec(`CREATE TABLE assets(id TEXT PRIMARY KEY,location_id TEXT,ip_address TEXT,lifecycle_status TEXT);`);
  db.prepare("INSERT INTO assets VALUES('asset-1','loc-1','192.168.44.19','ACTIVE')").run();
  return db;
}

test("persiste por UID de forma idempotente y relaciona identidad exacta", () => {
  const db = memoryDb();
  const item = { categoria: "APERTURA", tienda: "Tienda Uribe", canal: "Pto_Venta", timestamp: new Date("2026-08-21T07:30:00-05:00"), email: { uid: 92052, subject: "NVR Tienda Uribe", from: "nvr@example.test", date: new Date("2026-08-21T12:30:05Z") } };
  const first = persistClassifiedEmails([item], { db, folder: "INBOX" });
  const second = persistClassifiedEmails([item], { db, folder: "INBOX" });
  assert.equal(first.inserted, 1);
  assert.equal(second.existing, 1);
  const stored = db.prepare("SELECT * FROM cctv_events").get();
  assert.equal(stored.source_event_id, "INBOX:92052");
  assert.equal(stored.location_id, "loc-1");
  assert.equal(stored.event_type, "OPENING");
  assert.equal(JSON.parse(stored.payload_json).identityStatus, "LINKED_EXACT");
});

test("conserva descartes y eventos sin identidad para revisión", () => {
  const db = memoryDb();
  const item = { categoria: "DESCARTADO", motivo: "Correo de prueba", email: { uid: 8, subject: "Prueba", date: new Date("2026-08-21T10:00:00Z") } };
  const result = persistClassifiedEmails([item], { db, folder: "INBOX" });
  assert.equal(result.discarded, 1);
  assert.equal(result.unlinked, 1);
  const stored = db.prepare("SELECT event_type,severity,payload_json FROM cctv_events").get();
  assert.equal(stored.event_type, "DISCARDED");
  assert.equal(JSON.parse(stored.payload_json).reason, "Correo de prueba");
});

test("relaciona por IP exacta cuando el nombre del correo es genérico", () => {
  const db = memoryDbWithAsset();
  const item = { categoria: "EVENTO_ADICIONAL", tipo: "ALARMA_LOCAL", tienda: "Desconocido", timestamp: new Date("2026-08-27T09:03:15-05:00"), email: { uid: 92591, subject: "IPC Message", sourceIp: "192.168.44.19", date: new Date("2026-08-27T14:03:16Z") } };
  const result = persistClassifiedEmails([item], { db, folder: "INBOX" });
  assert.equal(result.linked, 1);
  const stored = db.prepare("SELECT location_id,payload_json FROM cctv_events").get();
  assert.equal(stored.location_id, "loc-1");
  assert.equal(JSON.parse(stored.payload_json).identityMethod, "IP_EXACT");
});
