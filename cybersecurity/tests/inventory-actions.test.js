const test = require('node:test');
const assert = require('node:assert/strict');
const { openCyberDatabase } = require('../db/open-database');
const { protectedAlias, resolveProtectedAlias } = require('../src/cybersecurity-read-model');
const { getObservationDetail, promoteObservationToAsset, markObservationAsConflict, markObservationAsProtected, markObservationAsIgnored } = require('../src/inventory-actions');
const { openInventoryDecisionStore, getDecisionByObservationId } = require('../src/inventory-decision-store');
const { openNetworkPolicyStore, savePolicy } = require('../src/network-policy-store');
const { matchSnapshots } = require('../src/cross-source-matcher');

// Regresión: protectedAlias() es un hash de un solo sentido ("candidate XXXXXXXX" / SHA-256
// truncado); getObservationDetail/promote/conflict/protect intentaban "decodificarlo" con una
// regex sobre el propio alias, lo que nunca podía funcionar — ver resolveProtectedAlias.
//
// Hallazgo 2026-09-16: cyber-inventory.db es de solo lectura en producción (Docker read_only +
// /data:ro + --immutable), así que promote/conflict/protect ya no escriben ahí — las decisiones
// humanas se guardan en un almacén aparte (inventory-decision-store.js), montado sobre
// :memory: en estos tests igual que openCyberDatabase() lo hace para la base principal.

const now = '2026-09-01T12:00:00.000Z';

function withDatabase(run) {
  const db = openCyberDatabase();
  const decisionsDb = openInventoryDecisionStore(':memory:');
  try { return run(db, decisionsDb); } finally { db.close(); decisionsDb.close(); }
}

