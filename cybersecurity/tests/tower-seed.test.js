const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');
const { loadTowerSeed } = require('../src/tower-seed');

const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'torres-haplite-anonymized.json'),
  'utf8',
));

function withDatabase(run) {
  const db = openCyberDatabase();
  try {
    return run(db);
  } finally {
    db.close();
  }
}

test('carga torres y puntos reales, con isTower correcto para la celda que no es torre', () => withDatabase((db) => {
  const result = loadTowerSeed({ db, rows: fixture });
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.towers, 3);
  assert.equal(result.points, 6);
  assert.equal(result.gateways, 4);

  const towers = db.prepare('SELECT name, gateway_cidr AS gatewayCidr, is_tower AS isTower FROM cyber_towers ORDER BY name').all().map((row) => ({ ...row }));
  assert.deepEqual(towers, [
    { name: 'No es una torre (celda Edificio Ppal)', gatewayCidr: '10.10.30.1/24', isTower: 0 },
    { name: 'Torre Ejemplo Dos', gatewayCidr: '10.10.20.1/24', isTower: 1 },
    { name: 'Torre Ejemplo Uno', gatewayCidr: '10.10.10.1/24', isTower: 1 },
  ]);
}));

test('una torre con más de un gateway real guarda todos, no solo el representativo', () => withDatabase((db) => {
  loadTowerSeed({ db, rows: fixture });
  const towerId = db.prepare("SELECT id FROM cyber_towers WHERE name = 'Torre Ejemplo Uno'").get().id;
  const gateways = db.prepare('SELECT cidr FROM cyber_tower_gateways WHERE tower_id = ? ORDER BY cidr').all(towerId).map((row) => row.cidr);
  assert.deepEqual(gateways, ['10.10.10.1/24', '10.10.11.1/24']);
}));

test('cargar la semilla dos veces no duplica gateways', () => withDatabase((db) => {
  loadTowerSeed({ db, rows: fixture });
  loadTowerSeed({ db, rows: fixture });
  assert.equal(db.prepare('SELECT count(*) AS c FROM cyber_tower_gateways').get().c, 4);
}));

test('dos dispositivos con la misma IP de hAP lite (NVR + cámara) no se pisan entre sí', () => withDatabase((db) => {
  loadTowerSeed({ db, rows: fixture });
  const points = db.prepare(`
    SELECT point_name AS pointName, haplite_ip AS haplite
    FROM cyber_tower_points
    WHERE haplite_ip = '10.10.10.11'
    ORDER BY point_name
  `).all().map((row) => ({ ...row }));
  assert.deepEqual(points, [
    { pointName: 'Cam SMD Tienda A', haplite: '10.10.10.11' },
    { pointName: 'Tienda A', haplite: '10.10.10.11' },
  ]);
}));

test('cargar la misma semilla dos veces es idempotente (no duplica torres ni puntos)', () => withDatabase((db) => {
  loadTowerSeed({ db, rows: fixture });
  const second = loadTowerSeed({ db, rows: fixture });
  assert.equal(second.status, 'SUCCESS');

  const towerCount = db.prepare('SELECT count(*) AS c FROM cyber_towers').get().c;
  const pointCount = db.prepare('SELECT count(*) AS c FROM cyber_tower_points').get().c;
  assert.equal(towerCount, 3);
  assert.equal(pointCount, 6);
}));

test('rechaza filas sin los campos requeridos', () => withDatabase((db) => {
  assert.throws(() => loadTowerSeed({ db, rows: [{ torre: 'X', gateway: '1.2.3.4/24' }] }), /invalid seed row/);
}));

test('rechaza un arreglo vacío', () => withDatabase((db) => {
  assert.throws(() => loadTowerSeed({ db, rows: [] }), /non-empty array/);
}));
