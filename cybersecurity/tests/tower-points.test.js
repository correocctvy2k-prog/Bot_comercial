const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { openCyberDatabase } = require('../db/open-database');
const { loadTowerSeed } = require('../src/tower-seed');
const { importDssDeviceRegistry } = require('../src/dss-importer');
const { getTowerPoints, protectedAlias } = require('../src/cybersecurity-read-model');

const seedRows = [
  { torre: 'Torre Uno', gateway: '10.10.10.1/24', deviceName: 'Tienda A', haplite: '10.10.10.11', isTower: true },
  { torre: 'Torre Uno', gateway: '10.10.10.1/24', deviceName: 'Cam SMD Tienda A', haplite: '10.10.10.11', isTower: true },
  { torre: 'Torre Uno', gateway: '10.10.10.1/24', deviceName: 'Tienda B', haplite: '10.10.10.12', isTower: true },
  { torre: 'Torre Uno', gateway: '10.10.11.1/24', deviceName: 'Oficina Torre Uno', haplite: '10.10.11.5', isTower: true },
  { torre: 'No es una torre (celda Edificio Ppal)', gateway: '10.10.30.1/24', deviceName: 'Tienda D', haplite: '10.10.30.11', isTower: false },
];

function seedDssSourceDb(rows) {
  const sourceDb = new DatabaseSync(':memory:');
  sourceDb.exec(`
    CREATE TABLE dss_device_registry (
      dss_identifier TEXT PRIMARY KEY, physical_site_id TEXT, device_name TEXT NOT NULL,
      device_type TEXT, model TEXT, ip_address TEXT, organization TEXT,
      match_method TEXT NOT NULL, confidence REAL NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE',
      observed_at TEXT NOT NULL
    );
  `);
  const insert = sourceDb.prepare(`
    INSERT INTO dss_device_registry(dss_identifier, device_name, device_type, model, ip_address, organization, match_method, confidence, status, observed_at)
    VALUES (?, ?, ?, ?, ?, ?, 'NAME_ZONE_UNIQUE', 1, 'ACTIVE', ?)
  `);
  for (const row of rows) insert.run(row.id, row.deviceName, row.deviceType, row.model, row.ipAddress, row.organization, row.observedAt);
  return sourceDb;
}

function withDatabase(run) {
  const db = openCyberDatabase();
  try {
    return run(db);
  } finally {
    db.close();
  }
}

test('getTowerPoints agrupa la semilla por IP y cruza con DSS, sin depender de FortiGate', () => withDatabase((db) => {
  loadTowerSeed({ db, rows: seedRows });
  const sourceDb = seedDssSourceDb([
    { id: '1', deviceName: 'Tienda A', deviceType: 'NVR', model: 'DHI-NVR4208', ipAddress: '10.10.10.11', organization: 'Zona X', observedAt: '2026-09-18T10:00:00.000Z' },
    { id: '2', deviceName: 'Cam SMD Tienda A', deviceType: 'IPC', model: 'DH-IPC-HDBW', ipAddress: '10.10.10.11', organization: 'Zona X', observedAt: '2026-09-18T10:00:00.000Z' },
  ]);
  try {
    importDssDeviceRegistry({ db, sourceDb, importedAt: '2026-09-18T12:00:00.000Z' });
  } finally {
    sourceDb.close();
  }

  const result = getTowerPoints(db);
  assert.equal(result.towers.length, 2);

  const torreUno = result.towers.find((tower) => tower.name === 'Torre Uno');
  assert.equal(torreUno.isTower, true);
  assert.equal(torreUno.pointCount, 3);
  assert.equal(torreUno.pointsWithoutDssCount, 2, 'Tienda B y Oficina Torre Uno no tienen dispositivo DSS todavia');
  assert.deepEqual([...torreUno.gatewayCidrs].sort(), ['10.10.10.1/24', '10.10.11.1/24'], 'una torre con mas de un gateway real expone todos');

  const puntoA = torreUno.points.find((point) => point.haplite.ip === '10.10.10.11');
  assert.deepEqual(puntoA.names.sort(), ['Cam SMD Tienda A', 'Tienda A']);
  assert.equal(puntoA.dssDevices.length, 2);
  assert.equal(puntoA.haplite.observedByFortigate, false);
  assert.equal(puntoA.haplite.lifecycleStatus, null);

  const puntoB = torreUno.points.find((point) => point.haplite.ip === '10.10.10.12');
  assert.deepEqual(puntoB.names, ['Tienda B']);
  assert.equal(puntoB.dssDevices.length, 0);

  const celda = result.towers.find((tower) => tower.name.startsWith('No es una torre'));
  assert.equal(celda.isTower, false);
  assert.equal(celda.pointCount, 1);
}));

test('getTowerPoints corrobora un hAP lite cuando FortiGate sí lo observa (caso raro)', () => withDatabase((db) => {
  loadTowerSeed({ db, rows: seedRows });
  db.prepare(`INSERT INTO cyber_source_systems(id, source_type, display_name, authority_level, created_at, updated_at)
    VALUES ('source-forti','FORTIGATE','Firewall inventory','OBSERVATIONAL','2026-09-18T00:00:00Z','2026-09-18T00:00:00Z')`).run();
  db.prepare(`INSERT INTO cyber_source_snapshots(id, source_system_id, captured_at, imported_at, source_sha256, processing_status)
    VALUES ('snap-forti','source-forti','2026-09-18T00:00:00Z','2026-09-18T00:00:00Z',?, 'SUCCESS')`).run('a'.repeat(64));
  db.prepare(`INSERT INTO cyber_asset_observations(id, snapshot_id, source_record_key, observed_at, ingested_at, ip_value, hostname_raw, hostname_key)
    VALUES ('obs-forti-1','snap-forti','rec-1','2026-09-18T00:00:00Z','2026-09-18T00:00:00Z','10.10.10.12','mikrotik-b','mikrotik-b')`).run();

  const result = getTowerPoints(db);
  const torreUno = result.towers.find((tower) => tower.name === 'Torre Uno');
  const puntoB = torreUno.points.find((point) => point.haplite.ip === '10.10.10.12');
  assert.equal(puntoB.haplite.observedByFortigate, true);
  assert.ok(puntoB.haplite.lifecycleStatus, 'debe traer un lifecycleStatus cuando FortiGate sí corrobora');
}));

test('un punto de la semilla sin dispositivo DSS ni FortiGate se muestra igual, sin inventar datos', () => withDatabase((db) => {
  loadTowerSeed({ db, rows: seedRows });
  const result = getTowerPoints(db);
  const torreUno = result.towers.find((tower) => tower.name === 'Torre Uno');
  const puntoB = torreUno.points.find((point) => point.haplite.ip === '10.10.10.12');
  assert.deepEqual(puntoB.dssDevices, []);
  assert.equal(puntoB.haplite.observedByFortigate, false);
}));

test('los alias de torre son estables (protectedAlias)', () => withDatabase((db) => {
  loadTowerSeed({ db, rows: seedRows });
  const result = getTowerPoints(db);
  const torreUno = result.towers.find((tower) => tower.name === 'Torre Uno');
  const towerRow = db.prepare('SELECT id FROM cyber_towers WHERE name = ?').get('Torre Uno');
  assert.equal(torreUno.id, protectedAlias('tower', towerRow.id));
}));
