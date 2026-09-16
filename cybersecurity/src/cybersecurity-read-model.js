const crypto = require('node:crypto');
const { assessInventoryCandidate } = require('./inventory-confidence-policy');
const { computeReliabilityScore, detectAntivirusGap, detectDeviceGroups } = require('./inventory-reliability');
const { listDecisions } = require('./inventory-decision-store');

const CLOSED_STATUSES = new Set(['VERIFIED', 'CLOSED']);
const ALLOWED_PRIORITIES = new Set(['P1', 'P2', 'P3', 'P4']);
const ALLOWED_STATUSES = new Set([
  'NEW', 'VALIDATION_REQUIRED', 'TEMPORARILY_ACCEPTED', 'PLANNED',
  'IN_PROGRESS', 'REMEDIATED', 'VERIFIED', 'CLOSED',
]);
const ALLOWED_INVENTORY_SOURCES = new Set(['FORTIGATE', 'KASPERSKY', 'GREENBONE', 'CANONICAL']);
const ALLOWED_INVENTORY_STATES = new Set([
  'NEW_ASSET_REVIEW', 'EPHEMERAL_REVIEW', 'CONFLICT_REVIEW',
  'INSUFFICIENT_EVIDENCE', 'PROTECTED_TARGET', 'CANONICAL',
]);

function safeJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function assetAlias(row) {
  if (row.assetName) return row.assetName;
  const suffix = String(row.targetKey || '').replace(/[^a-f0-9]/gi, '').slice(-8).toUpperCase();
  return `Activo protegido ${suffix || 'SIN-ID'}`;
}

function protectedAlias(prefix, value) {
  const suffix = crypto.createHash('sha256').update(`${prefix}:${value || ''}`).digest('hex').slice(0, 8).toUpperCase();
  return `${prefix} ${suffix}`;
}

// `protectedAlias` es de un solo sentido (SHA-256 truncado a 8 hex): no hay forma de
// decodificar el id real algebraicamente. inventory-actions.js necesitaba el id real detrás
// de un alias de "candidate"/"canonical" (para ver detalle, promover, marcar conflicto o
// protegido) y lo intentaba extraer con una regex sobre el propio alias -- nunca funcionó,
// porque el alias solo contiene el hash, no el id original. La única forma correcta es
// recorrer el universo correspondiente y volver a calcular el alias hasta encontrar el que
// coincide (barato: unos pocos miles de filas como mucho).
function resolveProtectedAlias(db, alias) {
  const match = String(alias || '').match(/^(candidate|canonical)\s+([A-F0-9]{8})$/i);
  if (!match) return null;
  const kind = match[1].toLowerCase();
  const target = `${kind} ${match[2].toUpperCase()}`;
  if (kind === 'canonical') {
    const row = db.prepare('SELECT id FROM cyber_assets').all()
      .find((r) => protectedAlias('canonical', r.id) === target);
    return row ? { kind: 'CANONICAL', id: row.id } : null;
  }
  const observation = db.prepare('SELECT id FROM cyber_asset_observations').all()
    .find((r) => protectedAlias('candidate', r.id) === target);
  if (observation) return { kind: 'CANDIDATE', id: observation.id };
  // Objetivo protegido (Greenbone): el id de "candidato" sale de target_key, no de una
  // observación -- ver el UNION ALL de listInventoryCandidates más abajo.
  const finding = db.prepare('SELECT DISTINCT target_key FROM cyber_vulnerability_findings').all()
    .find((r) => protectedAlias('candidate', r.target_key) === target);
  return finding ? { kind: 'PROTECTED_TARGET', id: finding.target_key } : null;
}

