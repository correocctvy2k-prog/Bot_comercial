const crypto = require('node:crypto');
const { openCyberDatabase } = require('../db/open-database');
const { resolveProtectedAlias, getCrossSourceMatchedObservationIds } = require('./cybersecurity-read-model');
const { computeReliabilityScore, detectDeviceGroups } = require('./inventory-reliability');

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

function findingsSummaryForTarget(db, targetKey) {
  const rows = db.prepare('SELECT title, severity, cves_json, observed_at FROM cyber_vulnerability_findings WHERE target_key = ? ORDER BY severity DESC LIMIT 20').all(targetKey);
  return rows.map((row) => ({ title: row.title, severity: row.severity, cves: JSON.parse(row.cves_json || '[]'), observedAt: row.observed_at }));
}

function getObservationDetail(db, candidateKey) {
  const resolved = resolveProtectedAlias(db, candidateKey);
  if (!resolved) return null;

  if (resolved.kind === 'CANONICAL') {
    const asset = db.prepare('SELECT * FROM cyber_assets WHERE id = ?').get(resolved.id);
    if (!asset) return null;
    return {
      kind: 'CANONICAL',
      id: asset.id,
      label: `Activo canónico ${asset.id.slice(-8).toUpperCase()}`,
      canonicalName: asset.canonical_name,
      assetClass: asset.asset_class,
      criticality: asset.criticality,
      lifecycleStatus: asset.lifecycle_status,
      reconciliationStatus: asset.reconciliation_status,
      createdAt: asset.created_at,
      updatedAt: asset.updated_at,
      reviewedAt: asset.reviewed_at,
      reviewedBy: asset.reviewed_by,
      reviewReason: asset.review_reason,
    };
  }

  if (resolved.kind === 'PROTECTED_TARGET') {
    const findings = findingsSummaryForTarget(db, resolved.id);
    if (!findings.length) return null;
    return {
      kind: 'PROTECTED_TARGET',
      id: resolved.id,
      label: `Objetivo protegido ${resolved.id.replace(/[^a-f0-9]/gi, '').slice(-8).toUpperCase()}`,
      source: 'GREENBONE',
      findingCount: findings.length,
      maxSeverity: findings.reduce((max, item) => Math.max(max, item.severity || 0), 0),
      findings,
    };
  }

  // CANDIDATE (observación FortiGate/Kaspersky)
  // (source venía de observation.source_system_id, columna que no existe en
  // cyber_asset_observations -- siempre daba 'UNKNOWN'. Se resuelve vía snapshot -> fuente.)
  const observation = db.prepare(`
    SELECT o.*, source.source_type sourceType
    FROM cyber_asset_observations o
    JOIN cyber_source_snapshots s ON s.id = o.snapshot_id
    JOIN cyber_source_systems source ON source.id = s.source_system_id
    WHERE o.id = ?
  `).get(resolved.id);
  if (!observation) return null;

  const analysis = db.prepare(`
    SELECT item.* FROM cyber_inventory_analysis_items item
    JOIN cyber_inventory_analysis_runs run ON run.id = item.analysis_run_id
    WHERE item.observation_id = ?
    ORDER BY run.completed_at DESC LIMIT 1
  `).get(observation.id);
  const qualityFlags = JSON.parse(observation.quality_flags_json || '[]');
  const reasonCodes = analysis ? JSON.parse(analysis.reason_codes_json || '[]') : [];

  // Para saber si esta observación es "el mismo equipo con varias tarjetas de red", se agrupa
  // contra el resto de observaciones de la misma captura con su mismo hostname (ver
  // src/inventory-reliability.js — decisión del usuario 2026-09-15).
  const siblings = observation.hostname_raw
    ? db.prepare('SELECT id, hostname_raw hostnameRaw, mac_value macValue, ip_value ipValue FROM cyber_asset_observations WHERE snapshot_id = ? AND hostname_raw = ?')
      .all(observation.snapshot_id, observation.hostname_raw)
    : [];
  const deviceGroups = detectDeviceGroups(siblings);
  const crossMatched = getCrossSourceMatchedObservationIds(db);

  return {
    kind: 'OBSERVATION',
    id: observation.id,
    label: `Activo observado ${observation.id.slice(-8).toUpperCase()}`,
    source: observation.sourceType || 'UNKNOWN',
    observedAt: observation.observed_at,
    ingestedAt: observation.ingested_at,
    segmentId: observation.segment_id,
    ipValue: observation.ip_value,
    macValue: observation.mac_value,
    hostnameRaw: observation.hostname_raw,
    manufacturer: observation.manufacturer,
    osFamily: observation.os_family,
    osVersion: observation.os_version,
    deviceClassRaw: observation.device_class_raw,
    firstSeenSourceAt: observation.first_seen_source_at,
    lastSeenSourceAt: observation.last_seen_source_at,
    sourceSeenSeconds: observation.source_seen_seconds,
    attributeConfidence: JSON.parse(observation.attribute_confidence_json || '{}'),
    qualityFlags,
    sanitizedAttributes: JSON.parse(observation.sanitized_attributes_json || '{}'),
    reliability: computeReliabilityScore(
      { sourceSeenSeconds: observation.source_seen_seconds, hostnameRaw: observation.hostname_raw, qualityFlags, reasonCodes },
      { hasCrossSourceMatch: crossMatched.has(observation.id), deviceGroup: deviceGroups.get(observation.id) || null },
    ),
    analysis: analysis ? {
      provisionalAssetClass: analysis.provisional_asset_class,
      identityStrength: analysis.identity_strength,
      proposedAction: analysis.proposed_action,
      confidence: analysis.confidence,
      reasonCodes,
    } : null,
  };
}

