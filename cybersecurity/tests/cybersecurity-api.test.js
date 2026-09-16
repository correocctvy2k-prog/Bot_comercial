const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');
const { createCybersecurityApi } = require('../src/cybersecurity-api');
const { openInventoryDecisionStore, getDecisionByObservationId } = require('../src/inventory-decision-store');
const { importGreenboneProtectedResults } = require('../src/greenbone-protected-importer');
const { importFortiGateInventory } = require('../src/fortigate-importer');
const {
  getCybersecurityOverview, getInventoryOverview, getRemediationCase,
  listInventoryCandidates, listNetworkSegments, listRemediationCases,
  protectedAlias,
} = require('../src/cybersecurity-read-model');

const fixture = fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'greenbone-protected-anonymized.json'), 'utf8',
);
const fortigateFixture = fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'fortigate-anonymized.txt'), 'utf8',
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

// Regresión: el router devolvía 405 METHOD_NOT_ALLOWED para CUALQUIER POST antes de
// llegar siquiera a evaluar las rutas de promote/conflict/protect (solo policy/disposition
// se resolvían antes de ese guard) — Promover/Marcar conflicto/Marcar protegido nunca
// respondían desde el navegador, con o sin sesión de superadmin.
function seedCandidateObservation(db) {
  const now = '2026-09-01T12:00:00.000Z';
  db.prepare(`INSERT INTO cyber_source_systems(id, source_type, display_name, authority_level, created_at, updated_at)
    VALUES ('source-forti','FORTIGATE','Firewall inventory','OBSERVATIONAL',?,?)`).run(now, now);
  db.prepare(`INSERT INTO cyber_source_snapshots(id, source_system_id, captured_at, imported_at, source_sha256, processing_status)
    VALUES ('snapshot-1','source-forti',?,?,?,'SUCCESS')`).run(now, now, 'a'.repeat(64));
  const id = 'observation-api-1';
  db.prepare(`INSERT INTO cyber_asset_observations(
      id, snapshot_id, source_record_key, observed_at, ingested_at, ip_value, mac_value, hostname_raw
    ) VALUES (?, 'snapshot-1', 'rec-1', ?, ?, '10.2.6.15', '02:00:00:aa:bb:cc', 'host-01')`)
    .run(id, now, now);
  return id;
}