function getInventoryOverview(db, decisionsDb = null) {
  const canonical = db.prepare('SELECT count(*) count FROM cyber_assets').get().count;
  const observations = db.prepare(`
    WITH latest AS (
      SELECT source_system_id, max(captured_at) captured_at
      FROM cyber_source_snapshots WHERE processing_status = 'SUCCESS'
      GROUP BY source_system_id
    )
    SELECT source.source_type source, count(o.id) candidates,
           max(s.captured_at) capturedAt, max(s.processing_status) status
    FROM cyber_source_systems source
    JOIN latest l ON l.source_system_id = source.id
    JOIN cyber_source_snapshots s ON s.source_system_id = l.source_system_id
      AND s.captured_at = l.captured_at
    LEFT JOIN cyber_asset_observations o ON o.snapshot_id = s.id
    WHERE source.source_type IN ('FORTIGATE', 'KASPERSKY')
    GROUP BY source.source_type
  `).all();
  const greenbone = db.prepare(`
    SELECT count(DISTINCT f.target_key) candidates, count(*) findings,
           max(s.captured_at) capturedAt, max(s.processing_status) status
    FROM cyber_vulnerability_findings f
    JOIN cyber_source_snapshots s ON s.id = f.snapshot_id
  `).get();
  // Contar sobre TODA cyber_inventory_analysis_items (sin filtrar por snapshot) sumaba también
  // los análisis de capturas de FortiGate/Kaspersky ya superadas por una reimportación más
  // reciente -- invisible mientras solo existió un snapshot por fuente; con la segunda
  // reimportación de FortiGate (2026-09-15) los conflictos aparecían duplicados (417 de la
  // captura vieja + 404 de la nueva = 821). Se limita a las observaciones del snapshot más
  // reciente por fuente, igual que ya hacen listInventoryCandidates/listNetworkSegments.
  const analysisRows = db.prepare(`
    WITH latest AS (
      SELECT source_system_id, max(captured_at) captured_at
      FROM cyber_source_snapshots WHERE processing_status = 'SUCCESS'
      GROUP BY source_system_id
    )
    SELECT item.observation_id observationId, item.proposed_action proposedAction,
      item.identity_strength identityStrength
    FROM cyber_inventory_analysis_items item
    JOIN cyber_asset_observations o ON o.id = item.observation_id
    JOIN cyber_source_snapshots s ON s.id = o.snapshot_id
    JOIN latest l ON l.source_system_id = s.source_system_id AND l.captured_at = s.captured_at
  `).all();
  // canonicalAssets/pendingReview/conflicts contaban solo lo que vive en cyber-inventory.db
  // (de solo lectura -- ver inventory-decision-store.js) y nunca se movían al promover/marcar
  // conflicto desde decisionsDb. Un candidato promovido o protegido ya no es "pendiente" y sí
  // es un activo canónico; uno marcado en conflicto a mano cuenta como conflicto aunque el
  // análisis automático original no lo hubiera detectado, y uno ya promovido dejó de serlo.
  const decisions = listDecisions(decisionsDb);
  const promotedOrProtectedIds = new Set(
    decisions.filter((d) => d.decision === 'PROMOTED' || d.decision === 'PROTECTED').map((d) => d.observation_id),
  );
  const conflictObservationIds = new Set(analysisRows.filter((r) => r.proposedAction === 'CONFLICT_REVIEW').map((r) => r.observationId));
  decisions.filter((d) => d.decision === 'CONFLICT').forEach((d) => conflictObservationIds.add(d.observation_id));
  promotedOrProtectedIds.forEach((id) => conflictObservationIds.delete(id));
  const review = {
    conflicts: conflictObservationIds.size,
    insufficient: analysisRows.filter((r) => r.identityStrength === 'INSUFFICIENT').length,
  };
  const sourceCoverage = observations.map((row) => ({
    source: row.source, candidates: row.candidates, capturedAt: row.capturedAt, status: row.status,
  }));
  if (greenbone.candidates > 0) sourceCoverage.push({
    source: 'GREENBONE', candidates: greenbone.candidates,
    capturedAt: greenbone.capturedAt, status: greenbone.status,
  });
  const observedCandidates = observations.reduce((sum, row) => sum + row.candidates, 0);
  const assessed = listInventoryCandidates(db, { limit: 1 }, decisionsDb).assessmentSummary;
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      observedCandidates,
      protectedTargets: greenbone.candidates,
      canonicalAssets: canonical + promotedOrProtectedIds.size,
      pendingReview: observedCandidates + greenbone.candidates - promotedOrProtectedIds.size,
      conflicts: review.conflicts,
      insufficientEvidence: review.insufficient,
      findings: greenbone.findings,
      active: assessed.ACTIVE || 0,
      intermittent: assessed.INTERMITTENT || 0,
      inactive: assessed.INACTIVE || 0,
      staleReview: assessed.STALE_REVIEW || 0,
      segmentsPendingPolicy: assessed.SEGMENT_POLICY_REQUIRED || 0,
    },
    sourceCoverage,
  };
}