function requireObservation(db, candidateKey) {
  const resolved = resolveProtectedAlias(db, candidateKey);
  if (!resolved || resolved.kind !== 'CANDIDATE') throw new Error('INVALID_CANDIDATE_KEY');
  const observation = db.prepare('SELECT * FROM cyber_asset_observations WHERE id = ?').get(resolved.id);
  if (!observation) throw new Error('OBSERVATION_NOT_FOUND');
  return observation;
}

function promoteObservationToAsset(db, candidateKey, body, actorId) {
  const observation = requireObservation(db, candidateKey);

  const existingLink = db.prepare('SELECT asset_id FROM cyber_asset_observation_links WHERE observation_id = ? AND decision_status = \'ACCEPTED\'').get(observation.id);
  if (existingLink) throw new Error('OBSERVATION_ALREADY_LINKED');

  const now = new Date().toISOString();
  const assetId = `asset_${crypto.randomBytes(8).toString('hex')}`;

  const assetClass = body.assetClass || 'OTHER';
  const criticality = body.criticality || 'MEDIUM';
  const canonicalName = body.canonicalName || `Activo promovido ${observation.id.slice(-8).toUpperCase()}`;

  db.prepare(`
    INSERT INTO cyber_assets (id, canonical_name, asset_class, criticality, lifecycle_status, reconciliation_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'CONFIRMED_ACTIVE', 'HUMAN_VERIFIED', ?, ?)
  `).run(assetId, canonicalName, assetClass, criticality, now, now);

  db.prepare(`
    INSERT INTO cyber_asset_observation_links (observation_id, asset_id, link_method, confidence, decision_status, decided_at, decided_by, reason)
    VALUES (?, ?, 'HUMAN_DECISION', 1.0, 'ACCEPTED', ?, ?, ?)
  `).run(observation.id, assetId, now, actorId, 'Promovido manualmente desde inventario');

  if (observation.mac_value) {
    db.prepare(`
      INSERT INTO cyber_asset_identifiers (id, asset_id, identifier_type, normalized_value, display_value_masked, valid_from, confidence, verification_status, is_locally_administered, created_at, updated_at)
      VALUES (?, ?, 'MAC', ?, ?, ?, 1.0, 'HUMAN_VERIFIED', ?, ?, ?)
    `).run(
      `ident_${crypto.randomBytes(8).toString('hex')}`, assetId,
      observation.mac_value.toLowerCase(), observation.mac_value, now,
      observation.mac_value.startsWith('02:') || observation.mac_value.startsWith('06:') || observation.mac_value.startsWith('0a:') ? 1 : 0,
      now, now,
    );
  }

  if (observation.ip_value) {
    db.prepare(`
      INSERT INTO cyber_asset_identifiers (id, asset_id, identifier_type, normalized_value, display_value_masked, valid_from, confidence, verification_status, created_at, updated_at)
      VALUES (?, ?, 'IPV4', ?, ?, ?, 1.0, 'CORROBORATED', ?, ?)
    `).run(`ident_${crypto.randomBytes(8).toString('hex')}`, assetId, observation.ip_value, observation.ip_value, now, now, now);
  }

  if (observation.hostname_raw) {
    db.prepare(`
      INSERT INTO cyber_asset_identifiers (id, asset_id, identifier_type, normalized_value, display_value_masked, valid_from, confidence, verification_status, created_at, updated_at)
      VALUES (?, ?, 'HOSTNAME', ?, ?, ?, 0.8, 'CORROBORATED', ?, ?)
    `).run(`ident_${crypto.randomBytes(8).toString('hex')}`, assetId, observation.hostname_raw.toLowerCase(), observation.hostname_raw, now, now, now);
  }

  return { success: true, assetId, message: 'Observación promovida a activo canónico exitosamente' };
}

