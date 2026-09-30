const test = require('node:test');
const assert = require('node:assert/strict');
const { openCyberDatabase } = require('../db/open-database');
const { createCybersecurityApi } = require('../src/cybersecurity-api');
const { loadTowerSeed } = require('../src/tower-seed');

const seedRows = [
  { torre: 'Torre Uno', gateway: '10.10.10.1/24', deviceName: 'Tienda A', haplite: '10.10.10.11', isTower: true },
];

test('GET /api/cybersecurity/towers no requiere sesión y devuelve las torres reales', async () => {
  const db = openCyberDatabase();
  loadTowerSeed({ db, rows: seedRows });
  const server = createCybersecurityApi({ db });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/cybersecurity/towers`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.towers.length, 1);
    assert.equal(body.towers[0].name, 'Torre Uno');
    assert.equal(body.towers[0].points[0].haplite.ip, '10.10.10.11');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});