function listInventoryCandidates(db, filters = {}, decisionsDb = null) {
  if (filters.source && !ALLOWED_INVENTORY_SOURCES.has(filters.source)) {
    throw new Error('INVALID_INVENTORY_SOURCE_FILTER');
  }
  if (filters.state && !ALLOWED_INVENTORY_STATES.has(filters.state)) {
    throw new Error('INVALID_INVENTORY_STATE_FILTER');
  }
  const limit = Math.min(Math.max(Number(filters.limit) || 100, 1), 200);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  const rows = db.prepare(`
    WITH latest AS (
      SELECT source_system_id, max(captured_at) captured_at
      FROM cyber_source_snapshots WHERE processing_status = 'SUCCESS'
      GROUP BY source_system_id
    ), latest_analysis AS (
      SELECT item.observation_id, item.provisional_asset_class, item.identity_strength,
             item.proposed_action, item.confidence, item.reason_codes_json
      FROM cyber_inventory_analysis_items item
      JOIN cyber_inventory_analysis_runs run ON run.id = item.analysis_run_id
      WHERE run.completed_at = (
        SELECT max(run2.completed_at) FROM cyber_inventory_analysis_runs run2
        JOIN cyber_inventory_analysis_items item2 ON item2.analysis_run_id = run2.id
        WHERE item2.observation_id = item.observation_id
      )
    )
    SELECT 'OBSERVATION' kind, o.id candidateKey, source.source_type source,
           o.observed_at lastSeenAt, o.last_seen_source_at lastSeenSourceAt,
           o.manufacturer, o.os_family osFamily,
           o.os_version osVersion, COALESCE(a.provisional_asset_class, 'OTHER') assetClass,
           COALESCE(a.proposed_action, 'NEW_ASSET_REVIEW') state,
           COALESCE(a.identity_strength, 'INSUFFICIENT') identityStrength,
           COALESCE(a.confidence, 0) confidence, o.quality_flags_json qualityFlags,
           COALESCE(a.reason_codes_json, '[]') reasonCodes, 0 findingCount, 0 maxSeverity,
           o.source_seen_seconds sourceSeenSeconds, o.hostname_raw hostnameRaw,
           o.mac_value macValue, o.ip_value ipValue
    FROM cyber_asset_observations o
    JOIN cyber_source_snapshots s ON s.id = o.snapshot_id
    JOIN cyber_source_systems source ON source.id = s.source_system_id
    JOIN latest l ON l.source_system_id = s.source_system_id AND l.captured_at = s.captured_at
    LEFT JOIN latest_analysis a ON a.observation_id = o.id
    WHERE source.source_type IN ('FORTIGATE', 'KASPERSKY')
    UNION ALL
    SELECT 'PROTECTED_TARGET', f.target_key, 'GREENBONE', max(f.observed_at), NULL,
           NULL, NULL, NULL, 'OTHER', 'PROTECTED_TARGET',
           CASE WHEN min(f.qod) >= 70 THEN 'MEDIUM' ELSE 'LOW' END,
           CASE WHEN min(f.qod) >= 70 THEN 0.70 ELSE 0.40 END,
           '[]', '[]', count(*), max(f.severity), NULL, NULL, NULL, NULL
    FROM cyber_vulnerability_findings f GROUP BY f.target_key
    UNION ALL
    SELECT 'CANONICAL', a.id, 'CANONICAL', a.updated_at, NULL, NULL, NULL, NULL,
           a.asset_class, 'CANONICAL', 'MEDIUM', 1.0, '[]', '[]',
           (SELECT count(*) FROM cyber_vulnerability_findings f WHERE f.asset_id = a.id),
           COALESCE((SELECT max(f.severity) FROM cyber_vulnerability_findings f WHERE f.asset_id = a.id), 0),
           NULL, NULL, NULL, NULL
    FROM cyber_assets a
  `).all();
  // Promover/proteger/marcar conflicto ya no escriben en cyber-inventory.db (es de solo lectura
  // en producción -- ver hallazgo en inventory-decision-store.js); las decisiones humanas viven
  // en decisionsDb y se superponen aquí sobre la observación original ANTES de filtrar por
  // estado, para que "state=CANONICAL" encuentre los promovidos/protegidos igual que si de
  // verdad vivieran en cyber_assets. El id se mantiene con el prefijo "candidate" (no
  // "canonical") a propósito: es el mismo alias que ya usa getObservationDetail para estas
  // decisiones, y cambiarlo rompería el enlace lista -> detalle.
  const decisionsByObservationId = new Map(
    listDecisions(decisionsDb).map((decision) => [decision.observation_id, decision]),
  );
  const overlaidRows = rows.map((row) => {
    if (row.kind !== 'OBSERVATION') return row;
    const decision = decisionsByObservationId.get(row.candidateKey);
    if (!decision) return row;
    if (decision.decision === 'PROMOTED' || decision.decision === 'PROTECTED') {
      return {
        ...row,
        kind: 'CANONICAL',
        aliasPrefix: 'candidate',
        state: 'CANONICAL',
        assetClass: decision.asset_class || row.assetClass,
        canonicalName: decision.canonical_name,
        reviewedAt: decision.decided_at,
        reviewedBy: decision.decided_by,
        reviewReason: decision.note,
      };
    }
    if (decision.decision === 'CONFLICT') {
      return { ...row, state: 'CONFLICT_REVIEW', decisionNote: decision.note };
    }
    return row;
  });
  const filtered = overlaidRows.filter((row) => (!filters.source || row.source === filters.source)
    && (!filters.state || row.state === filters.state));
  const assessed = filtered.map((row) => assessInventoryCandidate({
    ...row,
    qualityFlags: safeJson(row.qualityFlags, []),
    reasonCodes: safeJson(row.reasonCodes, []),
  }));
  const assessmentSummary = assessed.reduce((summary, row) => {
    summary[row.lifecycleStatus] = (summary[row.lifecycleStatus] || 0) + 1;
    summary[row.networkProfile] = (summary[row.networkProfile] || 0) + 1;
    return summary;
  }, {});
  // Índice de confiabilidad (ver src/inventory-reliability.js): solo tiene sentido para
  // observaciones reales (FortiGate/Kaspersky), no para hallazgos de Greenbone ni activos ya
  // canónicos. Se calcula sobre TODO el conjunto filtrado (no solo la página visible) para que
  // "mismo equipo, varias tarjetas de red" agrupe aunque sus observaciones caigan en páginas
  // distintas.
  const observationRows = assessed.filter((row) => row.kind === 'OBSERVATION');
  const deviceGroups = detectDeviceGroups(observationRows.map((row) => ({ id: row.candidateKey, hostnameRaw: row.hostnameRaw, macValue: row.macValue, ipValue: row.ipValue })));
  const crossMatched = getCrossSourceMatchedObservationIds(db);
  const withReliability = assessed.map((row) => {
    if (row.kind !== 'OBSERVATION') return row;
    const hasCrossSourceMatch = crossMatched.has(row.candidateKey);
    return {
      ...row,
      reliability: computeReliabilityScore(row, { hasCrossSourceMatch, deviceGroup: deviceGroups.get(row.candidateKey) || null }),
      antivirusGapSuspected: detectAntivirusGap(row, { hasCrossSourceMatch }),
    };
  });
  const antivirusGapCount = withReliability.filter((row) => row.antivirusGapSuspected).length;
  return {
    total: filtered.length,
    assessmentSummary: { ...assessmentSummary, ANTIVIRUS_GAP_SUSPECTED: antivirusGapCount },
    items: withReliability.slice(offset, offset + limit).map(({ candidateKey, ...row }) => ({
      ...row,
      id: protectedAlias(row.aliasPrefix || (row.kind === 'CANONICAL' ? 'canonical' : 'candidate'), candidateKey),
      label: row.kind === 'CANONICAL'
        ? (row.canonicalName || protectedAlias('Activo canónico', candidateKey))
        : row.kind === 'PROTECTED_TARGET'
          ? protectedAlias('Objetivo protegido', candidateKey)
          : protectedAlias('Activo observado', candidateKey),
    })),
  };
}

