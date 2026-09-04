const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');
const { createCybersecurityApi } = require('../src/cybersecurity-api');
const { importGreenboneProtectedResults } = require('../src/greenbone-protected-importer');
const {
  getCybersecurityOverview, getInventoryOverview, getRemediationCase,
  listInventoryCandidates, listNetworkSegments, listRemediationCases,
} = require('../src/cybersecurity-read-model');

const fixture = fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'greenbone-protected-anonymized.json'), 'utf8',
);

function seededDatabase() {
  const db = openCyberDatabase();
  importGreenboneProtectedResults({ db, text: fixture });
  return db;
}

test('genera postura y bandeja sin exponer fingerprints', () => {
  const db = seededDatabase();
  try {
    const overview = getCybersecurityOverview(db);
    assert.equal(overview.cases.total, 2);
    assert.equal(overview.cases.critical, 1);
    assert.equal(overview.cases.validationRequired, 1);
    assert.equal(overview.findings.total, 5);
    const cases = listRemediationCases(db);
    assert.equal(cases.length, 2);
    assert.match(cases[0].asset, /^Activo protegido [A-F0-9]{8}$/);
    assert.doesNotMatch(JSON.stringify(cases), /b{64}/);
    const detail = getRemediationCase(db, cases[0].id);
    assert.equal(detail.findings.length, 4);
    assert.equal(detail.priority, 'P1');
  } finally { db.close(); }
});

test('valida filtros de la bandeja', () => {
  const db = seededDatabase();
  try {
    assert.equal(listRemediationCases(db, { priority: 'P1' }).length, 1);
    assert.throws(() => listRemediationCases(db, { priority: 'P0' }), /INVALID_PRIORITY_FILTER/);
    assert.throws(() => listRemediationCases(db, { status: 'DELETED' }), /INVALID_STATUS_FILTER/);
  } finally { db.close(); }
});

test('genera inventario protegido sin exponer fingerprints', () => {
  const db = seededDatabase();
  try {
    const overview = getInventoryOverview(db);
    assert.equal(overview.totals.protectedTargets, 1);
    assert.equal(overview.totals.canonicalAssets, 0);
    const inventory = listInventoryCandidates(db);
    assert.equal(inventory.total, 1);
    assert.equal(inventory.items[0].source, 'GREENBONE');
    assert.match(inventory.items[0].label, /^Objetivo protegido [A-F0-9]{8}$/);
    assert.doesNotMatch(JSON.stringify(inventory), /[a-f0-9]{64}/i);
    assert.throws(() => listInventoryCandidates(db, { source: 'RAW' }), /INVALID_INVENTORY_SOURCE_FILTER/);
  } finally { db.close(); }
});

test('API permite solo GET y responde con cabeceras restrictivas', async () => {
  const db = seededDatabase();
  const server = createCybersecurityApi({ db });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const overview = await fetch(`http://127.0.0.1:${port}/api/cybersecurity/overview`);
    assert.equal(overview.status, 200);
    assert.equal(overview.headers.get('cache-control'), 'no-store');
    assert.equal((await overview.json()).cases.total, 2);
    const inventory = await fetch(`http://127.0.0.1:${port}/api/cybersecurity/inventory/overview`);
    assert.equal(inventory.status, 200);
    assert.equal((await inventory.json()).totals.protectedTargets, 1);
    const forbidden = await fetch(`http://127.0.0.1:${port}/api/cybersecurity/cases`, { method: 'POST' });
    assert.equal(forbidden.status, 405);
    const invalid = await fetch(`http://127.0.0.1:${port}/api/cybersecurity/cases?priority=P0`);
    assert.equal(invalid.status, 400);
    const admin = await fetch(`http://127.0.0.1:${port}/api/cybersecurity/admin/network-segments`);
    assert.equal(admin.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve)); db.close();
  }
});

test('solo un autorizador administrativo puede habilitar referencias internas', async () => {
  const db = seededDatabase();
  const server = createCybersecurityApi({ db, authorizeAdmin: async (request) => request.headers.authorization === 'Bearer valid-test-token' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/cybersecurity/admin/network-segments`, { headers: { Authorization: 'Bearer valid-test-token' } });
    assert.equal(response.status, 200);
  } finally { await new Promise((resolve) => server.close(resolve)); db.close(); }
});

test('la lista de segmentos no expone identificadores de red', () => {
  const db = seededDatabase();
  try {
    const segments = listNetworkSegments(db);
    assert.equal(segments.total, 0);
    assert.deepEqual(segments.items, []);
  } finally { db.close(); }
});
