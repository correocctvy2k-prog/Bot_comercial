const crypto = require('node:crypto');
const { openCyberDatabase } = require('../db/open-database');
const { resolveProtectedAlias, getCrossSourceMatchedObservationIds, protectedAlias } = require('./cybersecurity-read-model');
const { computeReliabilityScore, detectAntivirusGap, detectDeviceGroups } = require('./inventory-reliability');
const { assessInventoryCandidate } = require('./inventory-confidence-policy');
const { getDecisionByObservationId, saveDecision } = require('./inventory-decision-store');
const { listPolicies } = require('./network-policy-store');

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

// Un candidato ya queda asociado a su subred desde que FortiGate lo importó (segment_id se
// calcula una sola vez, por IP contra el CIDR de cada segmento en fortigate-importer.js) --
// promover/proteger no cambia ni repite esa asociación, solo la hace visible. Se prefiere el
// nombre que el usuario ya le dio en Subredes (policy.name, ej. "CCTV, control de acceso y
// alarmas") sobre el nombre crudo de interfaz de FortiGate (canonical_name, ej. "port10") si ya
// se clasificó (decisión del usuario 2026-09-16: "se debe mostrar la subred a la que fue
// asociado").
function resolveObservationSegment(db, policyDb, segmentId) {
  if (!segmentId) return null;
  const segment = db.prepare('SELECT canonical_name FROM cyber_network_segments WHERE id = ?').get(segmentId);
  if (!segment) return null;
  const alias = protectedAlias('segment', segmentId);
  const policy = listPolicies(policyDb).find((item) => item.id === alias);
  return { id: alias, name: policy?.name || segment.canonical_name, classified: Boolean(policy) };
}

function findingsSummaryForTarget(db, targetKey) {
  const rows = db.prepare('SELECT title, severity, cves_json, observed_at FROM cyber_vulnerability_findings WHERE target_key = ? ORDER BY severity DESC LIMIT 20').all(targetKey);
  return rows.map((row) => ({ title: row.title, severity: row.severity, cves: JSON.parse(row.cves_json || '[]'), observedAt: row.observed_at }));
}