// Observaciones (de cualquier fuente) que ya se corroboraron contra otra fuente distinta —
// cyber_cross_source_matches se calculaba (scripts/match-fortigate-ksc.js) pero nunca se leía
// en ningún punto de la aplicación; ver hallazgo 2026-09-15.
function getCrossSourceMatchedObservationIds(db) {
  const rows = db.prepare(`
    SELECT left_observation_id id FROM cyber_cross_source_matches WHERE match_status = 'PROPOSED'
    UNION
    SELECT right_observation_id id FROM cyber_cross_source_matches WHERE match_status = 'PROPOSED'
  `).all();
  return new Set(rows.map((row) => row.id));
}

function listNetworkSegments(db, options = {}) {
  const observations = db.prepare(`
    WITH latest AS (
      SELECT source_system_id, max(captured_at) captured_at
      FROM cyber_source_snapshots WHERE processing_status = 'SUCCESS'
      GROUP BY source_system_id
    )
    SELECT o.id observationId, o.segment_id segmentKey, segment.canonical_name interfaceName,
           o.ip_value ipValue, o.observed_at lastSeenAt,
           o.last_seen_source_at lastSeenSourceAt, o.quality_flags_json qualityFlags
    FROM cyber_asset_observations o
    JOIN cyber_network_segments segment ON segment.id = o.segment_id
    JOIN cyber_source_snapshots s ON s.id = o.snapshot_id
    JOIN cyber_source_systems source ON source.id = s.source_system_id
    JOIN latest l ON l.source_system_id = s.source_system_id AND l.captured_at = s.captured_at
    WHERE source.source_type = 'FORTIGATE' AND o.segment_id IS NOT NULL
  `).all();
  const segments = new Map();
  for (const observation of observations) {
    const assessed = assessInventoryCandidate({
      source: 'FORTIGATE', lastSeenAt: observation.lastSeenAt,
      lastSeenSourceAt: observation.lastSeenSourceAt,
      qualityFlags: safeJson(observation.qualityFlags, []), reasonCodes: [], confidence: 0.5,
    });
    const item = segments.get(observation.segmentKey) || {
      segmentKey: observation.segmentKey, interfaceName: observation.interfaceName,
      observations: 0, active: 0, intermittent: 0,
      inactive: 0, staleReview: 0, ephemeralMacs: 0, lastActivityAt: null,
      referenceIps: new Set(),
      knownIps: new Set(),
      members: [],
    };
    item.observations += 1;
    if (observation.ipValue) {
      item.knownIps.add(observation.ipValue);
      if (item.referenceIps.size < 3) item.referenceIps.add(observation.ipValue);
    }
    item.members.push({
      id: observation.observationId,
      ip: observation.ipValue,
      lifecycleStatus: assessed.lifecycleStatus,
      ephemeralMac: assessed.qualityFlags.includes('LOCALLY_ADMINISTERED_MAC'),
      lastActivityAt: observation.lastSeenSourceAt || observation.lastSeenAt || null,
    });
    if (assessed.lifecycleStatus === 'ACTIVE') item.active += 1;
    if (assessed.lifecycleStatus === 'INTERMITTENT') item.intermittent += 1;
    if (assessed.lifecycleStatus === 'INACTIVE') item.inactive += 1;
    if (assessed.lifecycleStatus === 'STALE_REVIEW') item.staleReview += 1;
    if (assessed.qualityFlags.includes('LOCALLY_ADMINISTERED_MAC')) item.ephemeralMacs += 1;
    const seen = observation.lastSeenSourceAt || observation.lastSeenAt;
    if (seen && (!item.lastActivityAt || seen > item.lastActivityAt)) item.lastActivityAt = seen;
    segments.set(observation.segmentKey, item);
  }
  return {
    total: segments.size,
    items: [...segments.values()].map(({ segmentKey, interfaceName, referenceIps, knownIps, members, ...item }) => ({
      ...item,
      knownIpCount: knownIps.size,
      id: protectedAlias('segment', segmentKey),
      label: protectedAlias('Segmento', segmentKey),
      classificationStatus: 'PENDING',
      ...(options.includeSensitive ? { interfaceName, referenceIps: [...referenceIps], members } : {}),
    })).sort((a, b) => b.observations - a.observations),
  };
}

