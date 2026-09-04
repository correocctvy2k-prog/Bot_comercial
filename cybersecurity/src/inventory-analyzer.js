const { deterministicId } = require('./fortigate-importer');

const POLICY_VERSION = 'inventory-analysis-v1';

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

function classifyObservation(observation) {
  const type = normalized(observation.device_class_raw);
  const manufacturer = normalized(observation.manufacturer);
  const os = normalized(observation.os_family);
  const hostname = normalized(observation.hostname_raw);
  const combined = `${type} ${manufacturer} ${os} ${hostname}`;

  if (/firewall|fortigate|security appliance/.test(combined)) return 'SECURITY';
  if (/router|switch|access point|wireless controller|mikrotik|routeros/.test(combined)) return 'NETWORK';
  if (/server/.test(type) || /windows server|esxi|proxmox|hyper-v/.test(combined)) return 'SERVER';
  if (/virtual machine|vmware virtual|virtualbox/.test(combined)) return 'VIRTUAL_MACHINE';
  if (/printer|multifunction|scanner/.test(type)) return 'PRINTER';
  if (/camera|nvr|dvr|dahua|hikvision/.test(combined)) return 'CCTV';
  if (/phone|tablet|iphone|android|ios/.test(combined)) return 'MOBILE';
  if (/laptop|notebook/.test(type)) return 'LAPTOP';
  if (/computer|desktop|workstation/.test(type)) return 'WORKSTATION';
  if (/television|tv|iot|sensor|embedded/.test(combined)) return 'IOT';
  return 'OTHER';
}

function occurrenceMap(observations, field) {
  const counts = new Map();
  for (const observation of observations) {
    const key = normalized(observation[field]);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function analyzeObservation(observation, duplicateIps, duplicateHostnames) {
  const flags = new Set(JSON.parse(observation.quality_flags_json || '[]'));
  const reasons = [];
  const ipKey = normalized(observation.ip_value);
  const hostnameKey = normalized(observation.hostname_raw);
  const duplicateIp = ipKey && (duplicateIps.get(ipKey) || 0) > 1;
  const duplicateHostname = hostnameKey && (duplicateHostnames.get(hostnameKey) || 0) > 1;
  const locallyAdministered = flags.has('LOCALLY_ADMINISTERED_MAC');
  const missingIp = !ipKey;
  const missingHostname = !hostnameKey;

  if (duplicateIp) reasons.push('DUPLICATE_IP_IN_SNAPSHOT');
  if (duplicateHostname) reasons.push('DUPLICATE_HOSTNAME_IN_SNAPSHOT');
  if (locallyAdministered) reasons.push('LOCALLY_ADMINISTERED_MAC');
  if (missingIp) reasons.push('MISSING_IP');
  if (missingHostname) reasons.push('MISSING_HOSTNAME');
  if (flags.has('UNMAPPED_INTERFACE')) reasons.push('UNMAPPED_INTERFACE');

  let identityStrength = 'MEDIUM';
  let proposedAction = 'NEW_ASSET_REVIEW';
  let confidence = 0.65;

  if (duplicateIp || duplicateHostname) {
    identityStrength = locallyAdministered ? 'LOW' : 'MEDIUM';
    proposedAction = 'CONFLICT_REVIEW';
    confidence = locallyAdministered ? 0.25 : 0.45;
  } else if (locallyAdministered) {
    identityStrength = 'LOW';
    proposedAction = 'EPHEMERAL_REVIEW';
    confidence = missingHostname ? 0.2 : 0.35;
  } else if (missingIp && missingHostname) {
    identityStrength = 'INSUFFICIENT';
    proposedAction = 'INSUFFICIENT_EVIDENCE';
    confidence = 0.15;
  } else if (missingIp || missingHostname) {
    confidence = 0.5;
  }

  return {
    provisionalAssetClass: classifyObservation(observation),
    identityStrength,
    proposedAction,
    confidence,
    reasons,
  };
}

function increment(record, key) {
  record[key] = (record[key] || 0) + 1;
}

function analyzeSnapshot({ db, snapshotId, analyzedAt = new Date().toISOString(), policyVersion = POLICY_VERSION }) {
  if (!db) throw new Error('db is required');
  if (!snapshotId) throw new Error('snapshotId is required');

  const snapshot = db.prepare(`
    SELECT id, processing_status AS status
    FROM cyber_source_snapshots WHERE id = ?
  `).get(snapshotId);
  if (!snapshot) throw new Error('snapshot not found');
  if (snapshot.status !== 'SUCCESS') throw new Error('snapshot must be SUCCESS before analysis');

  const analysisRunId = deterministicId('analysis', `${snapshotId}:${policyVersion}`);
  const previous = db.prepare(`
    SELECT id, status, summary_json AS summaryJson
    FROM cyber_inventory_analysis_runs
    WHERE snapshot_id = ? AND policy_version = ?
  `).get(snapshotId, policyVersion);
  if (previous) {
    return {
      status: 'ALREADY_ANALYZED',
      analysisRunId: previous.id,
      summary: JSON.parse(previous.summaryJson || '{}'),
    };
  }

  const observations = db.prepare(`
    SELECT id, ip_value, mac_value, hostname_raw, manufacturer, os_family,
           device_class_raw, quality_flags_json
    FROM cyber_asset_observations
    WHERE snapshot_id = ?
    ORDER BY id
  `).all(snapshotId);
  const duplicateIps = occurrenceMap(observations, 'ip_value');
  const duplicateHostnames = occurrenceMap(observations, 'hostname_raw');
  const insertRun = db.prepare(`
    INSERT INTO cyber_inventory_analysis_runs(
      id, snapshot_id, policy_version, status, started_at
    ) VALUES (?, ?, ?, 'PROCESSING', ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO cyber_inventory_analysis_items(
      analysis_run_id, observation_id, provisional_asset_class,
      identity_strength, proposed_action, confidence, reason_codes_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const completeRun = db.prepare(`
    UPDATE cyber_inventory_analysis_runs
    SET status = 'SUCCESS', completed_at = ?, summary_json = ?
    WHERE id = ?
  `);

  const summary = {
    total: observations.length,
    byClass: {},
    byIdentityStrength: {},
    byAction: {},
    reasonCounts: {},
  };

  db.exec('BEGIN IMMEDIATE');
  try {
    insertRun.run(analysisRunId, snapshotId, policyVersion, analyzedAt);
    for (const observation of observations) {
      const item = analyzeObservation(observation, duplicateIps, duplicateHostnames);
      insertItem.run(
        analysisRunId,
        observation.id,
        item.provisionalAssetClass,
        item.identityStrength,
        item.proposedAction,
        item.confidence,
        JSON.stringify(item.reasons),
        analyzedAt,
      );
      increment(summary.byClass, item.provisionalAssetClass);
      increment(summary.byIdentityStrength, item.identityStrength);
      increment(summary.byAction, item.proposedAction);
      for (const reason of item.reasons) increment(summary.reasonCounts, reason);
    }
    completeRun.run(analyzedAt, JSON.stringify(summary), analysisRunId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return { status: 'SUCCESS', analysisRunId, summary };
}

module.exports = {
  POLICY_VERSION,
  analyzeObservation,
  analyzeSnapshot,
  classifyObservation,
};