// getObservationDetail acepta `decisionsDb` opcional (los scripts/tests que solo leen no
// necesitan pasarlo) -- ver hallazgo 2026-09-16 en inventory-decision-store.js: cyber-inventory.db
// es de solo lectura en producción (tres capas: :ro, read_only del contenedor, --immutable), así
// que promover/proteger/marcar conflicto ya NO escriben en cyber_assets/cyber_asset_observation_links
// (viven en esa base) -- se guardan en un almacén aparte, en el único volumen escribible
// (/admin-data). Un candidato promovido/protegido se sigue resolviendo por su alias "candidate"
// original (la observación no cambia, cambia el "overlay" de decisión) y se devuelve con forma
// CANONICAL para que el frontend lo muestre igual que antes.
function getObservationDetail(db, decisionsDb, policyDb, candidateKey) {
  const resolved = resolveProtectedAlias(db, candidateKey);
  if (!resolved) return null;

  if (resolved.kind === 'CANONICAL') {
    // Compatibilidad hacia atrás: si alguna vez existió un activo promovido antes de este
    // cambio (cyber_assets), se sigue pudiendo ver. Los nuevos ya no se crean así.
    const asset = db.prepare('SELECT * FROM cyber_assets WHERE id = ?').get(resolved.id);
    if (!asset) return null;
    return {
      kind: 'CANONICAL',
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

  const decision = getDecisionByObservationId(decisionsDb, observation.id);
  const candidateAlias = protectedAlias('candidate', observation.id);
  const segment = resolveObservationSegment(db, policyDb, observation.segment_id);

  // Si ya se promovió o protegió, se muestra con la misma forma CANONICAL que antes usaba
  // cyber_assets -- el frontend no necesita saber que ahora vive en otro almacén.
  if (decision && (decision.decision === 'PROMOTED' || decision.decision === 'PROTECTED')) {
    return {
      kind: 'CANONICAL',
      id: candidateAlias,
      label: decision.canonical_name || `Activo ${decision.decision === 'PROTECTED' ? 'protegido' : 'promovido'} ${observation.id.slice(-8).toUpperCase()}`,
      canonicalName: decision.canonical_name,
      assetClass: decision.asset_class,
      criticality: decision.criticality,
      segment,
      lifecycleStatus: 'CONFIRMED_ACTIVE',
      reconciliationStatus: 'HUMAN_VERIFIED',
      reviewedAt: decision.decided_at,
      reviewedBy: decision.decided_by,
      reviewReason: decision.note,
    };
  }

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
    // Un candidato marcado en conflicto a mano (decision.decision === 'CONFLICT') se muestra
    // como tal aunque el análisis automático original no lo hubiera detectado. Uno ignorado a
    // mano (decisión del usuario 2026-09-16: "agregar un botón de ignorar para otros activos
    // irrelevantes") sale de "Requiere atención" aunque el análisis automático sí lo marcara.
    state: decision?.decision === 'CONFLICT' ? 'CONFLICT_REVIEW'
      : decision?.decision === 'IGNORED' ? 'IGNORED'
        : (analysis?.proposed_action || 'NEW_ASSET_REVIEW'),
    identityStrength: analysis?.identity_strength || 'INSUFFICIENT',
    confidence: analysis?.confidence || 0,
    qualityFlags,
    reasonCodes,
  });

  return {
    kind: 'OBSERVATION',
    id: candidateAlias,
    label: `Activo observado ${observation.id.slice(-8).toUpperCase()}`,
    observedAt: observation.observed_at,
    ingestedAt: observation.ingested_at,
    segment,
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
    // Nota dejada al marcar conflicto o ignorar a mano (decision_store), si la hay.
    decisionNote: (decision?.decision === 'CONFLICT' || decision?.decision === 'IGNORED') ? decision.note : null,
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

function promoteObservationToAsset(db, decisionsDb, candidateKey, body, actorId) {
  const observation = requireObservation(db, candidateKey);
  if (getDecisionByObservationId(decisionsDb, observation.id)) throw new Error('OBSERVATION_ALREADY_LINKED');

  const assetId = `asset_${crypto.randomBytes(8).toString('hex')}`;
  const assetClass = body.assetClass || 'OTHER';
  const criticality = body.criticality || 'MEDIUM';
  const canonicalName = body.canonicalName || `Activo promovido ${observation.id.slice(-8).toUpperCase()}`;
  // Nota libre del humano que promueve (decisión del usuario 2026-09-16: "este equipo lo
  // instalé recientemente para nuestro servidor openvas de prueba piloto").
  const note = cleanNote(body.note);

  saveDecision(decisionsDb, {
    observationId: observation.id, assetId, decision: 'PROMOTED',
    canonicalName, assetClass, criticality,
    macValue: observation.mac_value, ipValue: observation.ip_value, hostnameRaw: observation.hostname_raw,
    note, decidedBy: actorId,
  });

  return { success: true, assetId, message: 'Observación promovida a activo canónico exitosamente' };
}

function markObservationAsConflict(db, decisionsDb, candidateKey, body, actorId) {
  const observation = requireObservation(db, candidateKey);
  const note = cleanNote(body?.note);

  saveDecision(decisionsDb, {
    observationId: observation.id, assetId: `decision_${crypto.randomBytes(8).toString('hex')}`, decision: 'CONFLICT',
    macValue: observation.mac_value, ipValue: observation.ip_value, hostnameRaw: observation.hostname_raw,
    note, decidedBy: actorId || 'verified-superadmin',
  });

  return { success: true, message: 'Observación marcada como conflicto para revisión' };
}

function markObservationAsProtected(db, decisionsDb, candidateKey, body, actorId) {
  const observation = requireObservation(db, candidateKey);
  if (getDecisionByObservationId(decisionsDb, observation.id)) throw new Error('OBSERVATION_ALREADY_LINKED');

  const assetId = `asset_${crypto.randomBytes(8).toString('hex')}`;
  const canonicalName = body?.canonicalName || `Objetivo protegido ${observation.id.slice(-8).toUpperCase()}`;
  const note = cleanNote(body?.note);

  saveDecision(decisionsDb, {
    observationId: observation.id, assetId, decision: 'PROTECTED',
    canonicalName, assetClass: 'OTHER', criticality: 'HIGH',
    macValue: observation.mac_value, ipValue: observation.ip_value, hostnameRaw: observation.hostname_raw,
    note, decidedBy: actorId,
  });

  return { success: true, assetId, message: 'Observación marcada como objetivo protegido' };
}

// Pedido del usuario 2026-09-16: "podemos ignorar los identificados de las redes wifi y
// agregar un botón de ignorar para otros activos irrelevantes" -- la exclusión de WiFi es
// automática (ver onWifiSegment en listInventoryCandidates), esto cubre el resto: un humano
// descarta a mano un falso positivo de "Requiere atención" sin tener que promoverlo/protegerlo.
// Igual que promote/protect, no se puede ignorar algo ya promovido/protegido por accidente
// (saveDecision hace upsert, así que sin este guard se perdería la decisión anterior).
function markObservationAsIgnored(db, decisionsDb, candidateKey, body, actorId) {
  const observation = requireObservation(db, candidateKey);
  const existing = getDecisionByObservationId(decisionsDb, observation.id);
  if (existing && (existing.decision === 'PROMOTED' || existing.decision === 'PROTECTED')) {
    throw new Error('OBSERVATION_ALREADY_LINKED');
  }
  const note = cleanNote(body?.note);

  saveDecision(decisionsDb, {
    observationId: observation.id, assetId: `decision_${crypto.randomBytes(8).toString('hex')}`, decision: 'IGNORED',
    macValue: observation.mac_value, ipValue: observation.ip_value, hostnameRaw: observation.hostname_raw,
    note, decidedBy: actorId || 'verified-superadmin',
  });

  return { success: true, message: 'Observación marcada como irrelevante e ignorada' };
}

module.exports = {
  promoteObservationToAsset,
  markObservationAsConflict,
  markObservationAsIgnored,
  markObservationAsProtected,
  getObservationDetail,
};