function getCybersecurityOverview(db) {
  const cases = db.prepare(`
    SELECT technical_priority priority, workflow_status status,
           max_severity severity, finding_count findingCount
    FROM cyber_remediation_cases
  `).all();
  const findings = db.prepare(`
    SELECT count(*) total,
           COALESCE(sum(CASE WHEN confidence_status = 'CONFIRMED_CANDIDATE' THEN 1 ELSE 0 END), 0) confirmed,
           COALESCE(sum(CASE WHEN confidence_status = 'REVIEW_REQUIRED' THEN 1 ELSE 0 END), 0) review,
           COALESCE(sum(CASE WHEN confidence_status = 'VALIDATION_REQUIRED' THEN 1 ELSE 0 END), 0) validation
    FROM cyber_vulnerability_findings
  `).get();
  const scan = db.prepare(`
    SELECT s.captured_at capturedAt, s.accepted_count acceptedCount,
           s.processing_status status
    FROM cyber_source_snapshots s
    JOIN cyber_source_systems source ON source.id = s.source_system_id
    WHERE source.source_type = 'GREENBONE'
    ORDER BY s.captured_at DESC LIMIT 1
  `).get() || null;
  const byPriority = Object.fromEntries(['P1', 'P2', 'P3', 'P4'].map((key) => [key, 0]));
  const byStatus = {};
  for (const item of cases) {
    byPriority[item.priority] = (byPriority[item.priority] || 0) + 1;
    byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  }
  return {
    generatedAt: new Date().toISOString(),
    cases: {
      total: cases.length,
      open: cases.filter((item) => !CLOSED_STATUSES.has(item.status)).length,
      critical: cases.filter((item) => item.priority === 'P1').length,
      validationRequired: cases.filter((item) => item.status === 'VALIDATION_REQUIRED').length,
      byPriority,
      byStatus,
      maxSeverity: cases.length ? Math.max(...cases.map((item) => item.severity)) : 0,
    },
    findings: {
      total: findings.total,
      confirmedCandidate: findings.confirmed,
      reviewRequired: findings.review,
      validationRequired: findings.validation,
    },
    latestScan: scan,
  };
}

