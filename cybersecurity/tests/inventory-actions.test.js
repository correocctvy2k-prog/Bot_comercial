const test = require('node:test');
const assert = require('node:assert/strict');
const { openCyberDatabase } = require('../db/open-database');
const { protectedAlias, resolveProtectedAlias } = require('../src/cybersecurity-read-model');
const { getObservationDetail, promoteObservationToAsset, markObservationAsConflict, markObservationAsProtected } = require('../src/inventory-actions');

// Regresión: protectedAlias() es un hash de un solo sentido ("candidate XXXXXXXX" / SHA-256
// truncado); getObservationDetail/promote/conflict/protect intentaban "decodificarlo" con una
// regex sobre el propio alias, lo que nunca podía funcionar — ver resolveProtectedAlias.

const now = '2026-09-01T12:00:00.000Z';

function withDatabase(run) {
  const db = openCyberDatabase();
  try { return run(db); } finally { db.close(); }
}

function seedObservation(db, overrides = {}) {
  db.prepare(`INSERT INTO cyber_source_systems(id, source_type, display_name, authority_level, created_at, updated_at)
    VALUES ('source-forti','FORTIGATE','Firewall inventory','OBSERVATIONAL',?,?)`).run(now, now);
  db.prepare(`INSERT INTO cyber_source_snapshots(id, source_system_id, captured_at, imported_at, source_sha256, processing_status)
    VALUES ('snapshot-1','source-forti',?,?,?,'SUCCESS')`).run(now, now, 'a'.repeat(64));
  const id = overrides.id || 'observation-1';
  db.prepare(`INSERT INTO cyber_asset_observations(
      id, snapshot_id, source_record_key, observed_at, ingested_at, ip_value, mac_value, hostname_raw
    ) VALUES (?, 'snapshot-1', 'rec-1', ?, ?, ?, ?, ?)`)
    .run(id, now, now, overrides.ip || '10.2.6.15', overrides.mac || '02:00:00:aa:bb:cc', overrides.hostname || 'host-01');
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

test('getObservationDetail encuentra la observación real a partir del alias de la lista', () => withDatabase((db) => {
  const id = seedObservation(db, { ip: '10.2.6.20' });
  const alias = protectedAlias('candidate', id);
  const detail = getObservationDetail(db, alias);
  assert.ok(detail, 'antes de la corrección esto devolvía null aunque la observación existiera');
  assert.equal(detail.kind, 'OBSERVATION');
  assert.equal(detail.id, id);
  assert.equal(detail.ipValue, '10.2.6.20');
}));

test('promoteObservationToAsset promueve usando el alias público, no el id crudo', () => withDatabase((db) => {
  const id = seedObservation(db);
  const alias = protectedAlias('candidate', id);
  const result = promoteObservationToAsset(db, alias, { assetClass: 'OTHER', criticality: 'MEDIUM' }, 'actor-1');
  assert.equal(result.success, true);
  assert.equal(db.prepare('SELECT count(*) n FROM cyber_assets WHERE id = ?').get(result.assetId).n, 1);
}));

test('markObservationAsConflict y markObservationAsProtected también usan el alias público', () => withDatabase((db) => {
  const id = seedObservation(db);
  const alias = protectedAlias('candidate', id);
  assert.equal(markObservationAsConflict(db, alias).success, true);
  assert.equal(
    db.prepare("SELECT count(*) n FROM cyber_inventory_analysis_items WHERE observation_id = ? AND proposed_action = 'CONFLICT_REVIEW'").get(id).n,
    1,
  );
  const protectedResult = markObservationAsProtected(db, alias, {}, 'actor-1');
  assert.equal(protectedResult.success, true);
  assert.equal(db.prepare('SELECT count(*) n FROM cyber_assets WHERE id = ?').get(protectedResult.assetId).n, 1);
}));

test('promover con un alias que no existe falla con un mensaje claro, no un crash', () => withDatabase((db) => {
  seedObservation(db);
  assert.throws(() => promoteObservationToAsset(db, 'candidate FFFFFFFF', {}, 'actor-1'), /INVALID_CANDIDATE_KEY/);
}));

// Decisión del usuario 2026-09-16: poder anotar por qué se tomó una decisión (ej. "este equipo
// lo instalé recientemente para nuestro servidor openvas de prueba piloto") -- cyber_assets ya
// tenía review_reason/reviewed_by/reviewed_at, pero promote/protect nunca los llenaban.
test('promoteObservationToAsset guarda la nota y quién/cuándo decidió', () => withDatabase((db) => {
  const id = seedObservation(db);
  const alias = protectedAlias('candidate', id);
  const result = promoteObservationToAsset(db, alias, { note: 'Instalado para el piloto de OpenVAS' }, 'jbeltran');
  const asset = db.prepare('SELECT review_reason, reviewed_by FROM cyber_assets WHERE id = ?').get(result.assetId);
  assert.equal(asset.review_reason, 'Instalado para el piloto de OpenVAS');
  assert.equal(asset.reviewed_by, 'jbeltran');
}));

test('markObservationAsProtected también guarda la nota', () => withDatabase((db) => {
  const id = seedObservation(db);
  const alias = protectedAlias('candidate', id);
  const result = markObservationAsProtected(db, alias, { note: 'Servidor de dominio, no tocar' }, 'jbeltran');
  const asset = db.prepare('SELECT review_reason FROM cyber_assets WHERE id = ?').get(result.assetId);
  assert.equal(asset.review_reason, 'Servidor de dominio, no tocar');
}));

test('una nota vacía se guarda como null, no como cadena vacía', () => withDatabase((db) => {
  const id = seedObservation(db);
  const alias = protectedAlias('candidate', id);
  const result = promoteObservationToAsset(db, alias, {}, 'jbeltran');
  assert.equal(db.prepare('SELECT review_reason FROM cyber_assets WHERE id = ?').get(result.assetId).review_reason, null);
}));

test('una nota demasiado larga se rechaza con un mensaje claro', () => withDatabase((db) => {
  const id = seedObservation(db);
  const alias = protectedAlias('candidate', id);
  assert.throws(() => promoteObservationToAsset(db, alias, { note: 'x'.repeat(501) }, 'jbeltran'), /INVALID_NOTE_TOO_LONG/);
}));
