const crypto = require('node:crypto');
const { openCyberDatabase } = require('../db/open-database');
const { resolveProtectedAlias, getCrossSourceMatchedObservationIds, protectedAlias } = require('./cybersecurity-read-model');
const { computeReliabilityScore, detectAntivirusGap, detectDeviceGroups } = require('./inventory-reliability');
const { assessInventoryCandidate } = require('./inventory-confidence-policy');

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

function cleanNote(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (text.length > 500) throw new Error('INVALID_NOTE_TOO_LONG');
  return text;
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
      // Bug real (2026-09-16, encontrado con clic real en el navegador): estos 3 `id` daban el
      // id crudo interno (ej. "observation-c97dd53c...") en vez del alias público
      // ("candidate XXXXXXXX"/"canonical XXXXXXXX") que ya usa listInventoryCandidates. El
      // panel de detalle reutiliza query.data.id para Promover/Marcar conflicto/Marcar
      // protegido -- con el id crudo, la ruta nunca coincidía (CANDIDATE_ID_PATTERN exige el
      // prefijo "candidate "/"canonical ") y siempre daba 405 METHOD_NOT_ALLOWED.
      id: protectedAlias('canonical', asset.id),
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
      id: protectedAlias('candidate', resolved.id),
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
  const hasCrossSourceMatch = crossMatched.has(observation.id);

  // La vista de detalle mostraba "Confianza: NaN%" y "Autoridad: undefined" -- nunca corría
  // assessInventoryCandidate (a diferencia de la lista), así que confidence/sourceAuthority/
  // identityPolicy/networkIdentityRule/lifecycleStatus/networkProfile no existían en la
  // respuesta. Se corre el mismo cálculo que usa listInventoryCandidates para que detalle y
  // lista muestren exactamente los mismos números.
  const assessed = assessInventoryCandidate({
    source: observation.sourceType || 'UNKNOWN',
    lastSeenAt: observation.observed_at,
    lastSeenSourceAt: observation.last_seen_source_at,
    osFamily: observation.os_family,
    assetClass: analysis?.provisional_asset_class || 'OTHER',
    state: analysis?.proposed_action || 'NEW_ASSET_REVIEW',
    identityStrength: analysis?.identity_strength || 'INSUFFICIENT',
    confidence: analysis?.confidence || 0,
    qualityFlags,
    reasonCodes,
  });

  return {
    kind: 'OBSERVATION',
    id: protectedAlias('candidate', observation.id),
    label: `Activo observado ${observation.id.slice(-8).toUpperCase()}`,
    observedAt: observation.observed_at,
    ingestedAt: observation.ingested_at,
    segmentId: observation.segment_id,
    ipValue: observation.ip_value,
    macValue: observation.mac_value,
    hostnameRaw: observation.hostname_raw,
    manufacturer: observation.manufacturer,
    osVersion: observation.os_version,
    deviceClassRaw: observation.device_class_raw,
    firstSeenSourceAt: observation.first_seen_source_at,
    sourceSeenSeconds: observation.source_seen_seconds,
    attributeConfidence: JSON.parse(observation.attribute_confidence_json || '{}'),
    sanitizedAttributes: JSON.parse(observation.sanitized_attributes_json || '{}'),
    ...assessed,
    reliability: computeReliabilityScore(
      { sourceSeenSeconds: observation.source_seen_seconds, hostnameRaw: observation.hostname_raw, qualityFlags, reasonCodes },
      { hasCrossSourceMatch, deviceGroup: deviceGroups.get(observation.id) || null },
    ),
    antivirusGapSuspected: detectAntivirusGap(assessed, { hasCrossSourceMatch }),
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
  // Nota libre del humano que promueve (decisión del usuario 2026-09-16: "este equipo lo
  // instalé recientemente para nuestro servidor openvas de prueba piloto" -- el motivo de la
  // decisión no debía quedar solo en la cabeza de quien la tomó). cyber_assets ya tenía
  // review_reason/reviewed_by/reviewed_at, pero promote nunca los llenaba.
  const note = cleanNote(body.note);

  db.prepare(`
    INSERT INTO cyber_assets (id, canonical_name, asset_class, criticality, lifecycle_status, reconciliation_status, created_at, updated_at, reviewed_at, reviewed_by, review_reason)
    VALUES (?, ?, ?, ?, 'CONFIRMED_ACTIVE', 'HUMAN_VERIFIED', ?, ?, ?, ?, ?)
  `).run(assetId, canonicalName, assetClass, criticality, now, now, now, actorId, note);

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
  const canonicalName = body?.canonicalName || `Objetivo protegido ${observation.id.slice(-8).toUpperCase()}`;
  const note = cleanNote(body?.note);

  db.prepare(`
    INSERT INTO cyber_assets (id, canonical_name, asset_class, criticality, lifecycle_status, reconciliation_status, created_at, updated_at, reviewed_at, reviewed_by, review_reason)
    VALUES (?, ?, 'OTHER', 'HIGH', 'CONFIRMED_ACTIVE', 'HUMAN_VERIFIED', ?, ?, ?, ?, ?)
  `).run(assetId, canonicalName, now, now, now, actorId, note);

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
