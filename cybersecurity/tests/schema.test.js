const test = require('node:test');
const assert = require('node:assert/strict');
const { openCyberDatabase } = require('../db/open-database');

const now = '2026-08-29T16:00:00.000Z';

function withDatabase(run) {
  const db = openCyberDatabase();
  try {
    return run(db);
  } finally {
    db.close();
  }
}

function seedSource(db) {
  db.prepare(`
    INSERT INTO cyber_source_systems(
      id, source_type, display_name, authority_level, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run('source-forti', 'FORTIGATE', 'Firewall inventory', 'OBSERVATIONAL', now, now);

  db.prepare(`
    INSERT INTO cyber_source_snapshots(
      id, source_system_id, captured_at, imported_at, source_sha256, processing_status
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run('snapshot-1', 'source-forti', now, now, 'a'.repeat(64), 'PROCESSING');
}

test('crea el esquema versionado con integridad y claves foraneas', () => withDatabase((db) => {
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  const migration = db.prepare(`
    SELECT version, name FROM cyber_schema_migrations ORDER BY version DESC LIMIT 1
  `).get();
  assert.equal(migration.version, 4);
  assert.equal(migration.name, 'vulnerability_remediation_cases');
}));

test('hace idempotente una captura por fuente y hash', () => withDatabase((db) => {
  seedSource(db);
  assert.throws(() => db.prepare(`
    INSERT INTO cyber_source_snapshots(
      id, source_system_id, captured_at, imported_at, source_sha256, processing_status
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run('snapshot-2', 'source-forti', now, now, 'a'.repeat(64), 'PROCESSING'), /UNIQUE/);
}));

test('rechaza observaciones huerfanas y conserva observaciones append-only', () => withDatabase((db) => {
  assert.throws(() => db.prepare(`
    INSERT INTO cyber_asset_observations(
      id, snapshot_id, source_record_key, observed_at, ingested_at
    ) VALUES (?, ?, ?, ?, ?)
  `).run('obs-orphan', 'missing', '1', now, now), /FOREIGN KEY/);

  seedSource(db);
  db.prepare(`
    INSERT INTO cyber_asset_observations(
      id, snapshot_id, source_record_key, observed_at, ingested_at, ip_value
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run('obs-1', 'snapshot-1', 'record-1', now, now, 'masked');

  assert.throws(
    () => db.prepare('UPDATE cyber_asset_observations SET ip_value = ? WHERE id = ?').run('changed', 'obs-1'),
    /append-only/,
  );
  assert.throws(
    () => db.prepare('DELETE FROM cyber_asset_observations WHERE id = ?').run('obs-1'),
    /append-only/,
  );
}));

test('permite reutilizacion temporal de IP sin convertirla en identidad global', () => withDatabase((db) => {
  const insertAsset = db.prepare(`
    INSERT INTO cyber_assets(
      id, canonical_name, asset_class, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?)
  `);
  insertAsset.run('asset-1', 'Equipo A', 'WORKSTATION', now, now);
  insertAsset.run('asset-2', 'Equipo B', 'WORKSTATION', now, now);

  const insertIdentifier = db.prepare(`
    INSERT INTO cyber_asset_identifiers(
      id, asset_id, identifier_type, normalized_value, valid_from, valid_to,
      confidence, verification_status, created_at, updated_at
    ) VALUES (?, ?, 'IPV4', ?, ?, ?, ?, ?, ?, ?)
  `);
  insertIdentifier.run(
    'identifier-1', 'asset-1', 'restricted-ip-token', '2026-01-01T00:00:00Z',
    '2026-06-01T00:00:00Z', 0.7, 'OBSERVED', now, now,
  );
  insertIdentifier.run(
    'identifier-2', 'asset-2', 'restricted-ip-token', '2026-06-02T00:00:00Z',
    null, 0.7, 'OBSERVED', now, now,
  );

  assert.equal(
    db.prepare("SELECT count(*) AS count FROM cyber_asset_identifiers WHERE normalized_value = 'restricted-ip-token'").get().count,
    2,
  );
}));

test('una autorizacion activa exige aprobador y limita pruebas disruptivas', () => withDatabase((db) => {
  const insert = db.prepare(`
    INSERT INTO cyber_scan_authorizations(
      id, name, status, valid_from, valid_until, scan_profile,
      disruptive_tests_allowed, reason, created_at, updated_at, approved_by, approved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  assert.throws(() => insert.run(
    'auth-1', 'Pilot', 'ACTIVE', now, '2026-09-01T00:00:00Z',
    'DISCOVERY_SAFE', 0, 'Initial pilot', now, now, null, null,
  ), /CHECK/);

  assert.throws(() => insert.run(
    'auth-2', 'Unsafe pilot', 'ACTIVE', now, '2026-09-01T00:00:00Z',
    'DISCOVERY_SAFE', 1, 'Invalid disruptive profile', now, now, 'approver', now,
  ), /CHECK/);

  insert.run(
    'auth-3', 'Safe pilot', 'ACTIVE', now, '2026-09-01T00:00:00Z',
    'DISCOVERY_SAFE', 0, 'Approved discovery', now, now, 'approver', now,
  );
  assert.equal(db.prepare('SELECT status FROM cyber_scan_authorizations WHERE id = ?').get('auth-3').status, 'ACTIVE');
}));

test('un objetivo de autorizacion debe ser exactamente activo o segmento', () => withDatabase((db) => {
  db.prepare(`
    INSERT INTO cyber_scan_authorizations(
      id, name, status, valid_from, valid_until, scan_profile, reason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('auth-draft', 'Draft', 'DRAFT', now, '2026-09-01T00:00:00Z', 'DISCOVERY_SAFE', 'Draft', now, now);

  assert.throws(() => db.prepare(`
    INSERT INTO cyber_scan_authorization_targets(
      authorization_id, target_type, asset_id, segment_id, created_at
    ) VALUES (?, 'ASSET', NULL, NULL, ?)
  `).run('auth-draft', now), /CHECK/);

  db.prepare(`
    INSERT INTO cyber_assets(id, canonical_name, asset_class, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run('asset-target', 'Pilot asset', 'SERVER', now, now);

  const insertTarget = db.prepare(`
    INSERT INTO cyber_scan_authorization_targets(
      authorization_id, target_type, asset_id, segment_id, created_at
    ) VALUES (?, 'ASSET', ?, NULL, ?)
  `);
  insertTarget.run('auth-draft', 'asset-target', now);
  assert.throws(() => insertTarget.run('auth-draft', 'asset-target', now), /UNIQUE/);
}));
