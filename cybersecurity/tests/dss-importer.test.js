const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { openCyberDatabase } = require('../db/open-database');
const { importDssDeviceRegistry, summarizeDssDevices } = require('../src/dss-importer');

// Simula la tabla real de cctv-automation-final (platform/schema.sql:285) -- este
// importador solo hace SELECT, nunca escribe ahí, así que basta con las columnas que
// de verdad se leen.
function seedSourceDb(rows) {
  const sourceDb = new DatabaseSync(':memory:');
  sourceDb.exec(`
    CREATE TABLE dss_device_registry (
      dss_identifier TEXT PRIMARY KEY,
      physical_site_id TEXT,
      device_name TEXT NOT NULL,
      device_type TEXT,
      model TEXT,
      ip_address TEXT,
      organization TEXT,
      match_method TEXT NOT NULL,
      confidence REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      observed_at TEXT NOT NULL
    );
  `);
  const insert = sourceDb.prepare(`
    INSERT INTO dss_device_registry(dss_identifier, physical_site_id, device_name, device_type, model, ip_address, organization, match_method, confidence, status, observed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    insert.run(
      row.dssIdentifier, row.physicalSiteId || null, row.deviceName, row.deviceType, row.model,
      row.ipAddress || null, row.organization, row.matchMethod || 'NAME_ZONE_UNIQUE', row.confidence ?? 1,
      row.status || 'ACTIVE', row.observedAt,
    );
  }
  return sourceDb;
}

const sampleRows = [
  { dssIdentifier: '1000001', deviceName: 'Tienda A', deviceType: 'NVR', model: 'DHI-NVR4208', ipAddress: '10.10.10.11', organization: 'Zona/Torre Uno', observedAt: '2026-09-18T10:00:00.000Z' },
  { dssIdentifier: '1000002', deviceName: 'Cam SMD Tienda A', deviceType: 'IPC', model: 'DH-IPC-HDBW', ipAddress: '10.10.10.11', organization: 'Zona/Torre Uno', observedAt: '2026-09-18T10:00:00.000Z' },
  { dssIdentifier: '1000003', deviceName: 'Alarma Torre Dos', deviceType: 'Alarm Controller', model: 'DHI-ARC3000H', ipAddress: null, organization: 'Zona/Torre Dos', observedAt: '2026-09-17T09:00:00.000Z' },
];

function withDatabase(run) {
  const db = openCyberDatabase();
  try {
    return run(db);
  } finally {
    db.close();
  }
}

test('resume dss_device_registry por tipo y cobertura de IP', () => {
  const sourceDb = seedSourceDb(sampleRows);
  const summary = summarizeDssDevices(sourceDb.prepare(`
    SELECT dss_identifier AS dssIdentifier, device_type AS deviceType, ip_address AS ipAddress FROM dss_device_registry
  `).all());
  assert.equal(summary.total, 3);
  assert.equal(summary.withIp, 2);
  assert.deepEqual(summary.byType, { NVR: 1, IPC: 1, 'Alarm Controller': 1 });
  sourceDb.close();
});

test('importa dss_device_registry como fuente corroborante DSS, solo lectura sobre la fuente', () => withDatabase((db) => {
  const sourceDb = seedSourceDb(sampleRows);
  try {
    const result = importDssDeviceRegistry({ db, sourceDb, importedAt: '2026-09-18T12:00:00.000Z' });
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.inserted, 3);
    assert.equal(db.prepare("SELECT authority_level AS authorityLevel FROM cyber_source_systems WHERE id = 'source-dss'").get().authorityLevel, 'CORROBORATING');

    const observations = db.prepare('SELECT ip_value AS ipValue, hostname_raw AS hostnameRaw, manufacturer, device_class_raw AS deviceClassRaw, quality_flags_json AS flags FROM cyber_asset_observations ORDER BY hostname_raw').all();
    assert.equal(observations.length, 3);
    const nvr = observations.find((row) => row.hostnameRaw === 'Tienda A');
    assert.equal(nvr.ipValue, '10.10.10.11');
    assert.equal(nvr.manufacturer, 'Dahua');
    assert.equal(nvr.deviceClassRaw, 'NVR');
    assert.doesNotMatch(nvr.flags, /MISSING_IP/);

    const alarm = observations.find((row) => row.hostnameRaw === 'Alarma Torre Dos');
    assert.equal(alarm.ipValue, null);
    assert.match(alarm.flags, /MISSING_IP/);

    // la fuente sigue siendo la única fuente de verdad -- el importador nunca escribió ahí
    assert.equal(sourceDb.prepare('SELECT count(*) AS c FROM dss_device_registry').get().c, 3);
  } finally {
    sourceDb.close();
  }
}));

test('la importación DSS es idempotente por hash del contenido leído', () => withDatabase((db) => {
  const sourceDb = seedSourceDb(sampleRows);
  try {
    const first = importDssDeviceRegistry({ db, sourceDb });
    const second = importDssDeviceRegistry({ db, sourceDb });
    assert.equal(first.status, 'SUCCESS');
    assert.equal(second.status, 'ALREADY_IMPORTED');
    assert.equal(db.prepare('SELECT count(*) AS c FROM cyber_asset_observations').get().c, 3);
  } finally {
    sourceDb.close();
  }
}));

test('rechaza un dss_device_registry vacío en vez de importar una fuente sin datos', () => withDatabase((db) => {
  const sourceDb = seedSourceDb([]);
  try {
    assert.throws(() => importDssDeviceRegistry({ db, sourceDb }), /dss_device_registry is empty/);
  } finally {
    sourceDb.close();
  }
}));