function seedObservation(db, overrides = {}) {
  if (!db.prepare("SELECT 1 FROM cyber_source_systems WHERE id = 'source-forti'").get()) {
    db.prepare(`INSERT INTO cyber_source_systems(id, source_type, display_name, authority_level, created_at, updated_at)
      VALUES ('source-forti','FORTIGATE','Firewall inventory','OBSERVATIONAL',?,?)`).run(now, now);
    db.prepare(`INSERT INTO cyber_source_snapshots(id, source_system_id, captured_at, imported_at, source_sha256, processing_status)
      VALUES ('snapshot-1','source-forti',?,?,?,'SUCCESS')`).run(now, now, 'a'.repeat(64));
  }
  const id = overrides.id || 'observation-1';
  db.prepare(`INSERT INTO cyber_asset_observations(
      id, snapshot_id, source_record_key, observed_at, ingested_at, segment_id, ip_value, mac_value, hostname_raw, hostname_key
    ) VALUES (?, 'snapshot-1', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, `rec-${id}`, now, now, overrides.segmentId || null, overrides.ip || '10.2.6.15', overrides.mac || '02:00:00:aa:bb:cc', overrides.hostname || 'host-01', overrides.hostnameKey || null);
  return id;
}

function seedKasperskyObservation(db, overrides = {}) {
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

function seedSegment(db, overrides = {}) {
  const id = overrides.id || 'segment-1';
  db.prepare(`INSERT INTO cyber_network_segments(id, canonical_name, security_zone, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)`).run(id, overrides.canonicalName || 'port10 · 10.220.1.0/24', overrides.zone || 'RESTRICTED', now, now);
  return id;
}

test('resolveProtectedAlias revierte el alias de un candidato a su id real', () => withDatabase((db) => {
  const id = seedObservation(db);
  const alias = protectedAlias('candidate', id);
  assert.match(alias, /^candidate [A-F0-9]{8}$/);
  assert.deepEqual(resolveProtectedAlias(db, alias), { kind: 'CANDIDATE', id });
}));

test('resolveProtectedAlias devuelve null para un alias que no corresponde a nada', () => withDatabase((db) => {
  seedObservation(db);
  assert.equal(resolveProtectedAlias(db, 'candidate FFFFFFFF'), null);
  assert.equal(resolveProtectedAlias(db, 'algo-invalido'), null);
}));

test('resolveProtectedAlias acepta el alias con %20 (como llega en la URL sin decodificar)', () => withDatabase((db) => {
  const id = seedObservation(db);
  const alias = protectedAlias('candidate', id).replace(' ', '%20');
  // simula lo que hace la ruta: decodeURIComponent antes de resolver
  assert.deepEqual(resolveProtectedAlias(db, decodeURIComponent(alias)), { kind: 'CANDIDATE', id });
}));

test('getObservationDetail encuentra la observación real a partir del alias de la lista', () => withDatabase((db, decisionsDb) => {
  const id = seedObservation(db, { ip: '10.2.6.20' });
  const alias = protectedAlias('candidate', id);
  const detail = getObservationDetail(db, decisionsDb, null, alias);
  assert.ok(detail, 'antes de la corrección esto devolvía null aunque la observación existiera');
  assert.equal(detail.kind, 'OBSERVATION');
  // Regresión real 2026-09-16 (clic real en el navegador): getObservationDetail devolvía el id
  // crudo interno en `id`, no el alias público -- el panel de detalle reusa `query.data.id`
  // para Promover/Marcar conflicto/Marcar protegido, así que con el id crudo esas 3 rutas
  // nunca coincidían (405 METHOD_NOT_ALLOWED). `detail.id` debe ser el MISMO alias que se usó
  // para pedir el detalle, no el id de la fila.
  assert.equal(detail.id, alias);
  assert.equal(detail.ipValue, '10.2.6.20');
}));

test('promoteObservationToAsset promueve usando el alias público, no el id crudo', () => withDatabase((db, decisionsDb) => {
  const id = seedObservation(db);
  const alias = protectedAlias('candidate', id);
  const result = promoteObservationToAsset(db, decisionsDb, alias, { assetClass: 'OTHER', criticality: 'MEDIUM' }, 'actor-1');
  assert.equal(result.success, true);
  const decision = getDecisionByObservationId(decisionsDb, id);
  assert.equal(decision.decision, 'PROMOTED');
  assert.equal(decision.asset_id, result.assetId);
}));

test('markObservationAsConflict y markObservationAsProtected también usan el alias público', () => withDatabase((db, decisionsDb) => {
  const id = seedObservation(db);
  const alias = protectedAlias('candidate', id);
  assert.equal(markObservationAsConflict(db, decisionsDb, alias, {}, 'actor-1').success, true);
  assert.equal(getDecisionByObservationId(decisionsDb, id).decision, 'CONFLICT');

  const id2 = seedObservation(db, { id: 'observation-2', mac: '02:00:00:aa:bb:dd', hostname: 'host-02' });
  const alias2 = protectedAlias('candidate', id2);
  const protectedResult = markObservationAsProtected(db, decisionsDb, alias2, {}, 'actor-1');
  assert.equal(protectedResult.success, true);
  assert.equal(getDecisionByObservationId(decisionsDb, id2).decision, 'PROTECTED');
}));

test('promover con un alias que no existe falla con un mensaje claro, no un crash', () => withDatabase((db, decisionsDb) => {
  seedObservation(db);
  assert.throws(() => promoteObservationToAsset(db, decisionsDb, 'candidate FFFFFFFF', {}, 'actor-1'), /INVALID_CANDIDATE_KEY/);
}));

// Decisión del usuario 2026-09-16: poder anotar por qué se tomó una decisión (ej. "este equipo
// lo instalé recientemente para nuestro servidor openvas de prueba piloto").
test('promoteObservationToAsset guarda la nota y quién/cuándo decidió', () => withDatabase((db, decisionsDb) => {
  const id = seedObservation(db);
  const alias = protectedAlias('candidate', id);
  promoteObservationToAsset(db, decisionsDb, alias, { note: 'Instalado para el piloto de OpenVAS' }, 'jbeltran');
  const decision = getDecisionByObservationId(decisionsDb, id);
  assert.equal(decision.note, 'Instalado para el piloto de OpenVAS');
  assert.equal(decision.decided_by, 'jbeltran');
}));

test('markObservationAsProtected también guarda la nota', () => withDatabase((db, decisionsDb) => {
  const id = seedObservation(db);
  const alias = protectedAlias('candidate', id);
  markObservationAsProtected(db, decisionsDb, alias, { note: 'Servidor de dominio, no tocar' }, 'jbeltran');
  assert.equal(getDecisionByObservationId(decisionsDb, id).note, 'Servidor de dominio, no tocar');
}));

test('una nota vacía se guarda como null, no como cadena vacía', () => withDatabase((db, decisionsDb) => {
  const id = seedObservation(db);
  const alias = protectedAlias('candidate', id);
  promoteObservationToAsset(db, decisionsDb, alias, {}, 'jbeltran');
  assert.equal(getDecisionByObservationId(decisionsDb, id).note, null);
}));

test('una nota demasiado larga se rechaza con un mensaje claro', () => withDatabase((db, decisionsDb) => {
  const id = seedObservation(db);
  const alias = protectedAlias('candidate', id);
  assert.throws(() => promoteObservationToAsset(db, decisionsDb, alias, { note: 'x'.repeat(501) }, 'jbeltran'), /INVALID_NOTE_TOO_LONG/);
}));

// Regresión del flujo real de la UI (2026-09-16, reportada con captura de pantalla + logs de
// nginx): la interfaz pide el detalle de un candidato y reusa el `id` de ESA respuesta para
// Promover/Marcar conflicto/Marcar protegido -- no vuelve a usar el alias original de la lista.
// Si getObservationDetail() devuelve el id crudo en vez del alias, este flujo se rompe aunque
// promoteObservationToAsset() funcione perfecto si se lo llama con el alias "correcto" a mano
// (que es justo lo que hacían los demás tests, sin ver el bug).
test('el flujo real detalle -> promover funciona usando el id que trae la respuesta de detalle', () => withDatabase((db, decisionsDb) => {
  const id = seedObservation(db);
  const listAlias = protectedAlias('candidate', id);
  const detail = getObservationDetail(db, decisionsDb, null, listAlias);
  const result = promoteObservationToAsset(db, decisionsDb, detail.id, { note: 'Serv OpenVAS Piloto' }, 'jbeltran');
  assert.equal(result.success, true);
}));

// Regresión 2026-09-16 (3er reporte del usuario, 500 Internal Server Error): antes de que
// existiera decisionsDb, promote/conflict/protect escribían en cyber-inventory.db -- que en el
// contenedor real es de solo lectura (read_only + :ro + --immutable). Con una base principal
// realmente inmutable (query_only=ON), cualquier intento de escribir ahí debe fallar; el punto
// de esta prueba es que la acción NUNCA toca `db`, solo `decisionsDb`.
test('promover/conflicto/proteger nunca escriben en la base principal (solo lectura en producción)', () => withDatabase((db, decisionsDb) => {
  const id = seedObservation(db);
  const alias = protectedAlias('candidate', id);
  db.exec('PRAGMA query_only = ON');
  assert.doesNotThrow(() => promoteObservationToAsset(db, decisionsDb, alias, {}, 'jbeltran'));
}));

test('después de promover, getObservationDetail muestra el candidato como CANONICAL usando el decisionsDb', () => withDatabase((db, decisionsDb) => {
  const id = seedObservation(db);
  const alias = protectedAlias('candidate', id);
  promoteObservationToAsset(db, decisionsDb, alias, { canonicalName: 'Servidor OpenVAS piloto', note: 'piloto' }, 'jbeltran');
  const detail = getObservationDetail(db, decisionsDb, null, alias);
  assert.equal(detail.kind, 'CANONICAL');
  assert.equal(detail.id, alias);
  assert.equal(detail.canonicalName, 'Servidor OpenVAS piloto');
}));

test('promover dos veces la misma observación falla con OBSERVATION_ALREADY_LINKED', () => withDatabase((db, decisionsDb) => {
  const id = seedObservation(db);
  const alias = protectedAlias('candidate', id);
  promoteObservationToAsset(db, decisionsDb, alias, {}, 'jbeltran');
  assert.throws(() => promoteObservationToAsset(db, decisionsDb, alias, {}, 'jbeltran'), /OBSERVATION_ALREADY_LINKED/);
}));

// Regresión 2026-09-16 (pedido del usuario: "se debe mostrar la subred a la que fue asociado" --
// la asociación ya existe desde la importación de FortiGate (segment_id), promover no la crea ni
// la repite; solo faltaba exponerla en el detalle). Sin política aplicada se ve el nombre crudo
// de interfaz; con política aplicada (Subredes) debe preferir el nombre que el usuario le dio.
test('getObservationDetail muestra la subred asociada desde la importación, con o sin política aplicada', () => withDatabase((db, decisionsDb) => {
  const segmentId = seedSegment(db, { canonicalName: 'port10 · 10.220.1.0/24' });
  const id = seedObservation(db, { ip: '10.220.1.83', segmentId });
  const alias = protectedAlias('candidate', id);

  const withoutPolicy = getObservationDetail(db, decisionsDb, null, alias);
  assert.equal(withoutPolicy.segment.name, 'port10 · 10.220.1.0/24');
  assert.equal(withoutPolicy.segment.classified, false);

  const policyDb = openNetworkPolicyStore(':memory:');
  const segmentAlias = protectedAlias('segment', segmentId);
  savePolicy(policyDb, segmentAlias, {
    name: 'CCTV, control de acceso y alarmas', zone: 'RESTRICTED', networkFunction: 'CCTV',
    technology: 'ETHERNET', topology: 'ACCESS_LAN', addressMode: 'STATIC', population: 'SECURITY_DEVICES',
    criticality: 'HIGH', networkAddress: '10.220.1.0', prefixLength: 24, gateway: '10.220.1.1',
  }, 'tester');

  const withPolicy = getObservationDetail(db, decisionsDb, policyDb, alias);
  assert.equal(withPolicy.segment.name, 'CCTV, control de acceso y alarmas', 'con política aplicada debe preferir el nombre que el usuario le dio en Subredes');
  assert.equal(withPolicy.segment.classified, true);
  assert.equal(withPolicy.segment.id, segmentAlias);
  policyDb.close();
}));

test('un candidato sin segmento asignado no rompe getObservationDetail (segment null)', () => withDatabase((db, decisionsDb) => {
  const id = seedObservation(db);
  const alias = protectedAlias('candidate', id);
  const detail = getObservationDetail(db, decisionsDb, null, alias);
  assert.equal(detail.segment, null);
}));

// Pedido del usuario 2026-09-16: "aplicar el cruce FortiGate↔Kaspersky ya calculado" -- Kaspersky
// nunca trae IP, así que getObservationDetail debe mostrar la subred heredada del equipo
// FortiGate corroborado (mismo hostname, SO compatible) en vez de "Sin segmento".
test('getObservationDetail hereda la subred de un equipo Kaspersky corroborado contra FortiGate', () => withDatabase((db, decisionsDb) => {
  const segmentId = seedSegment(db, { canonicalName: 'VLAN_Finanzas' });
  seedObservation(db, {
    id: 'observation-forti-finanzas', segmentId, ip: '10.2.13.20',
    hostname: 'PC-FINANZAS-01', hostnameKey: 'pc-finanzas-01',
  });
  const kscId = seedKasperskyObservation(db, { hostname: 'PC-FINANZAS-01', hostnameKey: 'pc-finanzas-01' });
  matchSnapshots({ db, leftSnapshotId: 'snapshot-1', rightSnapshotId: 'snapshot-ksc-1' });

  const alias = protectedAlias('candidate', kscId);
  const detail = getObservationDetail(db, decisionsDb, null, alias);
  assert.equal(detail.segment.name, 'VLAN_Finanzas');
  assert.equal(detail.segment.inherited, true);
}));

test('un equipo Kaspersky sin corroborar contra FortiGate no hereda ninguna subred', () => withDatabase((db, decisionsDb) => {
  const kscId = seedKasperskyObservation(db, { hostname: 'PC-SIN-PAR', hostnameKey: 'pc-sin-par' });
  const alias = protectedAlias('candidate', kscId);
  const detail = getObservationDetail(db, decisionsDb, null, alias);
  assert.equal(detail.segment, null);
}));

// Pedido del usuario 2026-09-16: "agregar un botón de ignorar para otros activos irrelevantes"
// -- un candidato marcado a mano como IGNORED se sigue viendo como OBSERVATION (no se convierte
// en CANONICAL como promover/proteger), pero con state=IGNORED para que salga de "Requiere
// atención" en la lista sin perder su ficha real.
test('markObservationAsIgnored marca la observación como IGNORED con su nota', () => withDatabase((db, decisionsDb) => {
  const id = seedObservation(db);
  const alias = protectedAlias('candidate', id);
  const result = markObservationAsIgnored(db, decisionsDb, alias, { note: 'Impresora de invitados, no relevante' }, 'jbeltran');
  assert.equal(result.success, true);

  const decision = getDecisionByObservationId(decisionsDb, id);
  assert.equal(decision.decision, 'IGNORED');
  assert.equal(decision.note, 'Impresora de invitados, no relevante');

  const detail = getObservationDetail(db, decisionsDb, null, alias);
  assert.equal(detail.kind, 'OBSERVATION');
  assert.equal(detail.state, 'IGNORED');
  assert.equal(detail.decisionNote, 'Impresora de invitados, no relevante');
}));

test('ignorar un candidato ya promovido falla con OBSERVATION_ALREADY_LINKED (no pisa la promoción)', () => withDatabase((db, decisionsDb) => {
  const id = seedObservation(db);
  const alias = protectedAlias('candidate', id);
  promoteObservationToAsset(db, decisionsDb, alias, {}, 'jbeltran');
  assert.throws(() => markObservationAsIgnored(db, decisionsDb, alias, {}, 'jbeltran'), /OBSERVATION_ALREADY_LINKED/);
  assert.equal(getDecisionByObservationId(decisionsDb, id).decision, 'PROMOTED', 'la promoción original no debe perderse');
}));

test('marcar en conflicto y luego ignorar reemplaza la decisión (ignorar es la más reciente)', () => withDatabase((db, decisionsDb) => {
  const id = seedObservation(db);
  const alias = protectedAlias('candidate', id);
  markObservationAsConflict(db, decisionsDb, alias, {}, 'jbeltran');
  markObservationAsIgnored(db, decisionsDb, alias, {}, 'jbeltran');
  assert.equal(getDecisionByObservationId(decisionsDb, id).decision, 'IGNORED');
}));