test('promote/conflict/protect responden (no 405) con sesión de superadmin, y 403 sin ella', async () => {
  const db = seededDatabase();
  const decisionsDb = openInventoryDecisionStore(':memory:');
  const observationId = seedCandidateObservation(db);
  const alias = protectedAlias('candidate', observationId);
  const server = createCybersecurityApi({ db, decisionsDb, authorizeAdmin: async (request) => (request.headers.authorization === 'Bearer valid-test-token' ? { id: 'tester' } : false) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const encoded = encodeURIComponent(alias);
    const noAuth = await fetch(`http://127.0.0.1:${port}/api/cybersecurity/inventory/candidates/${encoded}/conflict`, { method: 'POST' });
    assert.equal(noAuth.status, 403, 'sin sesión debe ser 403, nunca 405');

    const conflict = await fetch(`http://127.0.0.1:${port}/api/cybersecurity/inventory/candidates/${encoded}/conflict`, {
      method: 'POST', headers: { Authorization: 'Bearer valid-test-token' },
    });
    assert.equal(conflict.status, 200);
    assert.equal(getDecisionByObservationId(decisionsDb, observationId).decision, 'CONFLICT');
  } finally {
    await new Promise((resolve) => server.close(resolve)); db.close(); decisionsDb.close();
  }
});

// Regresión 2026-09-16 (3er reporte del usuario, 500 Internal Server Error): promote fallaba
// contra cyber-inventory.db real porque el servidor la abre de solo lectura (ver
// inventory-decision-store.js) -- sin decisionsDb configurado, la ruta debe responder 503, no
// intentar escribir ahí y reventar con un 500 críptico.
test('promote/conflict/protect responden 503 si el almacén de decisiones no está configurado', async () => {
  const db = seededDatabase();
  const observationId = seedCandidateObservation(db);
  const alias = protectedAlias('candidate', observationId);
  const server = createCybersecurityApi({ db, authorizeAdmin: async () => ({ id: 'tester' }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const promote = await fetch(`http://127.0.0.1:${port}/api/cybersecurity/inventory/candidates/${encodeURIComponent(alias)}/promote`, {
      method: 'POST', headers: { Authorization: 'Bearer valid-test-token' },
    });
    assert.equal(promote.status, 503);
    assert.equal((await promote.json()).error, 'DECISION_STORE_NOT_READY');
  } finally {
    await new Promise((resolve) => server.close(resolve)); db.close();
  }
});

// Regresión real de flujo completo (2026-09-16, reportada con captura + logs de nginx): la UI
// nunca vuelve a usar el alias con el que pidió el detalle -- pide GET .../candidates/{alias},
// y para Promover/Marcar conflicto/Marcar protegido usa el `id` que trae ESA respuesta. Si el
// backend devuelve ahí el id crudo interno en vez del alias, este flujo (el que en verdad hace
// el navegador) se rompe con 405, aunque el test anterior (que arma el alias él mismo, sin
// pasar por GET) pase perfecto.
test('el flujo real del navegador (GET detalle, reusar su id para promover) funciona de punta a punta', async () => {
  const db = seededDatabase();
  const decisionsDb = openInventoryDecisionStore(':memory:');
  const observationId = seedCandidateObservation(db);
  const listAlias = protectedAlias('candidate', observationId);
  const server = createCybersecurityApi({ db, decisionsDb, authorizeAdmin: async (request) => (request.headers.authorization === 'Bearer valid-test-token' ? { id: 'tester' } : false) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const detailResponse = await fetch(`http://127.0.0.1:${port}/api/cybersecurity/inventory/candidates/${encodeURIComponent(listAlias)}`);
    assert.equal(detailResponse.status, 200);
    const detail = await detailResponse.json();
    assert.equal(detail.id, listAlias, 'el id que trae el detalle debe ser el mismo alias con el que se pidió, no el id crudo');

    const promote = await fetch(`http://127.0.0.1:${port}/api/cybersecurity/inventory/candidates/${encodeURIComponent(detail.id)}/promote`, {
      method: 'POST', headers: { Authorization: 'Bearer valid-test-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ note: 'Serv OpenVAS Piloto' }),
    });
    assert.equal(promote.status, 200, 'debe ser 200, no 405 -- este es exactamente el bug reportado');
    assert.equal((await promote.json()).item.success, true);

    // Regresión 2026-09-16 (3er reporte, 500 real en el navegador): después de promover, tanto
    // el detalle como la lista deben mostrar el candidato como CANONICAL usando decisionsDb, no
    // volver a mostrarlo como NEW_ASSET_REVIEW.
    const detailAfter = await fetch(`http://127.0.0.1:${port}/api/cybersecurity/inventory/candidates/${encodeURIComponent(listAlias)}`);
    const detailAfterBody = await detailAfter.json();
    assert.equal(detailAfterBody.kind, 'CANONICAL');
    assert.equal(detailAfterBody.id, listAlias);

    const listResponse = await fetch(`http://127.0.0.1:${port}/api/cybersecurity/inventory/candidates?state=CANONICAL`);
    const list = await listResponse.json();
    assert.ok(list.items.some((item) => item.id === listAlias), 'el candidato promovido debe aparecer al filtrar state=CANONICAL');
  } finally {
    await new Promise((resolve) => server.close(resolve)); db.close(); decisionsDb.close();
  }
});

// Regresión 2026-09-15: getInventoryOverview().totals.conflicts sumaba
// cyber_inventory_analysis_items de TODOS los snapshots de FortiGate alguna vez importados,
// no solo el más reciente -- invisible mientras solo existió un snapshot por fuente; al
// reimportar (misma fuente, snapshot nuevo) los conflictos de la captura ya superada seguían
// contando, duplicando el total real.
test('getInventoryOverview solo cuenta conflictos del snapshot más reciente por fuente', () => {
  const db = openCyberDatabase();
  try {
    const first = importFortiGateInventory({
      db, text: fortigateFixture,
      capturedAt: '2026-08-29T16:00:00.000Z', importedAt: '2026-08-29T16:05:00.000Z',
      custodyReference: 'restricted://fixture/old',
    });
    const laterText = fortigateFixture.replace('System time: Sat Aug 29 11:00:00 2026', 'System time: Mon Sep 15 09:00:00 2026');
    const second = importFortiGateInventory({
      db, text: laterText,
      capturedAt: '2026-09-15T14:00:00.000Z', importedAt: '2026-09-15T14:05:00.000Z',
      custodyReference: 'restricted://fixture/new',
    });

    // Simula un conflicto real solo en el snapshot VIEJO (ya superado por el nuevo import).
    const oldObservation = db.prepare('SELECT id FROM cyber_asset_observations WHERE snapshot_id = ? LIMIT 1').get(first.snapshotId);
    const runId = 'analysis-test-old';
    db.prepare(`INSERT INTO cyber_inventory_analysis_runs (id, snapshot_id, policy_version, started_at, completed_at, status)
      VALUES (?, ?, 'inventory-confidence-v2', ?, ?, 'SUCCESS')`)
      .run(runId, first.snapshotId, '2026-08-29T17:00:00.000Z', '2026-08-29T17:00:00.000Z');
    db.prepare(`INSERT INTO cyber_inventory_analysis_items (analysis_run_id, observation_id, provisional_asset_class, identity_strength, proposed_action, confidence, reason_codes_json, created_at)
      VALUES (?, ?, 'OTHER', 'LOW', 'CONFLICT_REVIEW', 0.5, '[]', ?)`)
      .run(runId, oldObservation.id, '2026-08-29T17:00:00.000Z');

    assert.equal(db.prepare("SELECT count(*) n FROM cyber_inventory_analysis_items WHERE proposed_action = 'CONFLICT_REVIEW'").get().n, 1, 'precondición: hay 1 conflicto guardado, pero pertenece al snapshot viejo');
    const overview = getInventoryOverview(db);
    assert.equal(overview.totals.conflicts, 0, 'el conflicto del snapshot superado no debe contarse en el total actual');
  } finally { db.close(); }
});

test('la lista de segmentos no expone identificadores de red', () => {
  const db = seededDatabase();
  try {
    const segments = listNetworkSegments(db);
    assert.equal(segments.total, 0);
    assert.deepEqual(segments.items, []);
  } finally { db.close(); }
});
