const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openCyberDatabase } = require('../db/open-database');
const { createCybersecurityApi } = require('../src/cybersecurity-api');
const { openInventoryDecisionStore, getDecisionByObservationId } = require('../src/inventory-decision-store');
const { promoteObservationToAsset, markObservationAsConflict, markObservationAsIgnored } = require('../src/inventory-actions');
const { openNetworkPolicyStore, savePolicy } = require('../src/network-policy-store');
const { importGreenboneProtectedResults } = require('../src/greenbone-protected-importer');
const { importFortiGateInventory } = require('../src/fortigate-importer');
const { matchSnapshots } = require('../src/cross-source-matcher');
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
function seedCandidateObservation(db, overrides = {}) {
  const now = '2026-09-01T12:00:00.000Z';
  if (!db.prepare("SELECT 1 FROM cyber_source_systems WHERE id = 'source-forti'").get()) {
    db.prepare(`INSERT INTO cyber_source_systems(id, source_type, display_name, authority_level, created_at, updated_at)
      VALUES ('source-forti','FORTIGATE','Firewall inventory','OBSERVATIONAL',?,?)`).run(now, now);
    db.prepare(`INSERT INTO cyber_source_snapshots(id, source_system_id, captured_at, imported_at, source_sha256, processing_status)
      VALUES ('snapshot-1','source-forti',?,?,?,'SUCCESS')`).run(now, now, 'a'.repeat(64));
  }
  const id = overrides.id || 'observation-api-1';
  db.prepare(`INSERT INTO cyber_asset_observations(
      id, snapshot_id, source_record_key, observed_at, ingested_at, segment_id, ip_value, mac_value, hostname_raw, hostname_key
    ) VALUES (?, 'snapshot-1', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, `rec-${id}`, now, now, overrides.segmentId || null, overrides.ip || '10.2.6.15', overrides.mac || '02:00:00:aa:bb:cc', overrides.hostname || 'host-01', overrides.hostnameKey || null);
  return id;
}

function seedSegment(db, overrides = {}) {
  const now = '2026-09-01T12:00:00.000Z';
  const id = overrides.id || 'segment-api-1';
  db.prepare(`INSERT INTO cyber_network_segments(id, canonical_name, security_zone, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)`).run(id, overrides.canonicalName || 'AP1PisoSSO', overrides.zone || 'RESTRICTED', now, now);
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

// Regresión 2026-09-16 (reportada por el usuario: "se agregan a la lista, pero los KPIs no se
// actualizan"): canonicalAssets/pendingReview/conflicts se calculaban solo contra
// cyber-inventory.db (de solo lectura), así que promover/proteger/marcar conflicto desde
// decisionsDb nunca los movía -- el candidato aparecía en la lista de canónicos, pero la
// tarjeta "Activos canónicos" seguía en 0 y "Pendientes de revisión" no bajaba.
test('getInventoryOverview refleja promover/marcar conflicto aunque vivan en decisionsDb, no en cyber_assets', () => {
  const db = seededDatabase();
  const decisionsDb = openInventoryDecisionStore(':memory:');
  try {
    const id1 = seedCandidateObservation(db);
    const before = getInventoryOverview(db, decisionsDb);
    assert.equal(before.totals.canonicalAssets, 0);

    promoteObservationToAsset(db, decisionsDb, protectedAlias('candidate', id1), {}, 'tester');
    const afterPromote = getInventoryOverview(db, decisionsDb);
    assert.equal(afterPromote.totals.canonicalAssets, before.totals.canonicalAssets + 1, 'un candidato promovido debe sumar a activos canónicos aunque viva en decisionsDb');
    assert.equal(afterPromote.totals.pendingReview, before.totals.pendingReview - 1, 'un candidato promovido ya no debe contar como pendiente de revisión');

    const id2 = seedCandidateObservation(db, { id: 'observation-api-2', ip: '10.2.6.16', mac: '02:00:00:aa:bb:dd', hostname: 'host-02' });
    markObservationAsConflict(db, decisionsDb, protectedAlias('candidate', id2), {}, 'tester');
    const afterConflict = getInventoryOverview(db, decisionsDb);
    assert.equal(afterConflict.totals.conflicts, before.totals.conflicts + 1, 'un candidato marcado en conflicto a mano debe sumar a conflictos aunque el análisis automático no lo hubiera detectado');
  } finally { db.close(); decisionsDb.close(); }
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

// Pedido del usuario 2026-09-16: "creo que podemos ignorar los identificados de las redes wifi"
// -- listInventoryCandidates debe marcar onWifiSegment=true para un candidato cuyo segmento ya
// tiene una política aplicada en Subredes con networkFunction CORPORATE_WIFI/GUEST_WIFI (dato
// real: así están clasificadas hoy AP1PisoSSO, WIFI INVITADOS, etc.), y false para uno en un
// segmento LAN normal o sin segmento en absoluto. El id interno del segmento nunca se expone.
test('listInventoryCandidates marca onWifiSegment usando la política ya aplicada en Subredes', () => {
  const db = seededDatabase();
  const policyDb = openNetworkPolicyStore(':memory:');
  try {
    const wifiSegmentId = seedSegment(db, { id: 'segment-wifi', canonicalName: 'AP1PisoSSO' });
    const lanSegmentId = seedSegment(db, { id: 'segment-lan', canonicalName: 'VLAN_Comercial' });
    const wifiObservationId = seedCandidateObservation(db, { id: 'observation-wifi', segmentId: wifiSegmentId, ip: '10.50.1.20' });
    const lanObservationId = seedCandidateObservation(db, { id: 'observation-lan', segmentId: lanSegmentId, ip: '10.2.12.20', mac: '02:00:00:aa:bb:ee', hostname: 'host-lan' });

    savePolicy(policyDb, protectedAlias('segment', wifiSegmentId), {
      name: 'AP Piso 1 SSO', zone: 'Edificio Principal Palmira', networkFunction: 'CORPORATE_WIFI',
      technology: 'FORTIAP_WIFI', topology: 'WLAN', addressMode: 'DHCP', population: 'CORPORATE_USERS',
      criticality: 'LOW', networkAddress: '10.50.1.0', prefixLength: 24, gateway: '10.50.1.1',
    }, 'tester');
    savePolicy(policyDb, protectedAlias('segment', lanSegmentId), {
      name: 'VLAN Comercial', zone: 'Edificio Principal Palmira', networkFunction: 'CORPORATE_LAN',
      technology: 'ETHERNET', topology: 'ACCESS_LAN', addressMode: 'STATIC', population: 'CORPORATE_USERS',
      criticality: 'MEDIUM', networkAddress: '10.2.12.0', prefixLength: 24, gateway: '10.2.12.1',
    }, 'tester');

    const list = listInventoryCandidates(db, {}, null, policyDb);
    const wifiItem = list.items.find((item) => item.id === protectedAlias('candidate', wifiObservationId));
    const lanItem = list.items.find((item) => item.id === protectedAlias('candidate', lanObservationId));
    assert.equal(wifiItem.onWifiSegment, true);
    assert.equal(lanItem.onWifiSegment, false);
    assert.equal(wifiItem.segmentId, undefined, 'el id interno del segmento no debe salir en la respuesta');
  } finally { db.close(); policyDb.close(); }
});

// Flujo real del botón "Ignorar" a través del endpoint de lista: un candidato marcado como
// ignorado debe aparecer al filtrar state=IGNORED (para poder auditarlo) y NO al filtrar por
// el estado automático que tenía antes.
test('un candidato ignorado aparece bajo state=IGNORED en la lista, con su nota', () => {
  const db = seededDatabase();
  const decisionsDb = openInventoryDecisionStore(':memory:');
  try {
    const observationId = seedCandidateObservation(db);
    const alias = protectedAlias('candidate', observationId);
    markObservationAsIgnored(db, decisionsDb, alias, { note: 'Falso positivo, no relevante' }, 'tester');

    const list = listInventoryCandidates(db, { state: 'IGNORED' }, decisionsDb);
    assert.equal(list.items.length, 1);
    assert.equal(list.items[0].id, alias);
    assert.equal(list.items[0].decisionNote, 'Falso positivo, no relevante');
  } finally { db.close(); decisionsDb.close(); }
});

// Pedido del usuario 2026-09-16: "aplicar el cruce FortiGate↔Kaspersky ya calculado" -- Kaspersky
// nunca trae IP, así que no puede clasificarse en una subred por sí solo. Si ya se corroboró
// contra un equipo FortiGate (mismo hostname, SO compatible), debe heredar la subred de su par
// en vez de quedar suelto sin red.
function seedKasperskyObservation(db, overrides = {}) {
  const now = '2026-09-01T12:00:00.000Z';
  if (!db.prepare("SELECT 1 FROM cyber_source_systems WHERE id = 'source-ksc'").get()) {
    db.prepare(`INSERT INTO cyber_source_systems(id, source_type, display_name, authority_level, created_at, updated_at)
      VALUES ('source-ksc','KASPERSKY','Kaspersky Security Center','AUTHORITATIVE',?,?)`).run(now, now);
    db.prepare(`INSERT INTO cyber_source_snapshots(id, source_system_id, captured_at, imported_at, source_sha256, processing_status)
      VALUES ('snapshot-ksc-1','source-ksc',?,?,?,'SUCCESS')`).run(now, now, 'b'.repeat(64));
  }
  const id = overrides.id || 'observation-ksc-1';
  db.prepare(`INSERT INTO cyber_asset_observations(
      id, snapshot_id, source_record_key, observed_at, ingested_at, hostname_raw, hostname_key, os_family
    ) VALUES (?, 'snapshot-ksc-1', ?, ?, ?, ?, ?, ?)`)
    .run(id, `rec-${id}`, now, now, overrides.hostname || 'PC-FINANZAS-01', overrides.hostnameKey || 'pc-finanzas-01', overrides.osFamily || 'Windows 10');
  return id;
}

test('listNetworkSegments agrupa un equipo Kaspersky corroborado en la subred real de su par FortiGate', () => {
  const db = seededDatabase();
  try {
    const now = '2026-09-01T12:00:00.000Z';
    db.prepare(`INSERT INTO cyber_network_segments(id, canonical_name, security_zone, created_at, updated_at)
      VALUES ('segment-finanzas', 'VLAN_Finanzas', 'RESTRICTED', ?, ?)`).run(now, now);
    seedCandidateObservation(db, {
      id: 'observation-forti-finanzas', segmentId: 'segment-finanzas', ip: '10.2.13.20',
      hostname: 'PC-FINANZAS-01', hostnameKey: 'pc-finanzas-01',
    });
    const kscId = seedKasperskyObservation(db, { hostname: 'PC-FINANZAS-01', hostnameKey: 'pc-finanzas-01' });

    const match = matchSnapshots({ db, leftSnapshotId: 'snapshot-1', rightSnapshotId: 'snapshot-ksc-1' });
    assert.equal(match.status, 'SUCCESS');
    assert.equal(match.summary.proposed, 1);

    const segments = listNetworkSegments(db, { includeSensitive: true });
    const segment = segments.items.find((item) => item.id === protectedAlias('segment', 'segment-finanzas'));
    assert.ok(segment, 'la subred debe existir');
    assert.equal(segment.observations, 2, 'debe contar el FortiGate real y el Kaspersky heredado');
    assert.equal(segment.inheritedKasperskyCount, 1);
    const kasperskyMember = segment.members.find((member) => member.id === kscId);
    assert.ok(kasperskyMember, 'el equipo Kaspersky debe aparecer como miembro de la subred');
    assert.equal(kasperskyMember.source, 'KASPERSKY');
    assert.equal(kasperskyMember.inheritedFromFortiGate, true);
    assert.equal(kasperskyMember.ip, null, 'Kaspersky nunca trae IP');
  } finally { db.close(); }
});

test('un equipo Kaspersky sin corroborar sigue sin subred (no se inventa una asociación)', () => {
  const db = seededDatabase();
  try {
    seedKasperskyObservation(db, { hostname: 'PC-SIN-PAR', hostnameKey: 'pc-sin-par' });
    const segments = listNetworkSegments(db, { includeSensitive: true });
    assert.equal(segments.items.every((item) => item.inheritedKasperskyCount === 0), true);
  } finally { db.close(); }
});

// Regresión 2026-09-16: el cruce se había calculado el 29-ago contra un snapshot de FortiGate
// que luego quedó superado por una reimportación real -- el match run viejo seguía apuntando a
// observaciones que listInventoryCandidates/listNetworkSegments ya no muestran (ambos se limitan
// al snapshot más reciente por fuente). Un match run "huérfano" no debe heredar nada.
test('un match calculado contra un snapshot de FortiGate ya superado no hereda subred', () => {
  const db = seededDatabase();
  try {
    const now = '2026-09-01T12:00:00.000Z';
    db.prepare(`INSERT INTO cyber_network_segments(id, canonical_name, security_zone, created_at, updated_at)
      VALUES ('segment-viejo', 'VLAN_Vieja', 'RESTRICTED', ?, ?)`).run(now, now);
    // Snapshot FortiGate NUEVO primero (crea source-forti/snapshot-1) -- simula que ya llegó
    // una reimportación real antes de intentar heredar desde el match viejo.
    seedCandidateObservation(db, { id: 'observation-forti-new', ip: '10.2.13.30' });
    // Snapshot FortiGate VIEJO (ya superado): captured_at anterior a snapshot-1.
    db.prepare(`INSERT INTO cyber_source_snapshots(id, source_system_id, captured_at, imported_at, source_sha256, processing_status)
      VALUES ('snapshot-forti-old','source-forti','2026-08-29T16:00:00.000Z',?,?,'SUCCESS')`).run(now, 'c'.repeat(64));
    db.prepare(`INSERT INTO cyber_asset_observations(id, snapshot_id, source_record_key, observed_at, ingested_at, segment_id, hostname_raw, hostname_key)
      VALUES ('observation-forti-old', 'snapshot-forti-old', 'rec-old', ?, ?, 'segment-viejo', 'PC-VIEJO', 'pc-viejo')`).run(now, now);
    const kscId = seedKasperskyObservation(db, { hostname: 'PC-VIEJO', hostnameKey: 'pc-viejo' });
    const staleMatch = matchSnapshots({ db, leftSnapshotId: 'snapshot-forti-old', rightSnapshotId: 'snapshot-ksc-1' });
    assert.equal(staleMatch.summary.proposed, 1, 'precondición: el cruce viejo sí encontró la coincidencia');

    const segments = listNetworkSegments(db, { includeSensitive: true });
    assert.equal(segments.items.every((item) => item.inheritedKasperskyCount === 0), true, 'el match huérfano no debe heredar subred');
    void kscId;
  } finally { db.close(); }
});