function markObservationAsConflict(db, candidateKey) {
  const observation = requireObservation(db, candidateKey);

  const existingRun = db.prepare('SELECT id FROM cyber_inventory_analysis_runs WHERE snapshot_id = (SELECT snapshot_id FROM cyber_asset_observations WHERE id = ?) AND completed_at = (SELECT MAX(completed_at) FROM cyber_inventory_analysis_runs WHERE snapshot_id = (SELECT snapshot_id FROM cyber_asset_observations WHERE id = ?))').get(observation.id, observation.id);

  let runId = existingRun?.id;
  if (!runId) {
    runId = `analysis_${crypto.randomBytes(8).toString('hex')}`;
    const runTimestamp = new Date().toISOString();
    db.prepare(`
      INSERT INTO cyber_inventory_analysis_runs (id, snapshot_id, policy_version, started_at, completed_at, status)
      VALUES (?, (SELECT snapshot_id FROM cyber_asset_observations WHERE id = ?), 'inventory-confidence-v2', ?, ?, 'SUCCESS')
    `).run(runId, observation.id, runTimestamp, runTimestamp);
  }

  db.prepare(`
    INSERT INTO cyber_inventory_analysis_items (analysis_run_id, observation_id, provisional_asset_class, identity_strength, proposed_action, confidence, reason_codes_json, created_at)
    VALUES (?, ?, 'OTHER', 'LOW', 'CONFLICT_REVIEW', 0.5, '["MANUAL_CONFLICT"]', ?)
    ON CONFLICT(analysis_run_id, observation_id) DO UPDATE SET
      proposed_action = 'CONFLICT_REVIEW',
      identity_strength = 'LOW',
      confidence = 0.5,
      reason_codes_json = '["MANUAL_CONFLICT"]'
  `).run(runId, observation.id, new Date().toISOString());

  return { success: true, message: 'Observación marcada como conflicto para revisión' };
}

function markObservationAsProtected(db, candidateKey, body, actorId) {
  const observation = requireObservation(db, candidateKey);

  const assetId = `asset_${crypto.randomBytes(8).toString('hex')}`;
  const now = new Date().toISOString();
  const canonicalName = `Objetivo protegido ${observation.id.slice(-8).toUpperCase()}`;

  db.prepare(`
    INSERT INTO cyber_assets (id, canonical_name, asset_class, criticality, lifecycle_status, reconciliation_status, created_at, updated_at)
    VALUES (?, ?, 'OTHER', 'HIGH', 'CONFIRMED_ACTIVE', 'HUMAN_VERIFIED', ?, ?)
  `).run(assetId, canonicalName, now, now);

  db.prepare(`
    INSERT INTO cyber_asset_observation_links (observation_id, asset_id, link_method, confidence, decision_status, decided_at, decided_by, reason)
    VALUES (?, ?, 'HUMAN_DECISION', 1.0, 'ACCEPTED', ?, ?, ?)
  `).run(observation.id, assetId, now, actorId, 'Marcado como objetivo protegido');

  return { success: true, assetId, message: 'Observación marcada como objetivo protegido' };
}

module.exports = {
  promoteObservationToAsset,
  markObservationAsConflict,
  markObservationAsProtected,
  getObservationDetail,
};
