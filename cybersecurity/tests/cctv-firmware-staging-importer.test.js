const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { openCyberDatabase } = require('../db/open-database');
const {
  findLatestSuccessfulRun, readCctvFirmwareStaging, summarizeCctvFirmwareStaging, importCctvFirmwareStaging,
} = require('../src/cctv-firmware-staging-importer');

// Simula el subconjunto real de stg_inventory_locations/import_runs de
// cctv-automation-final (platform/schema.sql) que este importador de verdad lee --
// solo lectura, nunca escribe ahí.
function seedSourceDb({ runs, rows }) {
  const sourceDb = new DatabaseSync(':memory:');
  sourceDb.exec(`
    CREATE TABLE import_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT, completed_at TEXT, status TEXT
    );
    CREATE TABLE stg_inventory_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_run_id INTEGER NOT NULL,
      location_name_raw TEXT,
      haplite_ip TEXT,
      recorder_ip TEXT,
      recorder_port TEXT,
      nat_status TEXT,
      firmware_raw TEXT,
      camera_firmware_raw TEXT,
      recorder_model TEXT,
      dss_identifier TEXT,
      quality_flags TEXT
    );
  `);
  const insertRun = sourceDb.prepare('INSERT INTO import_runs(id, started_at, completed_at, status) VALUES (?, ?, ?, ?)');
  for (const run of runs) insertRun.run(run.id, run.startedAt || run.completedAt, run.completedAt, run.status || 'SUCCESS');
  const insertRow = sourceDb.prepare(`
    INSERT INTO stg_inventory_locations(import_run_id, location_name_raw, haplite_ip, recorder_ip, recorder_port, nat_status, firmware_raw, camera_firmware_raw, recorder_model, dss_identifier, quality_flags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    insertRow.run(
      row.importRunId, row.locationNameRaw, row.haploteIp || null, row.recorderIp || null, row.recorderPort || null,
      row.natStatus || null, row.firmwareRaw || null, row.cameraFirmwareRaw || null, row.recorderModel || null,
      row.dssIdentifier || null, row.qualityFlags || null,
    );
  }
  return sourceDb;
}

const sampleRuns = [
  { id: 1, completedAt: '2026-08-20T14:41:27.585Z', status: 'SUCCESS' },
  { id: 2, completedAt: '2026-08-27T16:25:05.543Z', status: 'SUCCESS' },
];

const sampleRows = [
  // corrida vieja (id 1) -- debe ignorarse, solo cuenta la más reciente
  { importRunId: 1, locationNameRaw: 'Tienda A (vieja)', haploteIp: '192.168.44.11', firmwareRaw: '3.000.0000.0.R' },
  // corrida más reciente (id 2)
  { importRunId: 2, locationNameRaw: 'Tienda A', haploteIp: '192.168.44.11', firmwareRaw: '5.001.0000000.2.R 31-03-2026', recorderModel: 'DHI-NVR4208' },
  { importRunId: 2, locationNameRaw: 'Tienda B', haploteIp: '192.168.44.22', firmwareRaw: null, recorderModel: null },
  { importRunId: 2, locationNameRaw: 'Sin IP conocida', haploteIp: null, firmwareRaw: '4.000.0000.0.R' },
];

function withDatabase(run) {
  const db = openCyberDatabase();
  try {
    return run(db);
  } finally {
    db.close();
  }
}

test('resume stg_inventory_locations de la corrida más reciente, ignora filas sin haplite_ip', () => {
  const sourceDb = seedSourceDb({ runs: sampleRuns, rows: sampleRows });
  const latestRun = findLatestSuccessfulRun(sourceDb);
  assert.equal(latestRun.id, 2);
  const rows = readCctvFirmwareStaging(sourceDb, latestRun.id);
  assert.equal(rows.length, 2); // Tienda A + Tienda B de la corrida 2, la corrida 1 y la fila sin IP quedan fuera
  const summary = summarizeCctvFirmwareStaging(rows);
  assert.equal(summary.total, 2);
  assert.equal(summary.withFirmware, 1);
  assert.equal(summary.withRecorderModel, 1);
  sourceDb.close();
});

test('importa stg_inventory_locations como fuente CCTV_STAGING no verificada', () => withDatabase((db) => {
  const sourceDb = seedSourceDb({ runs: sampleRuns, rows: sampleRows });
  try {
    const result = importCctvFirmwareStaging({ db, sourceDb, importedAt: '2026-09-21T10:00:00.000Z' });
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.inserted, 2);
    assert.equal(
      db.prepare("SELECT authority_level AS authorityLevel FROM cyber_source_systems WHERE id = 'source-cctv-staging'").get().authorityLevel,
      'OBSERVATIONAL',
    );

    const observations = db.prepare('SELECT ip_value AS ipValue, hostname_raw AS hostnameRaw, quality_flags_json AS flags, sanitized_attributes_json AS attrs FROM cyber_asset_observations ORDER BY hostname_raw').all();
    assert.equal(observations.length, 2);

    const tiendaA = observations.find((row) => row.hostnameRaw === 'Tienda A');
    assert.equal(tiendaA.ipValue, '192.168.44.11');
    assert.match(tiendaA.flags, /CCTV_STAGING_UNVERIFIED/);
    assert.doesNotMatch(tiendaA.flags, /MISSING_FIRMWARE/);
    const attrsA = JSON.parse(tiendaA.attrs);
    assert.equal(attrsA.firmwareRaw, '5.001.0000000.2.R 31-03-2026');
    assert.equal(attrsA.recorderModel, 'DHI-NVR4208');

    const tiendaB = observations.find((row) => row.hostnameRaw === 'Tienda B');
    assert.match(tiendaB.flags, /MISSING_FIRMWARE/);

    // la fuente sigue siendo la única fuente de verdad -- el importador nunca escribió ahí
    assert.equal(sourceDb.prepare('SELECT count(*) AS c FROM stg_inventory_locations').get().c, 4);
  } finally {
    sourceDb.close();
  }
}));

test('la importación de firmware staging es idempotente por hash del contenido leído', () => withDatabase((db) => {
  const sourceDb = seedSourceDb({ runs: sampleRuns, rows: sampleRows });
  try {
    const first = importCctvFirmwareStaging({ db, sourceDb });
    const second = importCctvFirmwareStaging({ db, sourceDb });
    assert.equal(first.status, 'SUCCESS');
    assert.equal(second.status, 'ALREADY_IMPORTED');
    assert.equal(db.prepare('SELECT count(*) AS c FROM cyber_asset_observations').get().c, 2);
  } finally {
    sourceDb.close();
  }
}));

test('rechaza una fuente sin ninguna corrida exitosa', () => withDatabase((db) => {
  const sourceDb = seedSourceDb({ runs: [], rows: [] });
  try {
    assert.throws(() => importCctvFirmwareStaging({ db, sourceDb }), /no successful import_runs/);
  } finally {
    sourceDb.close();
  }
}));

test('rechaza una corrida sin ninguna fila con haplite_ip', () => withDatabase((db) => {
  const sourceDb = seedSourceDb({ runs: [{ id: 1, completedAt: '2026-08-20T14:41:27.585Z' }], rows: [{ importRunId: 1, locationNameRaw: 'Sin IP', haploteIp: null }] });
  try {
    assert.throws(() => importCctvFirmwareStaging({ db, sourceDb }), /no rows with haplite_ip/);
  } finally {
    sourceDb.close();
  }
}));