function listRemediationCases(db, filters = {}) {
  const where = [];
  const params = [];
  if (filters.priority) {
    if (!ALLOWED_PRIORITIES.has(filters.priority)) throw new Error('INVALID_PRIORITY_FILTER');
    where.push('c.technical_priority = ?'); params.push(filters.priority);
  }
  if (filters.status) {
    if (!ALLOWED_STATUSES.has(filters.status)) throw new Error('INVALID_STATUS_FILTER');
    where.push('c.workflow_status = ?'); params.push(filters.status);
  }
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 100);
  params.push(limit);
  const rows = db.prepare(`
    SELECT c.id, c.target_key targetKey, c.canonical_title title,
           c.case_category category, c.technical_priority priority,
           c.workflow_status status, c.max_severity maxSeverity,
           c.max_qod maxQod, c.finding_count findingCount, c.cves_json cves,
           c.first_seen_at firstSeenAt, c.last_seen_at lastSeenAt,
           c.risk_acceptance_until riskAcceptanceUntil,
           a.canonical_name assetName, a.criticality assetCriticality
    FROM cyber_remediation_cases c
    LEFT JOIN cyber_assets a ON a.id = c.asset_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY CASE c.technical_priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END,
             c.max_severity DESC, c.last_seen_at DESC
    LIMIT ?
  `).all(...params);
  return rows.map(({ targetKey, assetName, ...row }) => ({
    ...row,
    asset: assetAlias({ targetKey, assetName }),
    cves: safeJson(row.cves, []),
  }));
}

function getRemediationCase(db, id) {
  const remediationCase = db.prepare(`
    SELECT c.id, c.target_key targetKey, c.canonical_title title,
           c.case_category category, c.technical_priority priority,
           c.workflow_status status, c.max_severity maxSeverity,
           c.max_qod maxQod, c.finding_count findingCount, c.cves_json cves,
           c.first_seen_at firstSeenAt, c.last_seen_at lastSeenAt,
           c.risk_acceptance_until riskAcceptanceUntil,
           c.treatment_reason treatmentReason,
           a.canonical_name assetName, a.criticality assetCriticality
    FROM cyber_remediation_cases c
    LEFT JOIN cyber_assets a ON a.id = c.asset_id WHERE c.id = ?
  `).get(id);
  if (!remediationCase) return null;
  const findings = db.prepare(`
    SELECT f.id, f.title, f.severity, f.qod, f.port, f.transport,
           f.nvt_oid nvtOid, f.cves_json cves, f.evidence_json evidence,
           f.confidence_status confidenceStatus, f.observed_at observedAt
    FROM cyber_vulnerability_findings f
    JOIN cyber_remediation_case_findings link ON link.finding_id = f.id
    WHERE link.case_id = ? ORDER BY f.severity DESC, f.title
  `).all(id).map((finding) => ({
    ...finding,
    cves: safeJson(finding.cves, []),
    evidence: safeJson(finding.evidence, {}),
  }));
  const { targetKey, assetName, ...safeCase } = remediationCase;
  return {
    ...safeCase,
    asset: assetAlias({ targetKey, assetName }),
    cves: safeJson(remediationCase.cves, []),
    findings,
  };
}

module.exports = {
  getCybersecurityOverview, getInventoryOverview, getRemediationCase,
  getCrossSourceMatchedObservationIds,
  listInventoryCandidates, listNetworkSegments, listRemediationCases,
  protectedAlias, resolveProtectedAlias,
};
