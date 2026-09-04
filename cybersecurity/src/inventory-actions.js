const crypto = require('node:crypto');
const { openCyberDatabase } = require('./db/open-database');
const { protectedAlias } = require('./cybersecurity-read-model');

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

function getObservationDetail(db, candidateKey) {
  // The candidateKey format is like "candidate BF05F0E8" or "canonical ABC12345"
  // We need to extract the actual key from the label
  const match = candidateKey.match(/^(candidate|canonical|segment)\s+(.+)$/);
  if (!match) return null;
  
  const kind = match[1].toUpperCase();
  const key = match[2];
  
  if (kind === 'CANONICAL') {
    const asset = db.prepare('SELECT * FROM cyber_assets WHERE id = ?').get(key);
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
  
  if (kind === 'CANDIDATE') {
    // The candidate key is the observation ID
    const observation = db.prepare('SELECT * FROM cyber_asset_observations WHERE id = ?').get(key);
    if (!observation) return null;
    
    // Get analysis if exists
    const analysis = db.prepare(`
      SELECT item.* FROM cyber_inventory_analysis_items item
      JOIN cyber_inventory_analysis_runs run ON run.id = item.analysis_run_id
      WHERE item.observation_id = ?
      ORDER BY run.completed_at DESC LIMIT 1
    `).get(observation.id);
    
    return {
      kind: 'OBSERVATION',
      id: observation.id,
      label: `Activo observado ${observation.id.slice(-8).toUpperCase()}`,
      source: observation.source_system_id ? 'FORTIGATE' : 'UNKNOWN',
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
      qualityFlags: JSON.parse(observation.quality_flags_json || '[]'),
      sanitizedAttributes: JSON.parse(observation.sanitized_attributes_json || '{}'),
      analysis: analysis ? {
        provisionalAssetClass: analysis.provisional_asset_class,
        identityStrength: analysis.identity_strength,
        proposedAction: analysis.proposed_action,
        confidence: analysis.confidence,
        reasonCodes: JSON.parse(analysis.reason_codes_json || '[]'),
      } : null,
    };
  }
  
  return null;
}

function promoteObservationToAsset(db, candidateKey, body, actorId) {
  const match = candidateKey.match(/^(candidate|canonical|segment)\s+(.+)$/);
  if (!match) throw new Error('INVALID_CANDIDATE_KEY');
  
  const kind = match[1].toUpperCase();
  const key = match[2];
  
  if (kind !== 'CANDIDATE') {
    throw new Error('ONLY_OBSERVATIONS_CAN_BE_PROMOTED');
  }
  
  const observation = db.prepare('SELECT * FROM cyber_asset_observations WHERE id = ?').get(key);
  if (!observation) throw new Error('OBSERVATION_NOT_FOUND');
  
  // Check if already linked to an asset
  const existingLink = db.prepare('SELECT asset_id FROM cyber_asset_observation_links WHERE observation_id = ? AND decision_status = \'ACCEPTED\'').get(observation.id);
  if (existingLink) {
    throw new Error('OBSERVATION_ALREADY_LINKED');
  }
  
  const now = new Date().toISOString();
  const assetId = `asset_${crypto.randomBytes(8).toString('hex')}`;
  
  // Create the asset
  const assetClass = body.assetClass || 'OTHER';
  const criticality = body.criticality || 'MEDIUM';
  
  db.prepare(`
    INSERT INTO cyber_assets (id, canonical_name, asset_class, criticality, lifecycle_status, reconciliation_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'CONFIRMED_ACTIVE', 'HUMAN_VERIFIED', ?, ?)
  `).run(
    `asset_${crypto.randomBytes(8).toString('hex')}`,
    body.canonicalName || `Activo promovido ${observation.id.slice(-8).toUpperCase()}`,
    assetClass,
    body.criticality || 'MEDIUM',
    new Date().toISOString(),
    new Date().toISOString()
  );
  
  const assetIdResult = db.prepare('SELECT id FROM cyber_assets WHERE canonical_name = ? ORDER BY created_at DESC LIMIT 1').get(body.canonicalName || `Activo promovido ${observation.id.slice(-8).toUpperCase()}`);
  const assetId = assetIdResult.id;
  
  // Link observation to asset
  db.prepare(`
    INSERT INTO cyber_asset_observation_links (observation_id, asset_id, link_method, confidence, decision_status, decided_at, decided_by, reason)
    VALUES (?, ?, 'HUMAN_DECISION', 1.0, 'ACCEPTED', ?, ?, ?)
  `).run(observation.id, assetId, new Date().toISOString(), actorId, 'Promovido manualmente desde inventario');
  
  // Update observation with link
  db.prepare('UPDATE cyber_asset_observations SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), observation.id);
  
  // Create identifiers from observation
  if (observation.mac_value) {
    db.prepare(`
      INSERT INTO cyber_asset_identifiers (id, asset_id, identifier_type, normalized_value, display_value_masked, valid_from, confidence, verification_status, is_locally_administered, created_at, updated_at)
      VALUES (?, ?, 'MAC', ?, ?, ?, 1.0, 'HUMAN_VERIFIED', ?, ?, ?)
    `).run(
      `ident_${crypto.randomBytes(8).toString('hex')}`,
      assetId,
      observation.mac_value.toLowerCase(),
      observation.mac_value,
      new Date().toISOString(),
      observation.mac_value.startsWith('02:') || observation.mac_value.startsWith('06:') || observation.mac_value.startsWith('0a:') ? 1 : 0,
      new Date().toISOString(),
      new Date().toISOString()
    );
  }
  
  if (observation.ip_value) {
    db.prepare(`
      INSERT INTO cyber_asset_identifiers (id, asset_id, identifier_type, normalized_value, display_value_masked, valid_from, confidence, verification_status, created_at, updated_at)
      VALUES (?, ?, 'IPV4', ?, ?, ?, 1.0, 'CORROBORATED', ?, ?)
    `).run(
      `ident_${crypto.randomBytes(8).toString('hex')}`,
      assetId,
      observation.ip_value,
      observation.ip_value,
      new Date().toISOString(),
      new Date().toISOString(),
      new Date().toISOString()
    );
  }
  
  if (observation.hostname_raw) {
    db.prepare(`
      INSERT INTO cyber_asset_identifiers (id, asset_id, identifier_type, normalized_value, display_value_masked, valid_from, confidence, verification_status, created_at, updated_at)
      VALUES (?, ?, 'HOSTNAME', ?, ?, ?, 0.8, 'CORROBORATED', ?, ?)
    `).run(
      `ident_${crypto.randomBytes(8).toString('hex')}`,
      assetId,
      observation.hostname_raw.toLowerCase(),
      observation.hostname_raw,
      new Date().toISOString(),
      new Date().toISOString(),
      new Date().toISOString()
    );
  }
  
  // Update observation with link info
  db.prepare('UPDATE cyber_asset_observations SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), observation.id);
  
  return {
    success: true,
    assetId,
    message: 'Observación promovida a activo canónico exitosamente',
  };
}

function markObservationAsConflict(db, candidateKey, body, actorId) {
  const match = candidateKey.match(/^(candidate|canonical|segment)\s+(.+)$/);
  if (!match) throw new Error('INVALID_CANDIDATE_KEY');
  
  const kind = match[1].toUpperCase();
  const key = match[2];
  
  if (kind !== 'CANDIDATE') {
    throw new Error('ONLY_OBSERVATIONS_CAN_BE_MARKED_AS_CONFLICT');
  }
  
  const observation = db.prepare('SELECT * FROM cyber_asset_observations WHERE id = ?').get(key);
  if (!observation) throw new Error('OBSERVATION_NOT_FOUND');
  
  // Update the analysis with conflict action
  const now = new Date().toISOString();
  const analysisRunId = `analysis_${crypto.randomBytes(8).toString('hex')}`;
  
  // Create analysis run if not exists
  const existingRun = db.prepare('SELECT id FROM cyber_inventory_analysis_runs WHERE snapshot_id = (SELECT snapshot_id FROM cyber_asset_observations WHERE id = ?) AND completed_at = (SELECT MAX(completed_at) FROM cyber_inventory_analysis_runs WHERE snapshot_id = (SELECT snapshot_id FROM cyber_asset_observations WHERE id = ?))').get(observation.id, observation.id);
  
  let runId = existingRun?.id;
  if (!runId) {
    runId = `analysis_${crypto.randomBytes(8).toString('hex')}`;
    db.prepare(`
      INSERT INTO cyber_inventory_analysis_runs (id, snapshot_id, policy_version, completed_at, status)
      VALUES (?, (SELECT snapshot_id FROM cyber_asset_observations WHERE id = ?), 'inventory-confidence-v2', ?, 'COMPLETED')
    `).run(runId, observation.id, new Date().toISOString());
  }
  
  // Insert or update analysis item
  db.prepare(`
    INSERT INTO cyber_inventory_analysis_items (id, analysis_run_id, observation_id, provisional_asset_class, identity_strength, proposed_action, confidence, reason_codes_json)
    VALUES (?, ?, ?, 'OTHER', 'LOW', 'CONFLICT_REVIEW', 0.5, '["MANUAL_CONFLICT"]')
    ON CONFLICT(analysis_run_id, observation_id) DO UPDATE SET
      proposed_action = 'CONFLICT_REVIEW',
      identity_strength = 'LOW',
      confidence = 0.5,
      reason_codes_json = '["MANUAL_CONFLICT"]'
  `).run(`item_${crypto.randomBytes(8).toString('hex')}`, runId, observation.id);
  
  // Update observation
  db.prepare('UPDATE cyber_asset_observations SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), observation.id);
  
  return {
    success: true,
    message: 'Observación marcada como conflicto para revisión',
  };
}

function markObservationAsProtected(db, candidateKey, body, actorId) {
  const match = candidateKey.match(/^(candidate|canonical|segment)\s+(.+)$/);
  if (!match) throw new Error('INVALID_CANDIDATE_KEY');
  
  const kind = match[1].toUpperCase();
  const key = match[2];
  
  if (kind !== 'CANDIDATE') {
    throw new Error('ONLY_OBSERVATIONS_CAN_BE_PROTECTED');
  }
  
  const observation = db.prepare('SELECT * FROM cyber_asset_observations WHERE id = ?').get(key);
  if (!observation) throw new Error('OBSERVATION_NOT_FOUND');
  
  // Create a protected target asset
  const assetId = `asset_${crypto.randomBytes(8).toString('hex')}`;
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO cyber_assets (id, canonical_name, asset_class, criticality, lifecycle_status, reconciliation_status, created_at, updated_at)
    VALUES (?, ?, 'OTHER', 'HIGH', 'CONFIRMED_ACTIVE', 'HUMAN_VERIFIED', ?, ?)
  `).run(
    `asset_${crypto.randomBytes(8).toString('hex')}`,
    `Objetivo protegido ${observation.id.slice(-8).toUpperCase()}`,
    new Date().toISOString(),
    new Date().toISOString()
  );
  
  const assetIdResult = db.prepare('SELECT id FROM cyber_assets WHERE canonical_name LIKE ? ORDER BY created_at DESC LIMIT 1').get(`Objetivo protegido ${observation.id.slice(-8).toUpperCase()}%`);
  const assetId = assetIdResult.id;
  
  // Link observation to protected asset
  db.prepare(`
    INSERT INTO cyber_asset_observation_links (observation_id, asset_id, link_method, confidence, decision_status, decided_at, decided_by, reason)
    VALUES (?, ?, 'HUMAN_DECISION', 1.0, 'ACCEPTED', ?, ?, ?)
  `).run(observation.id, assetId, new Date().toISOString(), actorId, 'Marcado como objetivo protegido');
  
  // Update observation
  db.prepare('UPDATE cyber_asset_observations SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), observation.id);
  
  return {
    success: true,
    assetId,
    message: 'Observación marcada como objetivo protegido',
  };
}

function getObservationDetail(db, candidateKey) {
  const match = candidateKey.match(/^(candidate|canonical|segment)\s+(.+)$/);
  if (!match) return null;
  
  const kind = match[1].toUpperCase();
  const key = match[2];
  
  if (kind === 'CANONICAL') {
    const asset = db.prepare('SELECT * FROM cyber_assets WHERE id = ?').get(key);
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
  
  if (kind === 'CANDIDATE') {
    const observation = db.prepare('SELECT * FROM cyber_asset_observations WHERE id = ?').get(key);
    if (!observation) return null;
    
    const analysis = db.prepare(`
      SELECT item.* FROM cyber_inventory_analysis_items item
      JOIN cyber_inventory_analysis_runs run ON run.id = item.analysis_run_id
      WHERE item.observation_id = ?
      ORDER BY run.completed_at DESC LIMIT 1
    `).get(observation.id);
    
    return {
      kind: 'OBSERVATION',
      id: observation.id,
      label: `Activo observado ${observation.id.slice(-8).toUpperCase()}`,
      source: observation.source_system_id ? 'FORTIGATE' : 'UNKNOWN',
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
      qualityFlags: JSON.parse(observation.quality_flags_json || '[]'),
      sanitizedAttributes: JSON.parse(observation.sanitized_attributes_json || '{}'),
      analysis: analysis ? {
        provisionalAssetClass: analysis.provisional_asset_class,
        identityStrength: analysis.identity_strength,
        proposedAction: analysis.proposed_action,
        confidence: analysis.confidence,
        reasonCodes: JSON.parse(analysis.reason_codes_json || '[]'),
      } : null,
    };
  }
  
  return null;
}

module.exports = {
  promoteObservationToAsset,
  markObservationAsConflict,
  markObservationAsProtected,
  getObservationDetail,
};